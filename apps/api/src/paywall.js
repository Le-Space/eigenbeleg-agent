// SPDX-License-Identifier: AGPL-3.0-or-later
// The x402 paywall in front of POST /eigenbeleg.
//
//   x402  x402 `exact`, USDC, on one or more networks (PAY_NETWORKS); the
//         payer picks one from the 402. This server is its own facilitator:
//         - near:mainnet / near:testnet: the client signs a NEP-366 delegate
//           action for one USDC ft_transfer to PAY_TO; a relayer account
//           submits it, so the payer needs no NEAR for gas.
//           (x402 spec: specs/schemes/exact/scheme_exact_near.md)
//         - eip155:8453 (Base), eip155:1 (Ethereum): the client signs an
//           EIP-3009 transferWithAuthorization of USDC to PAY_TO_EVM; this
//           server's EVM relayer (EVM_RELAYER_KEY) submits it and pays the
//           gas, so the payer needs no ETH. Ethereum's gas costs more than a
//           cheap document, so each network may have its own price.
//         `near` is the old name of this mode with one NEAR network.
//         - a chain's own coin (DOI on Doichain, onchain.js; DOI_PAY_TO): a plain
//           transaction the payer signs and this server broadcasts, scheme
//           `onchain`. Final only after a block, so the answer is 202 first;
//           only on POST /eigenbeleg, not for subscriptions.
//   ping  PingPay Agent Pay: the agent pays USDC on Base (or another origin
//         chain), NEAR Intents settles to the NEAR recipient configured in the
//         Ping dashboard. Mainnet only: NEAR Intents has no testnet.
//   none  no payment, for local development and the tests; the server says so
//         on every response.

import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { x402Facilitator } from '@x402/core/facilitator';
import { createFacilitatorNearSigner } from '@x402/near';
import { ExactNearScheme as NearServerScheme } from '@x402/near/exact/server';
import { ExactNearScheme as NearFacilitatorScheme } from '@x402/near/exact/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { ExactEvmScheme as EvmServerScheme } from '@x402/evm/exact/server';
import { ExactEvmScheme as EvmFacilitatorScheme } from '@x402/evm/exact/facilitator';

import { coinPriceFor, priceFor, timesMonths } from '@eigenbeleg/pipeline/prices';

import { nearSecretKey } from './keys.js';
import { checkOnchain, checkPayments } from './release.js';
import { createOnchain } from './onchain.js';
import { MONTHS, MONTH_CHOICES, ROUTE as SUBSCRIBE_ROUTE, routeFor } from './subscriptions.js';
import { discoveryExtensions } from './describe.js';

export const ROUTE = 'POST /eigenbeleg';
export const DESCRIPTION = 'Eigenbeleg (PDF/A + CSV) for the payments of own blockchain addresses in a period';
export const SUBSCRIBE_DESCRIPTION = `Subscription: ${MONTHS} monthly Kontoauszüge by mail, paid once`;
/** @param {number} months */
export const subscribeDescription = (months) => `Subscription: ${months} monthly Kontoauszüge by mail, paid once`;

/**
 * The subscription's price: `months` times the single price, "$0.10" → "$1.20" for a year.
 * The plain route sells MONTHS (PRICE_SUBSCRIPTION may set it apart); the route per months
 * always sells at months × the price.
 *
 * @param {string} price
 * @param {number} [months]
 */
export function subscriptionPriceOf(price, months = MONTHS) {
	return timesMonths(price, months);
}

/** The networks this server can take USDC on, and what the 402 and GET / call them. */
export const NETWORKS = {
	'near:mainnet': { name: 'NEAR', asset: 'USDC (NEP-141)', family: 'near' },
	// In PAY_NETWORKS: development and tests only (EIGENBELEG_DEV_TESTNET=1; a production build refuses it, release.js).
	// Production takes testnet USDC only on its own test route, for testnet data (createTestnetPaywall).
	'near:testnet': { name: 'NEAR testnet', asset: 'USDC (NEP-141, testnet)', family: 'near', testnet: true },
	'eip155:8453': { name: 'Base', asset: 'USDC (ERC-20, EIP-3009)', family: 'evm', chain: 'base', alchemy: 'base-mainnet' },
	'eip155:1': { name: 'Ethereum', asset: 'USDC (ERC-20, EIP-3009)', family: 'evm', chain: 'mainnet', alchemy: 'eth-mainnet' }
};

