// SPDX-License-Identifier: AGPL-3.0-or-later
// Payment in a coin of a Bitcoin-like chain (Doichain: DOI), next to USDC (#58).
//
// Such a payment is final only after a block, about ten minutes. So the
// purchase has two steps, and the answer says so:
//
//   1. POST /eigenbeleg → 402. Its accepts list the offer: scheme `onchain`,
//      the network (CAIP-2), the amount in the smallest unit, the address.
//   2. The client signs a transaction that pays the address and sends the
//      same request again with PAYMENT-SIGNATURE, payload { transaction: hex }.
//      This server binds the transaction to the request and broadcasts it.
//   3. → 202: payment seen, txid, explorer link, confirmations, Retry-After.
//   4. The client repeats the request (the same header, or payload { txid })
//      until → 200 with the documents and PAYMENT-RESPONSE.
//
// Two parts do this. A step in front of the x402 middleware answers the 202
// and judges the payment; the x402 middleware knows only "paid" or 402, so a
// registered scheme takes the step's verdict as its verification, and its
// settlement marks the payment as redeemed.
//
// A payment belongs to one request. The transaction must reach the network
// through this server: one the network already knows could be claimed by
// anybody who saw it, and is refused. (A payment a wallet sends by itself,
// from a QR code, needs an address of its own per order; not offered yet.)
//
// What is kept, in PAYMENTS_DIR, one small file per payment: the txid, the
// amount, when it was seen and redeemed, and a SHA-256 hash of the request
// body. No body, no name, no address of the customer.

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PaymentError, UNREACHABLE, broadcast, checkPayment, explorerTx, fromUnits, inspectPayment, isAddress, scriptOf, toUnits, withServer } from '@eigenbeleg/onchain-pay';

export const SCHEME = 'onchain';
/** A payment stays redeemable for its request this long after it was first seen. */
export const REDEEM_SECONDS = 7 * 86_400;
/** A transaction just broadcast may be unknown to another server for a moment. */
export const GRACE_SECONDS = 120;
/** How soon to ask again while a payment waits for its block. */
export const RETRY_SECONDS = 60;

const TXID = /^[0-9a-f]{64}$/;

/**
 * @typedef {object} PaymentRecord
 * @property {1} v
 * @property {string} txid
 * @property {string} network the network's id
 * @property {string} request SHA-256 of the request the payment is for
 * @property {string} amount what it pays the recipient, in units
 * @property {string} seenAt ISO instant
 * @property {string | null} spentAt ISO instant of the first delivery
 *
 * @typedef {object} PaymentStore
 * @property {(txid: string) => Promise<PaymentRecord | null>} get
 * @property {(record: PaymentRecord) => Promise<boolean>} bind stores a new record; false where the txid is known already
 * @property {(record: PaymentRecord) => Promise<void>} put
 * @property {(txid: string) => Promise<void>} remove
 */

/** For tests and development: gone with the process. @returns {PaymentStore} */
export function memoryPaymentStore() {
	/** @type {Map<string, PaymentRecord>} */
	const records = new Map();
	return {
		get: async (txid) => records.get(txid) ?? null,
		bind: async (record) => (records.has(record.txid) ? false : (records.set(record.txid, record), true)),
		put: async (record) => void records.set(record.txid, record),
		remove: async (txid) => void records.delete(txid)
	};
}

/**
 * One file per payment, `<txid>.json`. Nothing in it is secret or personal.
 *
 * @param {{ dir: string }} o
 * @returns {PaymentStore}
 */
export function createPaymentStore({ dir }) {
	const file = (/** @type {string} */ txid) => join(dir, `${txid}.json`);
	return {
		async get(txid) {
			if (!TXID.test(txid)) return null;
			try {
				return JSON.parse(await readFile(file(txid), 'utf8'));
			} catch {
				return null;
			}
		},
		async bind(record) {
			await mkdir(dir, { recursive: true });
			try {
				// `wx`: fails where the file exists, so two requests cannot both bind one payment.
				await writeFile(file(record.txid), JSON.stringify(record), { mode: 0o600, flag: 'wx' });
				return true;
			} catch (e) {
				if (/** @type {any} */ (e)?.code === 'EEXIST') return false;
				throw e;
			}
		},
		async put(record) {
			await mkdir(dir, { recursive: true });
			const tmp = `${file(record.txid)}.${randomBytes(4).toString('hex')}.tmp`;
			await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
			await rename(tmp, file(record.txid));
		},
		async remove(txid) {
			if (TXID.test(txid)) await rm(file(txid), { force: true });
		}
	};
}

