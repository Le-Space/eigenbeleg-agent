// SPDX-License-Identifier: AGPL-3.0-or-later
// The x402 paywall in front of POST /eigenbeleg.
//
//   near  x402 `exact` on NEAR (testnet by default): the client signs a
//         NEP-366 delegate action for one USDC ft_transfer to PAY_TO; this
//         server's own facilitator checks it and a relayer account submits it,
//         so the payer needs no NEAR for gas. Settles straight to a NEAR
//         account. (x402 spec: specs/schemes/exact/scheme_exact_near.md)
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

import { nearSecretKey } from './keys.js';

export const ROUTE = 'POST /eigenbeleg';
export const DESCRIPTION = 'Eigenbeleg (PDF/A + CSV) for the payments of own blockchain addresses in a period';

/**
 * @param {object} c
 * @param {'near' | 'ping' | 'none'} c.mode
 * @param {string} [c.price] e.g. "$0.10" (USDC)
 * @param {'near:testnet' | 'near:mainnet'} [c.network]
 * @param {string} [c.payTo] NEAR account that receives the USDC
 * @param {string} [c.relayerId] NEAR account that submits the delegate action and pays its gas
 * @param {string} [c.relayerKey] its secret key; else read from the near-cli keychain
 * @param {string} [c.rpcUrl]
 * @param {string} [c.pingApiKey]
 * @param {string} [c.pingUrl]
 * @param {string} [c.pingAmountOut] destination USDC base units (>= 200000)
 * @returns {Promise<{ middleware: import('express').RequestHandler | null, info: Record<string, unknown> }>}
 */
export async function createPaywall(c) {
	if (c.mode === 'none') return { middleware: null, info: { mode: 'none', note: 'no payment: development mode' } };

	if (c.mode === 'ping') {
		if (!c.pingApiKey) throw new Error('PAYWALL=ping needs PING_API_KEY');
		const { agentPayX402 } = await import('@pingpay/agentpay-middleware');
		const amountOut = c.pingAmountOut ?? '200000';
		return {
			middleware: /** @type {any} */ (
				agentPayX402({
					apiKey: c.pingApiKey,
					facilitatorUrl: c.pingUrl ?? 'https://pay.pingpay.io/agentpay/x402',
					routes: { [ROUTE]: { amountOut, description: DESCRIPTION } }
				})
			),
			info: { mode: 'ping', facilitator: c.pingUrl ?? 'https://pay.pingpay.io/agentpay/x402', amountOut, asset: 'USDC (settles to the NEAR recipient set in Ping)', network: 'mainnet' }
		};
	}

	if (c.mode !== 'near') throw new Error(`unknown PAYWALL ${c.mode}`);
	const network = c.network ?? 'near:testnet';
	if (!c.payTo) throw new Error('PAYWALL=near needs PAY_TO (the NEAR account that receives the USDC)');
	if (!c.relayerId) throw new Error('PAYWALL=near needs RELAYER_ACCOUNT_ID (pays the gas of the payment)');
	const short = /** @type {'mainnet' | 'testnet'} */ (network.split(':')[1]);
	const secretKey = await nearSecretKey(c.relayerId, short, c.relayerKey);
	const rpcUrls = c.rpcUrl ? { [network]: c.rpcUrl } : undefined;
	const signer = createFacilitatorNearSigner({ relayers: [{ accountId: c.relayerId, secretKey }], rpcUrls });
	const facilitator = new x402Facilitator().register(network, new NearFacilitatorScheme(signer));
	const server = new x402ResourceServer({
		verify: facilitator.verify.bind(facilitator),
		settle: facilitator.settle.bind(facilitator),
		getSupported: async () => facilitator.getSupported()
	}).register(network, new NearServerScheme());
	const price = c.price ?? '$0.10';
	const routes = {
		[ROUTE]: {
			accepts: [{ scheme: 'exact', price, network, payTo: c.payTo, maxTimeoutSeconds: 120 }],
			description: DESCRIPTION,
			mimeType: 'application/pdf'
		}
	};
	return {
		middleware: /** @type {any} */ (paymentMiddleware(/** @type {any} */ (routes), server)),
		info: { mode: 'near', scheme: 'exact', network, price, asset: 'USDC (NEP-141)', payTo: c.payTo, relayer: c.relayerId, gasless: true }
	};
}
