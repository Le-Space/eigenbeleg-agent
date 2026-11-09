// SPDX-License-Identifier: AGPL-3.0-or-later
// The agent's wallet for x402: a NEAR account that signs one NEP-366
// delegate action per payment (one USDC ft_transfer); the API's relayer
// submits it, so the agent needs USDC but no NEAR. And, when it has one, an
// EVM key that signs one EIP-3009 transferWithAuthorization of USDC on Base
// or Ethereum, likewise gasless. Of the networks a 402 offers, it takes the
// first it can pay on; PAY_PREFER puts one first.
//
// What it can't do without the person who runs it: spend above the budget
// per payment (spend controls of the x402 client), pay anything but the
// assets and networks it was set up for, or move funds otherwise – it only
// signs the exact transfer a challenge asks for.

import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { createClientNearSigner } from '@x402/near';
import { ExactNearScheme } from '@x402/near/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { ExactEvmScheme } from '@x402/evm/exact/client';

import { nearSecretKey } from './keys.js';

/** The EVM networks the agent can pay on with one key. */
export const EVM_NETWORKS = ['eip155:8453', 'eip155:1'];

/**
 * @param {object} o
 * @param {string} [o.accountId] the NEAR account; none: no NEAR payments
 * @param {string} [o.secretKey] else from the near-cli keychain
 * @param {'near:testnet' | 'near:mainnet'} [o.network]
 * @param {string} [o.evmKey] 0x private key for USDC on Base and Ethereum; none: no EVM payments
 * @param {string} [o.prefer] the network to pay on when the 402 offers several, e.g. "eip155:8453"
 * @param {string} o.budget max per payment, e.g. "$0.25"
 * @param {(line: string) => void} [o.say]
 */
export async function createPayer({ accountId, secretKey, network = 'near:testnet', evmKey, prefer, budget, say = console.log }) {
	/** @type {{ payment?: any, settlement?: any }} */
	const last = {};
	// Of the accepts the agent has a scheme for, the preferred network first, else the API's order.
	const client = new x402Client((/** @type {number} */ version, /** @type {any[]} */ accepts) => {
		const payable = accepts.filter((a) => a.scheme === 'exact' && networks.includes(a.network));
		const pick = payable.find((a) => a.network === prefer) ?? payable[0];
		if (!pick) throw new Error(`the API takes ${accepts.map((a) => a.network).join(', ')}; this agent pays on ${networks.join(', ')} (x402 v${version})`);
		return pick;
	});
	/** @type {string[]} */
	const networks = [];
	if (accountId) {
		const key = await nearSecretKey(accountId, /** @type {any} */ (network.split(':')[1]), secretKey);
		client.register(network, new ExactNearScheme(createClientNearSigner({ accountId, secretKey: key })));
		networks.push(network);
	}
	if (evmKey) {
		const [{ privateKeyToAccount }, { createWalletClient, http, publicActions }, chains] = await Promise.all([import('viem/accounts'), import('viem'), import('viem/chains')]);
		const account = privateKeyToAccount(/** @type {`0x${string}`} */ (evmKey));
		for (const [n, chain] of [['eip155:8453', chains.base], ['eip155:1', chains.mainnet]]) {
			const wallet = createWalletClient({ account, chain: /** @type {any} */ (chain), transport: http() }).extend(publicActions);
			client.register(/** @type {any} */ (n), new ExactEvmScheme(toClientEvmSigner(/** @type {any} */ (wallet))));
			networks.push(/** @type {string} */ (n));
		}
	}
	if (!networks.length) throw new Error('the agent needs AGENT_ACCOUNT_ID (NEAR) or AGENT_EVM_KEY (Base, Ethereum) to pay');
	client
		.setSpendControls({ maxAmountPerPayment: budget })
		.onBeforePaymentCreation(async (ctx) => {
			const r = /** @type {any} */ (ctx).selectedRequirements ?? /** @type {any} */ (ctx).requirements;
			if (r) {
				last.payment = { amount: r.amount, asset: r.asset, network: r.network, payTo: r.payTo };
				say(`402: the API asks ${Number(r.amount) / 1e6} USDC to ${r.payTo} on ${r.network}; budget per payment ${budget}. Signing the transfer (gasless) …`);
			}
		});
	return { paidFetch: wrapFetchWithPayment(fetch, client), last: () => last };
}