/** JSON with every object's keys in order, so the same body gives the same text. @param {unknown} v @returns {string} */
const canonical = (v) =>
	Array.isArray(v)
		? `[${v.map(canonical).join(',')}]`
		: v && typeof v === 'object'
			? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(/** @type {any} */ (v)[k])}`).join(',')}}`
			: JSON.stringify(v ?? null);

/**
 * What ties a payment to its request: SHA-256 over the txid and the body.
 *
 * @param {string} txid
 * @param {unknown} body the request's JSON body
 */
export const requestHash = (txid, body) => createHash('sha256').update(`${txid}\n${canonical(body)}`).digest('hex');

/** Why a payment is not taken, as the 402 says it. */
export const REASONS = Object.freeze({
	no_payment: 'the payment carries neither a signed transaction (payload.transaction, hex) nor a txid (payload.txid)',
	not_a_transaction: 'payload.transaction is not a transaction',
	unknown_payment: 'this txid was not first sent here: send the signed transaction itself (payload.transaction), and let this server broadcast it',
	not_first_sent_here: 'the network knows this transaction already, so it cannot be tied to this request; send a new, unsent transaction and let this server broadcast it',
	address: 'the transaction does not pay the address of the offer',
	amount: 'the transaction pays less than the price',
	replaceable: 'the transaction can still be replaced (BIP125); sign it with final sequence numbers',
	refused_by_network: 'the network refused the transaction (already spent coins, or a fee below the minimum)',
	other_request: 'this payment belongs to another request; send exactly the request it was made for',
	expired: 'this payment was made too long ago to be redeemed here; write to support with the txid',
	dropped: 'the transaction is not on the chain any more (replaced, dropped, or its block was reorganised); pay again'
});

/**
 * @param {object} o
 * @param {import('@eigenbeleg/onchain-pay/networks').Network} o.network
 * @param {string} o.payTo the address that receives the coin
 * @param {string} o.price a decimal of the coin, e.g. "2.5"
 * @param {number} [o.confirmations] blocks before the documents are built; default 1
 * @param {PaymentStore} o.store
 * @param {string[]} [o.servers] ElectrumX servers instead of the network's
 * @param {<T>(fn: (server: import('@eigenbeleg/onchain-pay').ElectrumServer) => Promise<T>) => Promise<T>} [o.open] runs fn with a server (a test's fake)
 * @param {() => Date} [o.now]
 * @param {number} [o.limit] judged payments per minute per IP; default 30
 */
