// SPDX-License-Identifier: AGPL-3.0-or-later
// Payment in DOI beside USDC (apps/api/src/onchain.js, #58): the real x402
// middleware, and a Doichain in memory. Keys, addresses, amounts and
// transactions are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KeyPair } from '@near-js/crypto';
import { fixedRates } from '@le-space/eigenbeleg';
import { coinPriceFor } from '@eigenbeleg/pipeline/prices';
import { DOICHAIN, PaymentError, addressOfKey, broadcast, buildPayment, receiveAddresses } from '@eigenbeleg/onchain-pay';
import { fakeChain, fakeKey } from '@eigenbeleg/onchain-pay/testing';

import { createApp } from '../src/app.js';
import { ORDER_SECONDS, REDEEM_SECONDS, SCHEME, createOnchain, createOrderStore, createPaymentStore, memoryOrders, memoryPaymentStore, requestHash } from '../src/onchain.js';
import { createPaywall } from '../src/paywall.js';
import { checkOnchain } from '../src/release.js';
import { recordedNear } from '../../agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const reads = { fetch: recordedNear(raw), rates: fixedRates({ NEAR: '2' }), now: () => new Date('2026-11-06T10:00:00Z') };
const job = {
	chain: 'near',
	network: 'mainnet',
	addresses: ['relay.aurora'],
	period: { from: '2026-11-01', to: '2026-11-01' },
	payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' },
	number: 'EB-2026-042'
};
const PRICE = 250_000_000n; // 2.5 DOI

/** The account key of BIP84's published test vector: anybody's, nobody's. */
const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

/**
 * An API that takes 2.5 DOI beside testnet USDC, on a chain in memory.
 * @param {{ deps?: any, xpub?: string, gap?: number, price?: string | null }} [o] xpub: an address per order instead of one
 *   address; price: one for every document, or null for the published prices per document
 */
async function setup({ deps = reads, xpub, gap, price = '2.5' } = {}) {
	const chain = fakeChain(DOICHAIN);
	const addressAt = xpub ? receiveAddresses(chain.network, xpub) : null;
	const payTo = addressAt ? addressAt(0) : addressOfKey(chain.network, fakeKey('shop'));
	const payer = fakeKey('payer');
	chain.fund(addressOfKey(chain.network, payer), 900_000_000n);
	const store = memoryPaymentStore();
	const clock = { now: new Date('2026-11-06T10:00:00Z') };
	/** The chain the server asks; a test can swap it, or make it unreachable. */
	const net = { chain, down: false };
	const paywall = await createPaywall({
		mode: 'x402',
		networks: ['near:testnet'],
		allowTestnet: true,
		payTo: 'wolkenfabrik.testnet',
		relayerId: 'relayer.testnet',
		relayerKey: KeyPair.fromRandom('ed25519').toString(),
		onchain: {
			network: chain.network,
			...(xpub ? { xpub, orders: memoryOrders(), gap } : { payTo }),
			...(price === null ? {} : { price }),
			store,
			now: () => clock.now,
			open: async (fn) => {
				if (net.down) throw new PaymentError('no ElectrumX server answers', 'PAYMENT_SERVER');
				return fn(/** @type {any} */ (net.chain.server));
			}
		}
	});
	const server = createApp({ paywall, deps, log: () => {}, web: null }).listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
	const post = (/** @type {unknown} */ body, /** @type {Record<string, string>} */ headers = {}) =>
		fetch(`${base}/eigenbeleg`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
	const required = async (/** @type {unknown} */ body = job, /** @type {Record<string, string>} */ headers = {}) => JSON.parse(Buffer.from((await post(body, headers)).headers.get('payment-required') ?? '', 'base64').toString());
	/** The DOI offer of a request's 402. */
	const offerOf = async (/** @type {unknown} */ body = job, /** @type {Record<string, string>} */ headers = {}) => (await required(body, headers)).accepts.find((/** @type {any} */ a) => a.scheme === SCHEME);
	const offer = await offerOf();
	/** The header a client sends. @param {Record<string, unknown>} payload @param {any} [accepted] */
	const pay = (payload, accepted = offer) => ({ 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify({ x402Version: 2, accepted, payload })).toString('base64') });
	/** A signed, unsent payment of the payer. @param {bigint} [amount] */
	const sign = (amount = PRICE) => buildPayment({ network: chain.network, server: chain.server, key: payer, to: payTo, amount });
	/** The reason of a 402. @param {Response} r */
	const why = (r) => JSON.parse(Buffer.from(r.headers.get('payment-required') ?? '', 'base64').toString()).error;
	return { chain, net, payTo, addressAt, payer, store, clock, paywall, base, post, offer, offerOf, pay, sign, why, required, close: () => server.close() };
}

