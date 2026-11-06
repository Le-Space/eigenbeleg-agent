// SPDX-License-Identifier: AGPL-3.0-or-later
// The browser's x402 signer: instead of holding a key, it asks the connected
// NEAR wallet to sign one NEP-366 delegate action (one USDC ft_transfer), and
// checks what comes back before it is sent. See docs/delegate-actions.md.

import { decodeSignedDelegateB64, parseFtTransferArgs } from '@x402/near';
import { t } from './i18n.js';

export const FT_TRANSFER_GAS = '30000000000000'; // 30 Tgas
export const ONE_YOCTO = '1';

/**
 * The one delegate action the payment needs, in NEAR Connect's action format.
 * @param {{ asset: string, payTo: string, amount: string }} r the accepted payment requirements
 */
export function transferDelegate(r) {
	return {
		receiverId: r.asset,
		actions: [
			{
				type: 'FunctionCall',
				params: { methodName: 'ft_transfer', args: { receiver_id: r.payTo, amount: r.amount }, gas: FT_TRANSFER_GAS, deposit: ONE_YOCTO }
			}
		]
	};
}

/**
 * Throws unless the wallet signed exactly the transfer that was asked for, by
 * the connected account, with a valid signature.
 * @param {string} b64 base64 Borsh SignedDelegate
 * @param {{ asset: string, payTo: string, amount: string }} r
 * @param {string} accountId
 */
export function checkSignedDelegate(b64, r, accountId) {
	const d = decodeSignedDelegateB64(b64);
	const da = d.delegate;
	const fail = (/** @type {string} */ why) => {
		throw new Error(t('mismatch', { why }));
	};
	if (!d.verifySignature()) fail(t('whySignature'));
	if (da.senderId !== accountId) fail(t('whySender', { sender: da.senderId }));
	if (da.actionCount !== 1 || !da.functionCall) fail(t('whyActions'));
	const fc = /** @type {NonNullable<typeof da.functionCall>} */ (da.functionCall);
	if (fc.methodName !== 'ft_transfer') fail(fc.methodName);
	if (da.receiverId !== r.asset) fail(t('whyToken'));
	const args = parseFtTransferArgs(fc.args);
	if (args.receiver_id !== r.payTo) fail(t('whyRecipient'));
	if (args.amount !== r.amount) fail(t('whyAmount'));
	if (fc.deposit !== 1n) fail(t('whyDeposit'));
	return da;
}

/**
 * A ClientNearSigner for @x402/near backed by a NEAR Connect wallet.
 * @param {object} o
 * @param {import('@hot-labs/near-connect').NearWalletBase} o.wallet
 * @param {string} o.accountId
 * @param {'testnet' | 'mainnet'} o.network
 * @param {() => { asset: string, payTo: string, amount: string } | null} o.confirmed what the user saw and agreed to pay
 * @param {(line: string) => void} [o.say]
 */
export function walletSigner({ wallet, accountId, network, confirmed, say = () => {} }) {
	return {
		/** @param {{ paymentRequirements: any }} input */
		async createSignedDelegateAction({ paymentRequirements: r }) {
			const ok = confirmed();
			if (!ok || ok.asset !== r.asset || ok.payTo !== r.payTo || ok.amount !== r.amount)
				throw new Error(t('otherPayment'));
			say(t('signPlease'));
			const res = await wallet.signDelegateActions({ network, signerId: accountId, delegateActions: [transferDelegate(r)] });
			const b64 = res?.signedDelegateActions?.[0];
			if (typeof b64 !== 'string') throw new Error(t('noDelegate'));
			checkSignedDelegate(b64, r, accountId);
			say(t('signed'));
			return b64;
		}
	};
}