/**
 * @param {object} c
 * @param {'x402' | 'near' | 'ping' | 'none'} c.mode
 * @param {string} [c.price] e.g. "$0.10" (USDC), for every network without its own
 * @param {Record<string, string>} [c.prices] per network, e.g. { 'eip155:1': '$1.00' }
 * @param {string} [c.subscriptionPrice] the subscription's price (POST /eigenbeleg/subscribe); default MONTHS × the price
 * @param {Record<string, string>} [c.subscriptionPrices] per network
 * @param {string[]} [c.networks] the networks to take USDC on (keys of NETWORKS); default: [c.network]
 * @param {'near:testnet' | 'near:mainnet'} [c.network] the old single-network setting
 * @param {string} [c.payTo] NEAR account that receives the USDC
 * @param {string} [c.relayerId] NEAR account that submits the delegate action and pays its gas
 * @param {string} [c.relayerKey] its secret key; else read from the near-cli keychain
 * @param {string} [c.rpcUrl] a NEAR RPC instead of the default
 * @param {string} [c.payToEvm] the 0x address that receives the USDC on Base and Ethereum
 * @param {string} [c.evmRelayerKey] 0x private key of the account that submits EIP-3009 transfers and pays their gas
 * @param {Record<string, string>} [c.evmRpcUrls] per EVM network, an RPC URL; else Alchemy with alchemyKey, else the chain's public RPC
 * @param {string} [c.alchemyKey]
 * @param {number} [c.timeoutSeconds] how far ahead the payer's signed payment may expire; browser wallets sign with up to 200 NEAR blocks
 * @param {string} [c.pingApiKey]
 * @param {string} [c.pingUrl]
 * @param {string} [c.pingAmountOut] destination USDC base units (>= 200000)
 * @param {object} [c.onchain] a payment in a chain's own coin beside USDC (onchain.js); unset: not offered
 * @param {import('@eigenbeleg/onchain-pay/networks').Network} c.onchain.network
 * @param {string} c.onchain.payTo the address that receives the coin
 * @param {string} [c.onchain.price] a decimal of the coin; default: the published price
 * @param {number} [c.onchain.confirmations] default 1
 * @param {import('./onchain.js').PaymentStore} c.onchain.store
 * @param {string[]} [c.onchain.servers] ElectrumX servers instead of the network's
 * @param {Parameters<typeof createOnchain>[0]['open']} [c.onchain.open] a test's fake server
 * @param {() => Date} [c.onchain.now]
 * @param {boolean} [c.production] a production build (release.js): mainnet payments only
 * @param {boolean} [c.allowTestnet] EIGENBELEG_DEV_TESTNET=1: testnet payments, outside production only
 * @returns {Promise<{ middleware: import('express').RequestHandler | null, info: Record<string, unknown>, step?: import('express').RequestHandler }>}
 */