test('the 402 offers DOI beside USDC: its own scheme, the amount in swartz, how long it takes', async () => {
	const t = await setup();
	try {
		const { accepts } = await t.required();
		assert.deepEqual(accepts.map((/** @type {any} */ a) => [a.scheme, a.network]), [['exact', 'near:testnet'], ['onchain', DOICHAIN.caip2]]);
		assert.deepEqual([t.offer.asset, t.offer.amount, t.offer.payTo, t.offer.maxTimeoutSeconds], ['DOI', '250000000', t.payTo, REDEEM_SECONDS]);
		assert.deepEqual([t.offer.extra.price, t.offer.extra.confirmations, t.offer.extra.blockSeconds], ['2.5 DOI', 1, 600]);
		assert.match(t.offer.extra.how, /do not broadcast it yourself/);
		// GET / and /llms.txt say the same, apart from the USDC offers.
		const info = (await (await fetch(`${t.base}/`)).json()).payment;
		assert.deepEqual(info.accepts.map((/** @type {any} */ a) => a.network), ['near:testnet']);
		assert.deepEqual([info.coins[0].asset, info.coins[0].price, info.coins[0].payTo, info.coins[0].wait], ['DOI', '2.5 DOI', t.payTo, 'about 10 minutes']);
		const llms = await (await fetch(`${t.base}/llms.txt`)).text();
		assert.match(llms, /### Paying in DOI \(Doichain\)/);
		// The buy line names the coin beside USDC.
		assert.match(llms, /POST [^\n]*\/eigenbeleg: USDC on [^\n]*; or 2\.5 DOI on Doichain \(below, "Paying in DOI"\)\./);
		assert.match(llms, /Do not broadcast it\./);
		assert.match(llms, /202 with the txid/);
		const api = await (await fetch(`${t.base}/openapi.json`)).json();
		assert.match(JSON.stringify(api), /Also 2\.5 DOI on Doichain \(scheme onchain\)/);
	} finally {
		t.close();
	}
});

test('the published DOI price follows the document: Eigenbelege 0.25, Kontoauszug 5, both the sum; less than the document costs is refused', async () => {
	const t = await setup({ price: null });
	try {
		const amount = async (/** @type {object} */ body) => (await t.offerOf(body)).amount;
		assert.equal(t.offer.amount, '25000000');
		assert.equal(await amount({ ...job, document: 'eigenbelege' }), '25000000');
		assert.equal(await amount({ ...job, document: 'kontoauszug' }), '500000000');
		assert.equal(await amount({ ...job, document: 'beide', format: 'json' }), '525000000');
		const info = (await (await fetch(`${t.base}/`)).json()).payment;
		assert.deepEqual(info.coins[0].prices, { eigenbelege: '0.25 DOI', kontoauszug: '5 DOI', beide: '5.25 DOI' });
		assert.equal(info.coins[0].price, '0.25 DOI');
		// /llms.txt and the OpenAPI description name every document's price, USDC and DOI.
		const llms = await (await fetch(`${t.base}/llms.txt`)).text();
		assert.match(llms, /NEAR testnet \(near:testnet\): \$0\.005 for eigenbelege, \$0\.10 for kontoauszug, \$0\.105 for beide to /);
		assert.match(llms, /; or 0\.25 DOI for eigenbelege, 5 DOI for kontoauszug, 5\.25 DOI for beide on Doichain/);
		assert.match(llms, /The price follows the body's `document`/);
		const api = JSON.stringify(await (await fetch(`${t.base}/openapi.json`)).json());
		assert.match(api, /Also 0\.25 DOI for eigenbelege, 5 DOI for kontoauszug, 5\.25 DOI for beide on Doichain/);
		// The Eigenbelege's price does not buy a Kontoauszug: not broadcast.
		const statement = { ...job, document: 'kontoauszug' };
		const small = await t.sign(25_000_000n);
		const r = await t.post(statement, t.pay({ transaction: small.hex }, await t.offerOf(statement)));
		assert.equal(r.status, 402);
		assert.match(t.why(r), /^onchain_amount/);
		assert.equal(t.chain.outputsOf(small.txid).length, 0);
	} finally {
		t.close();
	}
});

test('pay, 202 while the payment waits for its block, then the documents; the same request is answered again', async () => {
	const t = await setup();
	try {
		const tx = await t.sign();
		const seen = await t.post(job, t.pay({ transaction: tx.hex }));
		assert.equal(seen.status, 202);
		assert.equal(seen.headers.get('retry-after'), '60');
		const body = await seen.json();
		assert.deepEqual([body.status, body.txid, body.confirmations, body.required, body.expectedSeconds], ['payment seen', tx.txid, 0, 1, 600]);
		assert.equal(body.explorer, `https://doi-explorer.le-space.de/tx/${tx.txid}`);
		// this server sent it; it is tied to the request, and nothing of the request is kept but a hash
		assert.equal(t.chain.outputsOf(tx.txid).length, 2);
		const record = await t.store.get(tx.txid);
		assert.deepEqual([record?.amount, record?.spentAt, record?.request], ['250000000', null, requestHash(tx.txid, job)]);
		assert.ok(!JSON.stringify(record).includes('Wolkenfabrik'));

		// asking again, with the txid alone: still waiting
		assert.equal((await t.post(job, t.pay({ txid: tx.txid }))).status, 202);

		t.chain.mine();
		const done = await t.post(job, t.pay({ txid: tx.txid }));
		assert.equal(done.status, 200);
		assert.equal(done.headers.get('content-type'), 'application/pdf');
		const receipt = JSON.parse(Buffer.from(done.headers.get('payment-response') ?? '', 'base64').toString());
		assert.deepEqual([receipt.success, receipt.transaction, receipt.network], [true, tx.txid, DOICHAIN.caip2]);
		assert.ok((await t.store.get(tx.txid))?.spentAt);
		assert.ok(!JSON.stringify(receipt).includes('stamp'));

		// the same request again, with the transaction or the txid: the same files, no second payment
		assert.equal((await t.post(job, t.pay({ transaction: tx.hex }))).status, 200);
		// another request with that payment: refused, with the reason
		const other = await t.post({ ...job, number: 'EB-2026-043' }, t.pay({ txid: tx.txid }));
		assert.equal(other.status, 402);
		assert.match(t.why(other), /^onchain_other_request: this payment belongs to another request/);
		// and after the window it is over
		t.clock.now = new Date(t.clock.now.getTime() + (REDEEM_SECONDS + 60) * 1000);
		assert.match(t.why(await t.post(job, t.pay({ txid: tx.txid }))), /^onchain_expired: /);
	} finally {
		t.close();
	}
});

test('a payment that cannot be tied to the request is refused before anything is sent', async () => {
	const t = await setup();
	try {
		// too small: not broadcast
		const small = await t.sign(PRICE - 1n);
		const r1 = await t.post(job, t.pay({ transaction: small.hex }));
		assert.equal(r1.status, 402);
		assert.match(t.why(r1), /^onchain_amount: the transaction pays less than the price/);
		assert.equal(t.chain.outputsOf(small.txid).length, 0);
		assert.equal(await t.store.get(small.txid), null);

		// to another address
		const elsewhere = await buildPayment({ network: t.chain.network, server: t.chain.server, key: t.payer, to: addressOfKey(t.chain.network, fakeKey('somebody else')), amount: PRICE });
		assert.match(t.why(await t.post(job, t.pay({ transaction: elsewhere.hex }))), /^onchain_address: /);

		// a txid this server never saw, a transaction that is none, a payment without either
		assert.match(t.why(await t.post(job, t.pay({ txid: 'ab'.repeat(32) }))), /^onchain_unknown_payment: /);
		assert.match(t.why(await t.post(job, t.pay({ transaction: 'zz' }))), /^onchain_not_a_transaction: /);
		assert.match(t.why(await t.post(job, t.pay({}))), /^onchain_no_payment: /);

		// a transaction the network already knows: anybody could have copied it from there
		const tx = await t.sign();
		await broadcast(t.chain.server, tx.hex);
		const copied = await t.post({ ...job, number: 'EB-2026-099' }, t.pay({ transaction: tx.hex }));
		assert.equal(copied.status, 402);
		assert.match(t.why(copied), /^onchain_not_first_sent_here: the network knows this transaction already/);
		assert.equal(await t.store.get(tx.txid), null);

		// under the header's old name, or in the old shape, a payment is judged just the same: nothing a client
		// writes into the payload counts as a verdict
		const forged = { txid: 'ab'.repeat(32), request: 'cd'.repeat(32), verdict: 'ok', stamp: 'guessed' };
		const old = await t.post(job, { 'X-PAYMENT': t.pay(forged)['PAYMENT-SIGNATURE'] });
		assert.equal(old.status, 402);
		assert.match(t.why(await t.post(job, t.pay(forged))), /^onchain_unknown_payment: /);
		const v1 = Buffer.from(JSON.stringify({ x402Version: 1, scheme: SCHEME, network: DOICHAIN.caip2, payload: forged })).toString('base64');
		assert.equal((await t.post(job, { 'X-PAYMENT': v1 })).status, 402);
		assert.equal((await t.post(job, { 'PAYMENT-SIGNATURE': v1 })).status, 402);
		// what the step notes for the scheme never comes back to the client
		assert.ok(!Buffer.from(old.headers.get('payment-required') ?? '', 'base64').toString().includes('stamp'));

		// the USDC offer is untouched by all this
		const { accepts } = await t.required();
		assert.equal(accepts[0].scheme, 'exact');
	} finally {
		t.close();
	}
});

test('nothing is charged for nothing: a failed chain read leaves the payment redeemable; an unreachable network loses nothing', async () => {
	const failing = { ok: false };
	const deps = { ...reads, fetch: (/** @type {any} */ ...a) => (failing.ok ? reads.fetch(...a) : Promise.reject(new Error('the source is down'))) };
	const t = await setup({ deps });
	try {
		const tx = await t.sign();
		assert.equal((await t.post(job, t.pay({ transaction: tx.hex }))).status, 202);
		t.chain.mine();
		const broken = await t.post(job, t.pay({ txid: tx.txid }));
		assert.equal(broken.status, 502);
		assert.equal((await t.store.get(tx.txid))?.spentAt, null, 'not redeemed');

		t.net.down = true;
		const away = await t.post(job, t.pay({ txid: tx.txid }));
		assert.equal(away.status, 503);
		assert.equal(away.headers.get('retry-after'), '60');
		t.net.down = false;

		failing.ok = true;
		assert.equal((await t.post(job, t.pay({ txid: tx.txid }))).status, 200);
		assert.ok((await t.store.get(tx.txid))?.spentAt);
	} finally {
		t.close();
	}
});

test('a payment that falls out of the chain before its block ends in a 402 with the reason, not in documents', async () => {
	const t = await setup();
	try {
		const tx = await t.sign();
		assert.equal((await t.post(job, t.pay({ transaction: tx.hex }))).status, 202);
		// another chain that never saw it (as after a replacement or a reorganisation) …
		t.net.chain = fakeChain(DOICHAIN);
		// … right after sending, a server may just not know it yet
		assert.equal((await t.post(job, t.pay({ txid: tx.txid }))).status, 202);
		t.clock.now = new Date(t.clock.now.getTime() + 600_000);
		const gone = await t.post(job, t.pay({ transaction: tx.hex }));
		assert.equal(gone.status, 402);
		assert.match(t.why(gone), /^onchain_dropped: the transaction is not on the chain any more/);
	} finally {
		t.close();
	}
});

test('the scheme takes only what this process\'s step judged', async () => {
	const chain = fakeChain(DOICHAIN);
	const o = createOnchain({ network: chain.network, payTo: addressOfKey(chain.network, fakeKey('shop')), price: '2.5', store: memoryPaymentStore(), open: (fn) => fn(/** @type {any} */ (chain.server)) });
	const forged = { payload: { txid: 'ab'.repeat(32), request: 'cd'.repeat(32), verdict: 'ok', stamp: 'guessed' } };
	assert.deepEqual(await o.facilitatorScheme.verify(forged), { isValid: false, invalidReason: 'onchain_not_judged: this payment did not pass the payment step' });
	assert.equal((await o.facilitatorScheme.settle(forged)).success, false);
	assert.throws(() => createOnchain({ network: chain.network, payTo: 'bc1qnotdoichain', price: '2.5', store: memoryPaymentStore() }), /DOI_PAY_TO is not a Doichain address/);
	assert.throws(() => createOnchain({ network: chain.network, payTo: addressOfKey(chain.network, fakeKey('shop')), price: '2,5', store: memoryPaymentStore() }), /PRICE_DOI/);
	assert.throws(() => createOnchain({ network: chain.network, payTo: addressOfKey(chain.network, fakeKey('shop')), price: '0.0001', store: memoryPaymentStore() }), /below what the network relays/);
});

test('the payments on disk: one file each, bound once', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'eigenbeleg-payments-'));
	const store = createPaymentStore({ dir });
	const record = /** @type {const} */ ({ v: 1, txid: 'ab'.repeat(32), network: 'doichain', request: 'cd'.repeat(32), amount: '250000000', seenAt: '2026-11-06T10:00:00.000Z', spentAt: null });
	assert.equal(await store.bind(record), true);
	assert.equal(await store.bind({ ...record, request: 'ef'.repeat(32) }), false, 'the first request keeps it');
	assert.equal((await store.get(record.txid))?.request, record.request);
	await store.put({ ...record, spentAt: '2026-11-06T10:11:00.000Z' });
	assert.equal((await store.get(record.txid))?.spentAt, '2026-11-06T10:11:00.000Z');
	assert.deepEqual(readdirSync(dir), [`${record.txid}.json`]);
	assert.equal(await store.get('../../etc/passwd'), null);
	await store.remove(record.txid);
	assert.equal(await store.get(record.txid), null);
});

