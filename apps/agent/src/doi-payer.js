// SPDX-License-Identifier: AGPL-3.0-or-later
// The agent pays in DOI (Doichain) instead of USDC, where the API offers it
// (scheme `onchain` in the 402; #59). A DOI payment is final only after a
// block, about ten minutes: the API answers 202 until then, and this payer
// waits, saying what for, and asks again at the pace the API names.
//
// Two ways to pay:
//   key   the agent signs a plain transaction from its own DOI key and hands
//         it to the API, which broadcasts it. The key is read by keys.js
//         (environment, a file, or the macOS keychain), goes to the signer
//         and nowhere else.
//   qr    no key here: the API names an address for this one request, the
//         payment URI is shown as a QR code, a person pays with a wallet
//         (DoiWallet: from the send screen), and the payment is found there.
//
// A payment is made once. Stopped while waiting, the same job is run again
// with `resume` (the txid): nothing is paid a second time.

import { DOICHAIN, PaymentError, buildPayment, explorerTx, fromUnits, toUnits, withServer } from '@eigenbeleg/onchain-pay';
import { renderUnicodeCompact } from 'uqr';

export const SCHEME = 'onchain';
const ORDER_HEADER = 'X-Eigenbeleg-Order';
/** After this long without the documents the payer stops waiting; `resume` picks it up. */
export const MAX_WAIT_SECONDS = 2 * 3600;

const decode = (/** @type {string | null} */ header) => {
	try {
		return header ? JSON.parse(Buffer.from(header, 'base64').toString('utf8')) : null;
	} catch {
		return null;
	}
};

/**
 * @param {object} o
 * @param {'key' | 'qr'} o.mode
 * @param {string | Uint8Array} [o.key] the DOI key (WIF), for mode `key`
 * @param {string} o.budget the most to pay per request, a decimal of DOI
 * @param {string} [o.resume] the txid of a payment already made for this very request
 * @param {import('@eigenbeleg/onchain-pay/networks').Network} [o.network]
 * @param {typeof fetch} [o.fetch]
 * @param {<T>(fn: (server: any) => Promise<T>) => Promise<T>} [o.open] runs fn with an ElectrumX server
 * @param {(seconds: number) => Promise<void>} [o.sleep]
 * @param {(uri: string) => string} [o.qr] the URI as a QR code for a terminal
 * @param {() => number} [o.clock] milliseconds
 * @param {(line: string) => void} [o.say]
 */