export function createOnchain({ network, payTo, price, confirmations = 1, store, servers, open, now = () => new Date(), limit = 30 }) {
	if (!isAddress(network, payTo)) throw new Error(`${network.symbol}_PAY_TO is not a ${network.name} address`);
	if (!Number.isInteger(confirmations) || confirmations < 0 || confirmations > 100) throw new Error(`${network.symbol}_CONFIRMATIONS: a number of blocks, 0 to 100`);
	/** @type {bigint} */
	let amount;
	try {
		amount = toUnits(network, price);
	} catch {
		throw new Error(`PRICE_${network.symbol}: an amount of ${network.symbol} like 2.5`);
	}
	if (amount < BigInt(network.dust)) throw new Error(`PRICE_${network.symbol} is below what the network relays`);
	const run = open ?? ((fn) => withServer(network, fn, servers?.length ? { servers } : {}));
	const own = Buffer.from(/** @type {Uint8Array} */ (scriptOf(network, payTo))).toString('hex');
	/** Marks a payment this process's step has judged: nothing a client sends can carry it. */
	const stamp = randomBytes(16).toString('hex');
	const priced = `${fromUnits(network, amount)} ${network.symbol}`;
	const wait = `about ${Math.round((network.blockSeconds * Math.max(1, confirmations)) / 60)} minutes`;

	/** The offer in a route's accepts. */
	const accept = {
		scheme: SCHEME,
		network: network.caip2,
		payTo,
		price: {
			amount: amount.toString(),
			asset: network.symbol,
			extra: {
				name: network.name,
				decimals: network.decimals,
				price: priced,
				confirmations,
				blockSeconds: network.blockSeconds,
				explorer: network.explorer.tx,
				how: `Sign a transaction that pays at least the amount to payTo and send the same request with PAYMENT-SIGNATURE, payload { "transaction": "<hex>" }; do not broadcast it yourself. The answer is 202 until ${confirmations} confirmation(s) (${wait}); repeat the request (payload { "txid": "…" } is enough then) until 200.`
			}
		},
		maxTimeoutSeconds: REDEEM_SECONDS
	};

	/**
	 * @param {Record<string, unknown>} given the client's payload
	 * @param {unknown} body
	 * @returns {Promise<{ verdict: string, txid: string, request: string, state?: import('@eigenbeleg/onchain-pay').PaymentState }>}
	 */
	async function judge(given, body) {
		const hex = typeof given.transaction === 'string' ? given.transaction : '';
		let txid = typeof given.txid === 'string' && TXID.test(given.txid) ? given.txid : '';
		/** @type {ReturnType<typeof inspectPayment> | null} */
		let seen = null;
		if (hex) {
			try {
				seen = inspectPayment(network, hex);
			} catch {
				return { verdict: 'not_a_transaction', txid: '', request: '' };
			}
			txid = seen.txid;
		}
		if (!txid) return { verdict: 'no_payment', txid: '', request: '' };
		const request = requestHash(txid, body);
		const no = (/** @type {string} */ verdict) => ({ verdict, txid, request });
		// What can be said without asking the network is said first: no connection for a payment that cannot count.
		const paid = seen ? seen.outputs.filter((o) => o.script === own).reduce((sum, o) => sum + o.amount, 0n) : 0n;
		const first = await store.get(txid);
		if (!first) {
			if (!seen) return no('unknown_payment');
			if (paid === 0n) return no('address');
			if (paid < amount) return no('amount');
			if (seen.replaceable) return no('replaceable');
		} else if (first.request !== request) return no('other_request');
		return run(async (server) => {
			let record = await store.get(txid);
			if (!record) {
				if (!seen) return no('unknown_payment');
				// Known to the network before it came here: anybody could have copied it from there.
				const known = await server.request('blockchain.transaction.get', [txid, true]).then(
					(tx) => Boolean(tx),
					(e) => {
						if (UNREACHABLE.includes(/** @type {any} */ (e)?.code)) throw e;
						return false;
					}
				);
				if (known) return no('not_first_sent_here');
				record = { v: 1, txid, network: network.id, request, amount: paid.toString(), seenAt: now().toISOString(), spentAt: null };
				if (await store.bind(record)) {
					try {
						await broadcast(server, hex);
					} catch (e) {
						await store.remove(txid);
						if (e instanceof PaymentError && e.code === 'PAYMENT_REFUSED') return no('refused_by_network');
						throw e;
					}
				} else record = /** @type {PaymentRecord} */ (await store.get(txid));
			}
			if (!record || record.request !== request) return no('other_request');
			const age = (now().getTime() - Date.parse(record.seenAt)) / 1000;
			if (age > REDEEM_SECONDS) return no('expired');
			let state = await checkPayment({ network, server, txid, address: payTo, amount, minConfirmations: confirmations });
			if (state.reason === 'unknown' && age > GRACE_SECONDS && seen) {
				// It fell out of the mempool: with the transaction in hand, send it again.
				try {
					await broadcast(server, hex);
					state = { ...state, reason: 'unconfirmed' };
				} catch {
					// its coins are spent elsewhere
				}
			}
			if (state.ok) return { verdict: 'ok', txid, request, state };
			if (state.reason === 'unconfirmed' || (state.reason === 'unknown' && age <= GRACE_SECONDS)) return { verdict: 'waiting', txid, request, state };
			return no(state.reason === 'unknown' ? 'dropped' : state.reason);
		});
	}

	/** Each judged payment may open a connection to the network: a few per minute per IP. @type {Map<string, { n: number, since: number }>} */
	const attempts = new Map();
	const tooMany = (/** @type {string} */ ip) => {
		const t = Date.now();
		for (const [k, w] of attempts) if (t - w.since > 60_000) attempts.delete(k);
		const w = attempts.get(ip) ?? { n: 0, since: t };
		w.n += 1;
		attempts.set(ip, w);
		return w.n > limit;
	};

	/**
	 * In front of the x402 middleware: a request that pays on this network is
	 * judged here. Waiting for its block: 202. Else the verdict travels in the
	 * payment header, which the scheme below takes as its verification.
	 *
	 * @type {import('express').RequestHandler}
	 */
	const step = async (req, res, next) => {
		// The header the x402 middleware will read, under the name it reads it by.
		const name = req.get('payment-signature') ? 'payment-signature' : 'x-payment';
		const header = req.get(name);
		if (!header) return next();
		/** @type {any} */
		let payment;
		try {
			payment = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
		} catch {
			return next();
		}
		// x402 v2 names scheme and network in `accepted`, v1 beside the payload: either way it is judged here.
		if ((payment?.accepted?.scheme ?? payment?.scheme) !== SCHEME || (payment?.accepted?.network ?? payment?.network) !== network.caip2) return next();
		if (tooMany(req.ip ?? '')) {
			res.setHeader('Retry-After', '60');
			res.status(429).json({ error: 'too many payment attempts; try again in a minute' });
			return;
		}
		let judged;
		try {
			judged = await judge(payment.payload && typeof payment.payload === 'object' ? payment.payload : {}, req.body);
		} catch (e) {
			if (e instanceof PaymentError && UNREACHABLE.includes(e.code)) {
				// Nothing is lost: a payment already seen stays tied to this request.
				res.setHeader('Retry-After', String(RETRY_SECONDS));
				res.status(503).json({ error: `cannot reach the ${network.name} network right now; a payment already sent stays valid for this request, try again` });
				return;
			}
			return next(e);
		}
		if (judged.verdict === 'waiting') {
			const s = /** @type {import('@eigenbeleg/onchain-pay').PaymentState} */ (judged.state);
			res.setHeader('Retry-After', String(RETRY_SECONDS));
			res.status(202).json({
				status: 'payment seen',
				network: network.caip2,
				txid: judged.txid,
				explorer: explorerTx(network, judged.txid),
				confirmations: s.confirmations,
				required: confirmations,
				expectedSeconds: network.blockSeconds * Math.max(1, confirmations - s.confirmations),
				retryAfterSeconds: RETRY_SECONDS,
				note: `The documents are built once the payment has ${confirmations} confirmation(s). Send the same request again, with the same PAYMENT-SIGNATURE or with payload { "txid": "${judged.txid}" }, until the answer is 200. The payment stays valid for this request for ${REDEEM_SECONDS / 86_400} days.`
			});
			return;
		}
		payment.payload = { txid: judged.txid, request: judged.request, verdict: judged.verdict, stamp };
		req.headers[name] = Buffer.from(JSON.stringify(payment)).toString('base64');
		next();
	};

	/** What the x402 resource server needs of a scheme: the price as it stands in the route. */
	const serverScheme = {
		scheme: SCHEME,
		defaultAssetTransferMethod: 'default',
		paymentFlows: { default: { supported: ['authorization'], default: 'authorization' } },
		getAssetDecimals: () => network.decimals,
		/** @param {any} p */
		async parsePrice(p) {
			if (!p || typeof p !== 'object' || !('amount' in p)) throw new Error(`the ${SCHEME} scheme takes a price as { amount, asset }`);
			return { amount: String(p.amount), asset: String(p.asset), extra: p.extra ?? {} };
		},
		/** @param {any} requirements */
		enhancePaymentRequirements: async (requirements) => requirements
	};

	/** The facilitator's part: the step's verdict is the verification; settling marks the payment redeemed. */
	const facilitatorScheme = {
		scheme: SCHEME,
		caipFamily: 'bip122:*',
		getExtra: () => undefined,
		getSigners: () => [],
		/** @param {any} payload */
		async verify(payload) {
			const p = payload?.payload ?? {};
			// The 402 carries the reason as its `error`: a code, then the sentence.
			if (p.stamp !== stamp) return { isValid: false, invalidReason: 'onchain_not_judged: this payment did not pass the payment step' };
			if (p.verdict !== 'ok') return { isValid: false, invalidReason: `onchain_${p.verdict}: ${/** @type {Record<string, string>} */ (REASONS)[p.verdict] ?? 'refused'}` };
			return { isValid: true };
		},
		/** @param {any} payload */
		async settle(payload) {
			const p = payload?.payload ?? {};
			const record = p.stamp === stamp && p.verdict === 'ok' ? await store.get(String(p.txid)) : null;
			if (!record || record.request !== p.request) return { success: false, errorReason: 'onchain_not_judged', transaction: '', network: network.caip2 };
			if (!record.spentAt) await store.put({ ...record, spentAt: now().toISOString() });
			return { success: true, transaction: record.txid, network: network.caip2, amount: record.amount };
		}
	};

	return {
		network,
		accept,
		step,
		serverScheme,
		facilitatorScheme,
		/** For GET /, /llms.txt and /openapi.json. */
		info: {
			scheme: SCHEME,
			network: network.caip2,
			name: network.name,
			asset: network.symbol,
			price: priced,
			amount: amount.toString(),
			payTo,
			gasless: false,
			confirmations,
			wait,
			redeemableDays: REDEEM_SECONDS / 86_400,
			explorer: network.explorer.tx,
			servers: (servers?.length ? servers : network.electrum).map((u) => new URL(u).host)
		}
	};
}