test('production: only the published price, at least one block, no server on this machine; never without x402', async () => {
	const ok = { production: true, mode: 'x402', symbol: 'DOI', price: '2.5', published: '2.5', confirmations: 1, servers: ['wss://electrum.example.org:50004'] };
	checkOnchain(ok);
	assert.throws(() => checkOnchain({ ...ok, published: undefined }), /no price in DOI is published yet/);
	assert.throws(() => checkOnchain({ ...ok, price: '0.1' }), /the published one 2\.5 DOI/);
	assert.throws(() => checkOnchain({ ...ok, confirmations: 0 }), /at least one block/);
	assert.throws(() => checkOnchain({ ...ok, servers: ['wss://localhost:50004'] }), /on this machine/);
	assert.throws(() => checkOnchain({ ...ok, servers: ['ws://electrum.example.org:50003'] }), /unencrypted/);
	assert.throws(() => checkOnchain({ ...ok, production: false, mode: 'none' }), /needs PAYWALL=x402/);
	checkOnchain({ ...ok, production: false, price: '0.1', confirmations: 0 });
	// A production build charges the published price (0.25 DOI) and no other; without PRICE_DOI it is the price anyway.
	const chain = fakeChain(DOICHAIN);
	const onchain = { network: chain.network, payTo: addressOfKey(chain.network, fakeKey('shop')), price: '2.5', store: memoryPaymentStore() };
	await assert.rejects(createPaywall({ production: true, mode: 'x402', networks: ['near:mainnet'], onchain }), /the price is 2\.5 DOI, the published one 0\.25 DOI/);
	const pw = await createPaywall({ mode: 'x402', networks: ['near:testnet'], allowTestnet: true, payTo: 'wolkenfabrik.testnet', relayerId: 'relayer.testnet', relayerKey: KeyPair.fromRandom('ed25519').toString(), onchain: { ...onchain, price: undefined } });
	assert.equal(/** @type {any} */ (pw.info).coins[0].price, '0.25 DOI');
	assert.equal(coinPriceFor('doichain'), '0.25');
	assert.equal(coinPriceFor('bitcoin'), undefined);
});