export function createDoiPayer({ mode, key, budget, resume, network = DOICHAIN, fetch: plain = fetch, open, sleep = (s) => new Promise((r) => setTimeout(r, s * 1000)), qr = renderUnicodeCompact, clock = Date.now, say = console.log }) {
	if (mode === 'key' && !key && !resume) throw new Error('paying in DOI needs a key: AGENT_DOI_KEY, AGENT_DOI_KEY_FILE or AGENT_DOI_KEYCHAIN (or --pay qr to pay from a wallet)');
	if (resume !== undefined && !/^[0-9a-f]{64}$/.test(resume)) throw new Error('--resume takes the txid of the payment (64 hex digits)');
	const max = toUnits(network, budget);
	const run = open ?? ((fn) => withServer(network, fn));
	/** @type {{ payment?: any, settlement?: any }} */
	const last = {};

	/** @type {typeof fetch} */
	const paidFetch = async (url, init = {}) => {
		const ask = (/** @type {Record<string, string>} */ extra = {}) => plain(url, { ...init, headers: { .../** @type {Record<string, string>} */ (init.headers ?? {}), ...extra } });
		const order = mode === 'qr' ? { [ORDER_HEADER]: network.id } : {};
		const first = await ask(order);
		if (first.status !== 402) return first; // no paywall here, or the request itself was refused
		const required = decode(first.headers.get('payment-required'));
		const offer = (required?.accepts ?? []).find((/** @type {any} */ a) => a.scheme === SCHEME && a.network === network.caip2);
		if (!offer) throw new Error(`the API does not take ${network.symbol} for this (its 402 offers ${(required?.accepts ?? []).map((/** @type {any} */ a) => a.network).join(', ') || 'nothing'})`);
		const amount = BigInt(offer.amount);
		const priced = `${fromUnits(network, amount)} ${network.symbol}`;
		if (amount > max) throw new Error(`the API asks ${priced}; the budget per payment is ${budget} ${network.symbol} (AGENT_BUDGET_DOI)`);
		last.payment = { amount: offer.amount, asset: offer.asset, network: offer.network, payTo: offer.payTo };
		const minutes = Math.round((Number(offer.extra?.blockSeconds ?? network.blockSeconds) * Math.max(1, Number(offer.extra?.confirmations ?? 1))) / 60);
		const signature = (/** @type {Record<string, unknown>} */ payload) => ({ ...order, 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify({ x402Version: 2, accepted: offer, payload })).toString('base64') });

		/** What is sent with each repeat: the transaction first, then its txid; from a wallet, nothing. @type {Record<string, unknown>} */
		let payload = {};
		if (resume) {
			payload = { txid: resume };
			say(`Resuming with the payment ${resume}: nothing is paid again.`);
		} else if (mode === 'key') {
			say(`402: the API asks ${priced} to ${offer.payTo}; budget per payment ${budget} ${network.symbol}. Signing the transaction (the API broadcasts it) …`);
			const tx = await run((server) => buildPayment({ network, server, key: /** @type {string} */ (key), to: offer.payTo, amount }));
			say(`Signed ${tx.txid}: ${priced} plus ${fromUnits(network, tx.fee)} ${network.symbol} network fee, from ${tx.from}. Keep the txid: --resume ${tx.txid} continues if this run is stopped.`);
			payload = { transaction: tx.hex };
		} else {
			if (!offer.extra?.ownAddress || !offer.extra?.uri) throw new Error(`the API gives this request no address of its own right now, so a wallet cannot pay it; try again later, or pay with a key (--pay doi)`);
			say(`402: the API asks ${priced} to ${offer.payTo}, an address of this request alone, before ${offer.extra.payBefore}.`);
			say(`Pay with a wallet (DoiWallet: scan from the send screen), then leave this running:\n\n${qr(offer.extra.uri)}\n${offer.extra.uri}\n`);
		}

		const until = clock() + MAX_WAIT_SECONDS * 1000;
		let told = '';
		for (;;) {
			const res = await ask(signature(payload));
			const wait = Math.min(600, Math.max(1, Number(res.headers.get('retry-after') ?? 60) || 60));
			if (res.status === 202) {
				const seen = await res.json();
				if (typeof seen.txid === 'string' && /^[0-9a-f]{64}$/.test(seen.txid)) payload = { txid: seen.txid };
				const line = `Payment seen: ${seen.explorer ?? explorerTx(network, seen.txid)} – ${seen.confirmations} of ${seen.required} confirmation(s); the documents come after that, about ${minutes} minutes after the payment.`;
				if (line !== told) say(line);
				told = line;
			} else if (res.status === 402 && mode === 'qr' && !payload.txid && String(decode(res.headers.get('payment-required'))?.error ?? '').startsWith('onchain_no_payment_yet')) {
				if (!told) say('Waiting for the payment to arrive …');
				told = 'waiting';
			} else if (res.status === 503) {
				say('The API cannot reach the Doichain network right now; the payment stays valid. Asking again …');
			} else {
				if (res.status === 200) last.settlement = decode(res.headers.get('payment-response'));
				else if (payload.txid) say(`The payment ${payload.txid} stays valid for this request for some days: run the same job again with --resume ${payload.txid}.`);
				return res;
			}
			if (clock() + wait * 1000 > until) throw new Error(`still no documents after ${MAX_WAIT_SECONDS / 3600} hours${payload.txid ? `; the payment stays valid: run the same job again with --resume ${payload.txid}` : '; nothing was paid'}`);
			await sleep(wait);
		}
	};
	return { paidFetch, last: () => last };
}

export { PaymentError };