export async function createPaywall(c) {
	const given = c.networks?.length ? c.networks : c.network ? [c.network] : [];
	const rpcUrls = [c.rpcUrl, ...Object.values(c.evmRpcUrls ?? {})].filter((u) => typeof u === 'string' && u !== '');
	checkPayments({ production: !!c.production, allowTestnet: !!c.allowTestnet, mode: c.mode, networks: c.mode === 'ping' ? [] : given, rpcUrls: /** @type {string[]} */ (rpcUrls) });
	/** @type {ReturnType<typeof createOnchain> | null} */
	let onchain = null;
	if (c.onchain) {
		const { network } = c.onchain;
		const published = coinPriceFor(network.id);
		const price = c.onchain.price ?? published;
		if (price === undefined) throw new Error(`${network.symbol}_PAY_TO is set, but no price: PRICE_${network.symbol} (development), or a published one in packages/pipeline/src/prices.js`);
		const confirmations = c.onchain.confirmations ?? 1;
		checkOnchain({ production: !!c.production, mode: c.mode, symbol: network.symbol, price, published, confirmations, servers: c.onchain.servers?.length ? c.onchain.servers : network.electrum });
		onchain = createOnchain({ ...c.onchain, price, confirmations });
	}
	if (c.mode === 'none') return { middleware: null, info: { mode: 'none', note: 'no payment: development mode' } };

	if (c.mode === 'ping') {
		if (!c.pingApiKey) throw new Error('PAYWALL=ping needs PING_API_KEY');
		const { agentPayX402 } = await import('@pingpay/agentpay-middleware');
		const amountOut = c.pingAmountOut ?? '200000';
		const subscriptionOut = String(Number(amountOut) * MONTHS);
		return {
			middleware: /** @type {any} */ (
				agentPayX402({
					apiKey: c.pingApiKey,
					facilitatorUrl: c.pingUrl ?? 'https://pay.pingpay.io/agentpay/x402',
					routes: {
						[ROUTE]: { amountOut, description: DESCRIPTION },
						[SUBSCRIBE_ROUTE]: { amountOut: subscriptionOut, description: SUBSCRIBE_DESCRIPTION },
						...Object.fromEntries(MONTH_CHOICES.map((m) => [routeFor(m), { amountOut: String(Number(amountOut) * m), description: subscribeDescription(m) }]))
					}
				})
			),
			info: { mode: 'ping', facilitator: c.pingUrl ?? 'https://pay.pingpay.io/agentpay/x402', amountOut, asset: 'USDC (settles to the NEAR recipient set in Ping)', network: 'mainnet', subscription: { amountOut: subscriptionOut, months: MONTHS, perMonths: { route: `${SUBSCRIBE_ROUTE}/<months>`, months: `1 to ${MONTHS}`, amountOut: 'months × amountOut' } } }
		};
	}

	if (c.mode !== 'x402' && c.mode !== 'near') throw new Error(`unknown PAYWALL ${c.mode}`);
	if (!given.length) throw new Error('PAY_NETWORKS: name the networks to take USDC on, e.g. near:mainnet,eip155:8453');
	const networks = [...new Set(given)];
	for (const n of networks) if (!Object.hasOwn(NETWORKS, n)) throw new Error(`PAY_NETWORKS: unknown network ${n}; known: ${Object.keys(NETWORKS).join(', ')}`);
	// The published prices (@eigenbeleg/pipeline/prices), unless PRICE / PRICE_<NETWORK> set others.
	const priceOf = (/** @type {string} */ n) => c.prices?.[n] ?? c.price ?? priceFor(n);
	const subscriptionPriceFor = (/** @type {string} */ n) => c.subscriptionPrices?.[n] ?? c.subscriptionPrice ?? subscriptionPriceOf(priceOf(n));
	// A production build charges what the page and /llms.txt publish, nothing else: a price
	// change is a change of @eigenbeleg/pipeline/prices, so page and API change together.
	if (c.production) {
		for (const n of networks) {
			if (priceOf(n) !== priceFor(n)) throw new Error(`production build: the price on ${n} is ${priceOf(n)}, the published one ${priceFor(n)}. Leave PRICE and PRICE_* unset; prices change in packages/pipeline/src/prices.js.`);
			if (subscriptionPriceFor(n) !== subscriptionPriceOf(priceFor(n))) throw new Error(`production build: the subscription on ${n} costs ${subscriptionPriceFor(n)}, the published ${subscriptionPriceOf(priceFor(n))}. Leave PRICE_SUBSCRIPTION* unset.`);
		}
	}
	const timeout = c.timeoutSeconds ?? 300;

	const facilitator = new x402Facilitator();
	const server = new x402ResourceServer({
		verify: (p, r) => facilitator.verify(p, r),
		settle: (p, r) => facilitator.settle(p, r),
		getSupported: async () => facilitator.getSupported()
	});
	/** @type {{ scheme: 'exact', price: string, network: string, payTo: string, maxTimeoutSeconds: number }[]} */
	const accepts = [];
	/** The same networks and recipients, at the subscription's price. @type {typeof accepts} */
	const subscriptionAccepts = [];
	/** @type {Record<string, string>} */
	const relayers = {};

	for (const network of networks.filter((n) => NETWORKS[/** @type {keyof typeof NETWORKS} */ (n)].family === 'near')) {
		if (!c.payTo) throw new Error(`${network} needs PAY_TO (the NEAR account that receives the USDC)`);
		if (!c.relayerId) throw new Error(`${network} needs RELAYER_ACCOUNT_ID (pays the gas of the payment)`);
		const short = /** @type {'mainnet' | 'testnet'} */ (network.split(':')[1]);
		const secretKey = await nearSecretKey(c.relayerId, short, c.relayerKey);
		const rpcUrls = c.rpcUrl ? { [network]: c.rpcUrl } : undefined;
		const signer = createFacilitatorNearSigner({ relayers: [{ accountId: c.relayerId, secretKey }], rpcUrls });
		facilitator.register(/** @type {any} */ (network), new NearFacilitatorScheme(signer));
		server.register(/** @type {any} */ (network), new NearServerScheme());
		accepts.push({ scheme: 'exact', price: priceOf(network), network, payTo: c.payTo, maxTimeoutSeconds: timeout });
		subscriptionAccepts.push({ scheme: 'exact', price: subscriptionPriceFor(network), network, payTo: c.payTo, maxTimeoutSeconds: timeout });
		relayers[network] = c.relayerId;
	}

	const evm = networks.filter((n) => NETWORKS[/** @type {keyof typeof NETWORKS} */ (n)].family === 'evm');
	if (evm.length) {
		if (!c.payToEvm || !/^0x[0-9a-fA-F]{40}$/.test(c.payToEvm)) throw new Error(`${evm.join(', ')} need PAY_TO_EVM (the 0x address that receives the USDC)`);
		if (!c.evmRelayerKey || !/^0x[0-9a-fA-F]{64}$/.test(c.evmRelayerKey)) throw new Error(`${evm.join(', ')} need EVM_RELAYER_KEY (0x private key of the account that pays the gas)`);
		const [{ createWalletClient, http, publicActions }, chains, { privateKeyToAccount }] = await Promise.all([import('viem'), import('viem/chains'), import('viem/accounts')]);
		const account = privateKeyToAccount(/** @type {`0x${string}`} */ (c.evmRelayerKey));
		for (const network of evm) {
			const meta = NETWORKS[/** @type {'eip155:8453' | 'eip155:1'} */ (network)];
			const chain = chains[meta.chain];
			const rpc = c.evmRpcUrls?.[network] ?? (c.alchemyKey ? `https://${meta.alchemy}.g.alchemy.com/v2/${c.alchemyKey}` : undefined);
			const client = createWalletClient({ account, chain, transport: http(rpc) }).extend(publicActions);
			const signer = toFacilitatorEvmSigner(/** @type {any} */ (client));
			facilitator.register(/** @type {any} */ (network), new EvmFacilitatorScheme(signer));
			server.register(/** @type {any} */ (network), new EvmServerScheme());
			accepts.push({ scheme: 'exact', price: priceOf(network), network, payTo: c.payToEvm, maxTimeoutSeconds: timeout });
			subscriptionAccepts.push({ scheme: 'exact', price: subscriptionPriceFor(network), network, payTo: c.payToEvm, maxTimeoutSeconds: timeout });
			relayers[network] = account.address;
		}
	}

	// The route per months (1 to MONTHS) always sells at months × the price: the same networks and recipients.
	const monthRoutes = Object.fromEntries(
		MONTH_CHOICES.map((m) => [routeFor(m), { accepts: accepts.map((a) => ({ ...a, price: subscriptionPriceOf(a.price, m) })), description: subscribeDescription(m), mimeType: 'application/json' }])
	);
	// What to send, in every 402 (describe.js): x402's discovery extension. Only on the one-off
	// route: a subscription's body carries a mail address, and nobody should try it out from a catalogue.
	const { bazaarResourceServerExtension } = await import('@x402/extensions/bazaar');
	server.registerExtension(bazaarResourceServerExtension);
	const extensions = await discoveryExtensions();
	// The coin's offer stands only in the one-off route's 402: a subscription is not sold for it yet.
	if (onchain) {
		facilitator.register(/** @type {any} */ (onchain.network.caip2), /** @type {any} */ (onchain.facilitatorScheme));
		server.register(/** @type {any} */ (onchain.network.caip2), /** @type {any} */ (onchain.serverScheme));
	}
	const routes = { [ROUTE]: { accepts: onchain ? [...accepts, onchain.accept] : accepts, description: DESCRIPTION, mimeType: 'application/pdf', extensions }, [SUBSCRIBE_ROUTE]: { accepts: subscriptionAccepts, description: SUBSCRIBE_DESCRIPTION, mimeType: 'application/json' }, ...monthRoutes };
	return {
		middleware: /** @type {any} */ (paymentMiddleware(/** @type {any} */ (routes), server)),
		...(onchain ? { step: onchain.step } : {}),
		info: {
			mode: 'x402',
			scheme: 'exact',
			// Kept for readers of the single-network shape (the first network).
			network: accepts[0].network,
			price: accepts[0].price,
			asset: NETWORKS[/** @type {keyof typeof NETWORKS} */ (accepts[0].network)].asset,
			payTo: accepts[0].payTo,
			gasless: true,
			accepts: accepts.map((a) => {
				const meta = NETWORKS[/** @type {keyof typeof NETWORKS} */ (a.network)];
				return { network: a.network, name: meta.name, asset: meta.asset, price: a.price, payTo: a.payTo, relayer: relayers[a.network], gasless: true };
			}),
			// A chain's own coin, where offered: its own scheme, two steps, no relayer (onchain.js).
			...(onchain ? { coins: [onchain.info] } : {}),
			subscription: {
				months: MONTHS,
				price: subscriptionAccepts[0].price,
				accepts: subscriptionAccepts.map((a) => ({ network: a.network, price: a.price })),
				perMonths: { route: `${SUBSCRIBE_ROUTE}/<months>`, months: `1 to ${MONTHS}`, price: `months × the price (${subscriptionPriceOf(accepts[0].price, 1)} per month on ${accepts[0].network})` }
			}
		}
	};
}