test('judged payments are limited per IP, since each may open a connection', async () => {
	const chain = fakeChain(DOICHAIN);
	const o = createOnchain({ network: chain.network, payTo: addressOfKey(chain.network, fakeKey('shop')), price: '2.5', store: memoryPaymentStore(), open: (fn) => fn(/** @type {any} */ (chain.server)), limit: 2 });
	const header = Buffer.from(JSON.stringify({ x402Version: 2, accepted: { scheme: SCHEME, network: DOICHAIN.caip2 }, payload: {} })).toString('base64');
	const statuses = [];
	for (let i = 0; i < 3; i++) {
		const req = /** @type {any} */ ({ ip: '203.0.113.7', body: {}, headers: { 'payment-signature': header }, get: (/** @type {string} */ n) => req.headers[n] });
		const res = /** @type {any} */ ({ setHeader() {}, status: (/** @type {number} */ s) => (statuses.push(s), res), json() {} });
		await o.step(req, res, () => statuses.push(0));
	}
	assert.deepEqual(statuses, [0, 0, 429]);
});

const ORDER = { 'X-Eigenbeleg-Order': 'doichain' };

test('with an extended public key: an address per order, paid from a wallet, found without a txid', async () => {
	const t = await setup({ xpub: ZPUB });
	const at = /** @type {(i: number) => string} */ (t.addressAt);
	try {
		// unasked, the offer names the first address, for signed transactions only
		assert.deepEqual([t.offer.payTo, t.offer.extra.ownAddress], [at(0), false]);
		assert.match(t.offer.extra.how, /X-Eigenbeleg-Order: doichain/);

		// asked, the request gets an address of its own; the same request the same one, another request the next
		const mine = await t.offerOf(job, ORDER);
		assert.deepEqual([mine.payTo, mine.extra.ownAddress, mine.extra.uri], [at(1), true, `doichain:${at(1)}?amount=2.5`]);
		assert.equal(mine.extra.payBefore, new Date(t.clock.now.getTime() + ORDER_SECONDS * 1000).toISOString());
		assert.deepEqual(await t.offerOf(job, ORDER), mine);
		assert.deepEqual(await t.offerOf(job), mine, 'also without the header, once it has one');
		const other = { ...job, number: 'EB-2026-043' };
		assert.equal((await t.offerOf(other, ORDER)).payTo, at(2));

		// nothing paid yet
		const early = await t.post(job, t.pay({}, mine));
		assert.equal(early.status, 402);
		assert.match(t.why(early), /^onchain_no_payment_yet: /);

		// the person pays from a wallet: a transaction this server never saw, and one that could still be replaced
		const txid = t.chain.fund(at(1), PRICE, { confirmed: false, sequence: 0xfffffffd });
		const seen = await t.post(job, t.pay({}, mine));
		assert.equal(seen.status, 202);
		assert.deepEqual([(await seen.clone().json()).txid, (await seen.json()).confirmations], [txid, 0]);
		// the other order is not paid by it
		assert.match(t.why(await t.post(other, t.pay({}, await t.offerOf(other)))), /^onchain_no_payment_yet: /);

		t.chain.mine();
		const done = await t.post(job, t.pay({}, mine));
		assert.equal(done.status, 200);
		assert.equal(JSON.parse(Buffer.from(done.headers.get('payment-response') ?? '', 'base64').toString()).transaction, txid);
		// again, by txid as well; and long after the unpaid window the address is still this request's
		t.clock.now = new Date(t.clock.now.getTime() + 2 * ORDER_SECONDS * 1000);
		assert.equal((await t.post(job, t.pay({ txid }, mine))).status, 200);
		assert.equal((await t.offerOf({ ...job, number: 'EB-2026-044' }, ORDER)).payTo, at(2), 'the unpaid one is given out again, the paid one never');

		// a signed transaction to an order's address works as before
		const third = { ...job, number: 'EB-2026-045' };
		const offer = await t.offerOf(third, ORDER);
		assert.equal(offer.payTo, at(3));
		const tx = await buildPayment({ network: t.chain.network, server: t.chain.server, key: t.payer, to: at(3), amount: PRICE });
		assert.equal((await t.post(third, t.pay({ transaction: tx.hex }, offer))).status, 202);

		// the key itself is in no answer
		const texts = [JSON.stringify(await t.required(job, ORDER)), await (await fetch(`${t.base}/llms.txt`)).text(), JSON.stringify(await (await fetch(`${t.base}/`)).json())];
		for (const text of texts) assert.ok(!text.includes(ZPUB.slice(0, 20)) && !text.includes(ZPUB.slice(-20)));
		assert.match(texts[1], /From a wallet \(a QR code\) instead/);
	} finally {
		t.close();
	}
});

