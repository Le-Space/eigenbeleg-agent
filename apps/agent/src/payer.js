// The agent's wallet for x402: a NEAR account that signs one NEP-366
// delegate action per payment (one USDC ft_transfer); the API's relayer
// submits it, so the agent needs USDC but no NEAR.
//
// What it can't do without the person who runs it: spend above the budget
// per payment (spend controls of the x402 client), pay anything but the
// assets and networks it was set up for, or move funds otherwise – it only
// signs the exact transfer a challenge asks for.

import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { createClientNearSigner } from '@x402/near';
import { ExactNearScheme } from '@x402/near/exact/client';

import { nearSecretKey } from './keys.js';

/**
 * @param {object} o
 * @param {string} o.accountId
 * @param {string} [o.secretKey] else from the near-cli keychain
 * @param {'near:testnet' | 'near:mainnet'} [o.network]
 * @param {string} o.budget max per payment, e.g. "$0.25"
 * @param {(line: string) => void} [o.say]
 */
export async function createPayer({ accountId, secretKey, network = 'near:testnet', budget, say = console.log }) {
	const key = await nearSecretKey(accountId, /** @type {any} */ (network.split(':')[1]), secretKey);
	const signer = createClientNearSigner({ accountId, secretKey: key });
	/** @type {{ payment?: any, settlement?: any }} */
	const last = {};
	const client = new x402Client()
		.register(network, new ExactNearScheme(signer))
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