/** The test route: the same Eigenbeleg, paid with testnet USDC, for testnet data only (app.js). */
export const TESTNET_ROUTE = 'POST /testnet/eigenbeleg';
export const TESTNET_DESCRIPTION = 'TESTNET, test only, no value: an Eigenbeleg of testnet addresses, marked TESTNET, paid with testnet USDC';
/** A NEAR testnet account: named (….testnet) or implicit (64 hex). */
const TESTNET_ACCOUNT = /^([a-z0-9_-]+\.)*[a-z0-9_-]+\.testnet$|^[0-9a-f]{64}$/;

/**
 * The paywall of the test route, beside the main one: near:testnet only, its own recipient and
 * relayer, never a mainnet network. It can run in production too, because what it sells is only
 * ever testnet data (app.js refuses anything else before the 402), marked TESTNET in every PDF.
 * Without TESTNET_PAY_TO there is none, and the test route is off.
 *
 * @param {object} c
 * @param {string} [c.payTo] TESTNET_PAY_TO: the NEAR testnet account that receives the testnet USDC
 * @param {string} [c.relayerId] TESTNET_RELAYER_ACCOUNT_ID: the testnet account that pays the gas
 * @param {string} [c.relayerKey] TESTNET_RELAYER_SECRET_KEY; else read from the near-cli keychain
 * @param {string} [c.rpcUrl] TESTNET_NEAR_RPC_URL: a NEAR testnet RPC instead of the default
 * @param {number} [c.timeoutSeconds]
 * @returns {Promise<{ middleware: import('express').RequestHandler, info: Record<string, unknown> } | null>}
 */