test('no more addresses are out unpaid than a wallet looks ahead; one that ran out is reused only if nothing ever arrived there', async () => {
	const t = await setup({ xpub: ZPUB, gap: 2 });
	const at = /** @type {(i: number) => string} */ (t.addressAt);
	const body = (/** @type {number} */ n) => ({ ...job, number: `EB-2026-1${n}` });
	try {
		assert.equal((await t.offerOf(body(1), ORDER)).payTo, at(1));
		assert.equal((await t.offerOf(body(2), ORDER)).payTo, at(2));
		const full = await t.offerOf(body(3), ORDER);
		assert.deepEqual([full.payTo, full.extra.ownAddress], [at(0), false], 'the shared address: signed transactions still work');

		// two hours on, both ran out unpaid. Somebody paid the first late, without ever asking again.
		t.clock.now = new Date(t.clock.now.getTime() + (ORDER_SECONDS + 60) * 1000);
		t.chain.fund(at(1), PRICE);
		assert.equal((await t.offerOf(body(4), ORDER)).payTo, at(2), 'the empty one, not the one something arrived at');
		// the late payer still gets the documents: the address stayed theirs
		const late = await t.offerOf(body(1));
		assert.equal(late.payTo, at(1));
		assert.equal((await t.post(body(1), t.pay({}, late))).status, 200);
	} finally {
		t.close();
	}
});

