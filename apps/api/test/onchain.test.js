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
import { DOICHAIN, PaymentError, addressOfKey, broadcast, buildPayment } from '@eigenbeleg/onchain-pay';
import { fakeChain, fakeKey } from '@eigenbeleg/onchain-pay/testing';

import { createApp } from '../src/app.js';
import { REDEEM_SECONDS, SCHEME, createOnchain, createPaymentStore, memoryPaymentStore, requestHash } from '../src/onchain.js';
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

/** An API that takes 2.5 DOI beside testnet USDC, on a chain in memory. @param {{ deps?: any }} [o] */
async function setup({ deps = reads } = {}) {
	const chain = fakeChain(DOICHAIN);
	const payTo = addressOfKey(chain.network, fakeKey('shop'));
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
			payTo,
			price: '2.5',
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
	const required = async () => JSON.parse(Buffer.from((await post(job)).headers.get('payment-required') ?? '', 'base64').toString());
	const offer = (await required()).accepts.find((/** @type {any} */ a) => a.scheme === SCHEME);
	/** The header a client sends. @param {Record<string, unknown>} payload */
	const pay = (payload) => ({ 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify({ x402Version: 2, accepted: offer, payload })).toString('base64') });
	/** A signed, unsent payment of the payer. @param {bigint} [amount] */
	const sign = (amount = PRICE) => buildPayment({ network: chain.network, server: chain.server, key: payer, to: payTo, amount });
	/** The reason of a 402. @param {Response} r */
	const why = (r) => JSON.parse(Buffer.from(r.headers.get('payment-required') ?? '', 'base64').toString()).error;
	return { chain, net, payTo, payer, store, clock, paywall, base, post, offer, pay, sign, why, required, close: () => server.close() };
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
		assert.match(llms, /Do not broadcast it\./);
		assert.match(llms, /202 with the txid/);
		const api = await (await fetch(`${t.base}/openapi.json`)).json();
		assert.match(JSON.stringify(api), /Also 2\.5 DOI on Doichain \(scheme onchain\)/);
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
	// No DOI price is published yet, so a production build cannot switch the offer on.
	const chain = fakeChain(DOICHAIN);
	const onchain = { network: chain.network, payTo: addressOfKey(chain.network, fakeKey('shop')), price: '2.5', store: memoryPaymentStore() };
	await assert.rejects(createPaywall({ production: true, mode: 'x402', networks: ['near:mainnet'], onchain }), /no price in DOI is published yet/);
	await assert.rejects(createPaywall({ mode: 'x402', networks: ['near:mainnet'], onchain: { ...onchain, price: undefined } }), /DOI_PAY_TO is set, but no price/);
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