export async function createTestnetPaywall(c) {
	if (!c.payTo) return null;
	const network = 'near:testnet';
	if (!TESTNET_ACCOUNT.test(c.payTo)) throw new Error('TESTNET_PAY_TO must be a NEAR testnet account (….testnet)');
	if (!c.relayerId || !TESTNET_ACCOUNT.test(c.relayerId)) throw new Error('the test route needs TESTNET_RELAYER_ACCOUNT_ID, a NEAR testnet account (….testnet) that pays the gas');
	if (c.rpcUrl && !/testnet/i.test(c.rpcUrl)) throw new Error('TESTNET_NEAR_RPC_URL must be a NEAR testnet RPC');
	const secretKey = await nearSecretKey(c.relayerId, 'testnet', c.relayerKey);
	const facilitator = new x402Facilitator();
	const signer = createFacilitatorNearSigner({ relayers: [{ accountId: c.relayerId, secretKey }], rpcUrls: c.rpcUrl ? { [network]: c.rpcUrl } : undefined });
	facilitator.register(/** @type {any} */ (network), new NearFacilitatorScheme(signer));
	const server = new x402ResourceServer({
		verify: (p, r) => facilitator.verify(p, r),
		settle: (p, r) => facilitator.settle(p, r),
		getSupported: async () => facilitator.getSupported()
	});
	server.register(/** @type {any} */ (network), new NearServerScheme());
	const price = priceFor(network);
	const accepts = [{ scheme: 'exact', price, network, payTo: c.payTo, maxTimeoutSeconds: c.timeoutSeconds ?? 300 }];
	return {
		middleware: /** @type {any} */ (paymentMiddleware(/** @type {any} */ ({ [TESTNET_ROUTE]: { accepts, description: TESTNET_DESCRIPTION, mimeType: 'application/pdf' } }), server)),
		info: testnetInfo({ price, payTo: c.payTo, relayer: c.relayerId })
	};
}

/**
 * What GET / and /llms.txt say about the test route.
 * @param {{ price: string, payTo: string, relayer: string }} o
 */
export function testnetInfo({ price, payTo, relayer }) {
	const meta = NETWORKS['near:testnet'];
	return {
		mode: 'x402',
		testnet: true,
		endpoint: TESTNET_ROUTE,
		accepts: [{ network: 'near:testnet', name: meta.name, asset: meta.asset, price, payTo, relayer, gasless: true }]
	};
}