test('the orders on disk; one address or an extended key, never both, never a private one', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'eigenbeleg-orders-'));
	const orders = createOrderStore({ dir });
	assert.deepEqual(await orders.load(), { next: 1, orders: [] });
	await orders.save({ next: 2, orders: [{ index: 1, address: 'dc1qexample', request: 'cd'.repeat(32), at: '2026-11-06T10:00:00.000Z', txid: null }] });
	assert.equal((await orders.load()).next, 2);
	assert.deepEqual(readdirSync(dir), ['orders.json']);

	const chain = fakeChain(DOICHAIN);
	const base = { network: chain.network, price: '2.5', store: memoryPaymentStore() };
	assert.throws(() => createOnchain({ ...base }), /either DOI_PAY_TO \(one address\) or DOI_XPUB/);
	assert.throws(() => createOnchain({ ...base, xpub: ZPUB, payTo: addressOfKey(chain.network, fakeKey('shop')) }), /either DOI_PAY_TO/);
	const xprv = 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi';
	assert.throws(() => createOnchain({ ...base, xpub: xprv }), (e) => /DOI_XPUB is not an extended public key/.test(/** @type {Error} */ (e).message) && !/** @type {Error} */ (e).message.includes(xprv.slice(4, 20)));
	const info = createOnchain({ ...base, xpub: ZPUB }).info;
	assert.deepEqual([info.perOrder, info.orderHeader, info.orderHours], [true, 'X-Eigenbeleg-Order: doichain', 2]);
	assert.ok(!JSON.stringify(info).includes(ZPUB.slice(0, 20)));
});
