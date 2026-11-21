// SPDX-License-Identifier: AGPL-3.0-or-later
// The subscription (#20): stored encrypted and only once paid, made and
// mailed when due, retried and reported when failing, deleted after the last
// month or on the cancel link; nothing of it in a log line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactNearScheme } from '@x402/near/exact/server';
import { fixedRates } from '@le-space/eigenbeleg';
import { blocksFor } from '@eigenbeleg/pipeline';

import { createApp } from '../src/app.js';
import { subscriptionPriceOf } from '../src/paywall.js';
import { MONTHS, createStore, dueDate, isDue, newSubscription, nextMonthOf, runDue, subscriptionJob } from '../src/subscriptions.js';
import { recordedNear } from '../../agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const KEY = 'test-only-subscription-key-0123';
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const body = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], payer, email: 'belege@example.org' };
/** The clock of the tests: created in November, the first statement is due on 2 December. */
const NOV = new Date('2026-11-12T10:00:00Z');
const DEC2 = new Date('2026-12-02T03:00:00Z');
/** @param {Date} now */
const depsAt = (now) => ({ fetch: recordedNear(raw, { now: now.getTime() }), rates: fixedRates({ NEAR: '2' }), now: () => now, blocks: blocksFor({}) });

/** @param {import('express').Express} app */
async function serve(app) {
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	const { port } = /** @type {any} */ (server.address());
	return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}
/** @param {string} base @param {unknown} b @param {Record<string, string>} [headers] @param {string} [months] the route per months, e.g. '/3' */
const subscribe = (base, b, headers = {}, months = '') => globalThis.fetch(`${base}/eigenbeleg/subscribe${months}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b) });
const tick = () => new Promise((r) => setTimeout(r, 30));
const noPay = { middleware: null, info: { mode: 'none' } };

test('the store: one encrypted file per subscription, nothing readable without the key, torn or foreign files left alone', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-subs-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	assert.throws(() => createStore({ dir, key: 'short' }), /16 characters/);
	const store = createStore({ dir, key: KEY });
	assert.deepEqual(await store.list(), [], 'no directory yet is an empty list');
	const job = subscriptionJob(body, { today: '2026-11-12', blocks: blocksFor({}) });
	const s = newSubscription(job, { now: NOV, origin: 'https://eigenbeleg.example.org' });
	assert.match(s.id, /^[0-9a-f]{16}$/);
	assert.equal(s.monthsLeft, MONTHS);
	assert.equal(s.nextMonth, '2026-11');
	await store.put(s);
	const [name] = await readdir(dir);
	assert.equal(name, `${s.id}.json`);
	const onDisk = await readFile(join(dir, name), 'utf8');
	for (const secret of ['Wolkenfabrik', 'belege@', 'relay.aurora', s.token]) assert.ok(!onDisk.includes(secret), `${secret} is not on disk in clear`);
	assert.deepEqual(await store.get(s.id), s);
	assert.equal(await store.get('../etc/passwd'), null);
	assert.deepEqual((await store.list()).map((x) => x.id), [s.id]);
	assert.deepEqual(await createStore({ dir, key: 'another-key-of-16-or-more' }).list(), [], 'another key opens nothing');
	await store.remove(s.id);
	assert.deepEqual(await readdir(dir), []);
});

test('the request is checked like a paid one, without a period and with an e-mail address; months is the route\'s, twelve by default', () => {
	const blocks = blocksFor({});
	const job = subscriptionJob({ ...body, months: 12, logo: true, includeKinds: ['fee'] }, { today: '2026-11-12', blocks });
	// The route per months: the body may name them, and must then agree with the route.
	assert.deepEqual(subscriptionJob({ ...body, months: 3 }, { today: '2026-11-12', blocks, months: 3 }).addresses, ['relay.aurora']);
	assert.throws(() => subscriptionJob({ ...body, months: 3 }, { today: '2026-11-12', blocks, months: 6 }), /months: this route sells 6/);
	assert.equal(newSubscription(job, { now: NOV, origin: 'x', months: 3 }).monthsLeft, 3);
	assert.equal(subscriptionPriceOf('$0.10', 3), '$0.30');
	assert.equal(subscriptionPriceOf('$1.00', 1), '$1.00');
	assert.deepEqual(job, { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], payer, email: 'belege@example.org', includeKinds: ['fee'], logo: true, chart: true, document: 'kontoauszug', language: 'en' });
	assert.equal(subscriptionJob({ ...body, document: 'beide' }, { today: '2026-11-12', blocks }).document, 'beide');
	for (const [bad, why] of [
		[{ ...body, period: { month: '2026-10' } }, /period/],
		[{ ...body, months: 6 }, /months/],
		[{ ...body, email: undefined }, /email/],
		[{ ...body, email: 'nobody' }, /email/],
		[{ ...body, format: 'pdf' }, /format/],
		[{ ...body, chain: 'dogecoin' }, /building block/],
		[{ ...body, payer: { name: 'X' } }, /payer|name|address/]
	]) {
		assert.throws(() => subscriptionJob(bad, { today: '2026-11-12', blocks }), why, JSON.stringify(bad).slice(0, 60));
	}
	assert.equal(nextMonthOf('2026-12'), '2027-01');
	assert.equal(dueDate('2026-11'), '2026-12-02');
	assert.equal(isDue({ ...newSubscription(job, { now: NOV, origin: 'x' }) }, new Date('2026-12-01T23:59:59Z')), false);
	assert.equal(isDue({ ...newSubscription(job, { now: NOV, origin: 'x' }) }, DEC2), true);
	assert.equal(subscriptionPriceOf('$0.10'), '$1.20');
	assert.equal(subscriptionPriceOf('$1.00'), '$12.00');
});

test('POST /eigenbeleg/subscribe: checked before a price, stored once answered, cancelled by its link; nothing of it in the log', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-subs-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const store = createStore({ dir, key: KEY });
	/** @type {string[]} */
	const lines = [];
	const mailer = { send: async () => {} };
	const { base, close } = await serve(createApp({ paywall: noPay, deps: depsAt(NOV), log: (l) => lines.push(l), mailer, subscriptions: store, publicUrl: 'https://eigenbeleg.example.org' }));
	t.after(close);
	const home = await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json();
	assert.equal(home.subscription.endpoint, 'POST /eigenbeleg/subscribe');
	assert.match(home.privacy, /subscription/);
	assert.equal(home.subscription.months, 'POST /eigenbeleg/subscribe/<months>: the same for 1 to 12 months in advance, at months × the price of one request');
	assert.match(await (await globalThis.fetch(base + '/llms.txt')).text(), /POST .*\/eigenbeleg\/subscribe: a subscription, 12 monthly[^\n]*\/eigenbeleg\/subscribe\/<months> buys 1 to 12 months in advance at months × the price/);

	for (const bad of [{ ...body, period: { month: '2026-10' } }, { ...body, email: undefined }, { ...body, months: 3 }, { ...body, chain: 'x' }]) assert.equal((await subscribe(base, bad)).status, 400);
	// The route per months: 1 to 12, and the body's months must agree.
	for (const path of ['/0', '/13', '/x', '/1.5']) assert.equal((await subscribe(base, body, {}, path)).status, 400, path);
	assert.equal((await subscribe(base, { ...body, months: 6 }, {}, '/3')).status, 400);
	assert.deepEqual(await store.list(), [], 'a refused request stores nothing');
	const three = await (await subscribe(base, { ...body, months: 3 }, {}, '/3')).json();
	assert.equal(three.months, 3);
	await tick();
	assert.equal((await store.list()).find((x) => x.id === three.subscription)?.monthsLeft, 3);
	assert.equal((await globalThis.fetch(three.cancel.replace('https://eigenbeleg.example.org', base))).status, 200);

	const r = await subscribe(base, body);
	assert.equal(r.status, 200);
	const a = await r.json();
	assert.equal(a.months, 12);
	assert.equal(a.firstMonth, '2026-11');
	assert.equal(a.firstMailFrom, '2026-12-02');
	assert.equal(a.document, 'kontoauszug');
	assert.match(a.cancel, new RegExp(`^https://eigenbeleg\\.example\\.org/eigenbeleg/subscribe/${a.subscription}/cancel\\?token=[0-9a-f]{48}$`));
	await tick();
	const [stored] = await store.list();
	assert.equal(stored.id, a.subscription);
	assert.equal(stored.job.email, 'belege@example.org');

	// The cancel link: the token must match; then everything is gone, and the link is dead.
	assert.equal((await globalThis.fetch(`${base}/eigenbeleg/subscribe/${a.subscription}/cancel?token=wrong`)).status, 404);
	assert.equal((await globalThis.fetch(`${base}/eigenbeleg/subscribe/0123456789abcdef/cancel?token=${a.cancel.split('token=')[1]}`)).status, 404);
	const gone = await globalThis.fetch(a.cancel.replace('https://eigenbeleg.example.org', base));
	assert.equal(gone.status, 200);
	assert.match(await gone.text(), /beendet.*gelöscht/);
	assert.deepEqual(await store.list(), []);
	assert.equal((await globalThis.fetch(a.cancel.replace('https://eigenbeleg.example.org', base))).status, 404);
	assert.ok(lines.every((l) => !/Wolkenfabrik|belege@|example\.org|relay\.aurora|token/.test(l)), 'the log names the id only');
	assert.ok(lines.some((l) => l.includes(`subscription ${a.subscription}: cancelled`)));
});

test('without mail or without a store the route is refused before any payment, and GET / says so', async (t) => {
	for (const o of [{ mailer: { send: async () => {} } }, { subscriptions: createStore({ dir: tmpdir(), key: KEY }) }]) {
		const { base, close } = await serve(createApp({ paywall: noPay, deps: depsAt(NOV), log: () => {}, ...o }));
		t.after(close);
		const r = await subscribe(base, body);
		assert.equal(r.status, 400);
		assert.match((await r.json()).error, /not offered/);
		assert.equal((await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json()).subscription, 'not offered by this instance');
		assert.equal((await globalThis.fetch(`${base}/eigenbeleg/subscribe/0123456789abcdef/cancel?token=x`)).status, 404);
	}
});

test('behind the x402 paywall the subscription has its own price, and an unsettled payment stores nothing', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-subs-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const store = createStore({ dir, key: KEY });
	let settleOk = false;
	const facilitator = {
		verify: async () => ({ isValid: true, payer: 'agent.testnet' }),
		settle: async () => (settleOk ? { success: true, transaction: 'TXHASH', network: 'near:testnet', payer: 'agent.testnet' } : { success: false, errorReason: 'nope', transaction: '', network: 'near:testnet' }),
		getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'near:testnet' }], extensions: [], signers: {} })
	};
	const server = new x402ResourceServer(/** @type {any} */ (facilitator)).register('near:testnet', new ExactNearScheme());
	const accept = (/** @type {string} */ price) => ({ scheme: 'exact', price, network: 'near:testnet', payTo: 'eigenbeleg.testnet', maxTimeoutSeconds: 120 });
	const middleware = paymentMiddleware(/** @type {any} */ ({ 'POST /eigenbeleg': { accepts: [accept('$0.10')] }, 'POST /eigenbeleg/subscribe': { accepts: [accept('$1.20')] } }), server);
	const { base, close } = await serve(createApp({ paywall: { middleware, info: { mode: 'x402', subscription: { price: '$1.20' } } }, deps: depsAt(NOV), log: () => {}, mailer: { send: async () => {} }, subscriptions: store }));
	t.after(close);
	assert.equal((await subscribe(base, { ...body, chain: 'x' })).status, 400, 'refused before a price is named');
	const unpaid = await subscribe(base, body);
	assert.equal(unpaid.status, 402);
	const required = JSON.parse(Buffer.from(unpaid.headers.get('payment-required') ?? '', 'base64').toString());
	assert.equal(required.accepts[0].amount, '1200000', '1.20 USDC');
	const payload = { x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { signedDelegateAction: 'AAAA' } };
	const sig = { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') };
	const failed = await subscribe(base, body, sig);
	assert.equal(failed.status, 402, 'the settlement failed');
	await tick();
	assert.deepEqual(await store.list(), [], 'nothing stored without a settled payment');
	settleOk = true;
	const paid = await subscribe(base, body, sig);
	assert.equal(paid.status, 200);
	const a = await paid.json();
	await tick();
	assert.deepEqual((await store.list()).map((s) => s.id), [a.subscription]);
});

test('when due, the month before is made and mailed with the cancel link; the last month deletes the subscription', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-subs-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const store = createStore({ dir, key: KEY });
	/** @type {any[]} */
	const sent = [];
	const mailer = { send: async (/** @type {any} */ m) => void sent.push(m) };
	/** @type {string[]} */
	const lines = [];
	const job = subscriptionJob({ ...body, document: 'beide' }, { today: '2026-11-12', blocks: blocksFor({}) });
	const s = { ...newSubscription(job, { now: NOV, origin: 'https://eigenbeleg.example.org' }), monthsLeft: 2 };
	await store.put(s);

	// Not due yet: nothing happens.
	assert.deepEqual(await runDue({ store, deps: depsAt(new Date('2026-12-01T12:00:00Z')), mailer, log: (l) => lines.push(l) }), { made: [], failed: [] });
	assert.equal(sent.length, 0);

	// 2 December: November's statement goes out.
	assert.deepEqual(await runDue({ store, deps: depsAt(DEC2), mailer, log: (l) => lines.push(l) }), { made: [s.id], failed: [] });
	assert.equal(sent.length, 1);
	const [m] = sent;
	assert.equal(m.to, 'belege@example.org');
	assert.match(m.subject, /^Eigenbelege EB-.* · near mainnet · 2026-11-01 to 2026-11-30$/, 'English unless the subscription says de');
	assert.deepEqual(m.attachments.map((/** @type {any} */ a) => a.filename.replace(/EB-[^.]*/, 'EB-…')), ['EB-….pdf', 'KA-2026-11-01.pdf', 'EB-….csv']);
	assert.match(m.text, /^Hello,\n\nattached the Eigenbelege and the account statement for near \(mainnet\)/);
	assert.match(m.text, new RegExp(`From your Eigenbeleg API subscription \\(${s.id}\\): 1 month\\(s\\) left after this one`));
	assert.doesNotMatch(m.text, /Abo |Aus Ihrem Abo|Guten Tag/, 'one language per mail');
	assert.ok(m.text.includes(`Cancel the subscription (deletes every detail, no refund of the remaining months): https://eigenbeleg.example.org/eigenbeleg/subscribe/${s.id}/cancel?token=${s.token}`), 'the cancel link');
	assert.ok(m.html?.includes(`href="https://eigenbeleg.example.org/eigenbeleg/subscribe/${s.id}/cancel?token=${s.token}"`), 'the cancel link in the HTML too');
	assert.match(m.text, /For people, free, in the browser: https:\/\/eigenbeleg\.example\.org\/ui\//);
	assert.doesNotMatch(m.text, /Musterstraße/);
	const after = await store.get(s.id);
	assert.equal(after?.monthsLeft, 1);
	assert.equal(after?.nextMonth, '2026-12');
	// Running again the same day does nothing: December is not finished.
	assert.deepEqual(await runDue({ store, deps: depsAt(DEC2), mailer, log: () => {} }), { made: [], failed: [] });

	// 2 January: the last month, then the file is gone.
	assert.deepEqual(await runDue({ store, deps: depsAt(new Date('2027-01-02T03:00:00Z')), mailer, log: (l) => lines.push(l) }), { made: [s.id], failed: [] });
	assert.equal(sent.length, 2);
	assert.match(sent[1].text, /0 month\(s\) left/);
	assert.deepEqual(await store.list(), []);
	assert.ok(lines.every((l) => !/Wolkenfabrik|belege@|relay\.aurora|token/.test(l)));
	assert.ok(lines.some((l) => /last one; deleted/.test(l)));
});

test('a failed run is retried; after three days the subscriber hears about it once; a success clears it', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-subs-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const store = createStore({ dir, key: KEY });
	/** @type {any[]} */
	const sent = [];
	const mailer = { send: async (/** @type {any} */ m) => void sent.push(m) };
	const job = subscriptionJob(body, { today: '2026-11-12', blocks: blocksFor({}) });
	const s = newSubscription(job, { now: NOV, origin: 'https://eigenbeleg.example.org' });
	await store.put(s);
	const down = (/** @type {Date} */ now) => ({ ...depsAt(now), fetch: async () => new Response('down', { status: 503 }) });

	assert.deepEqual(await runDue({ store, deps: down(DEC2), mailer, log: () => {} }), { made: [], failed: [s.id] });
	assert.equal((await store.get(s.id))?.failingSince, DEC2.toISOString());
	assert.equal(sent.length, 0, 'not told on the first failure');
	assert.deepEqual(await runDue({ store, deps: down(new Date('2026-12-04T03:00:00Z')), mailer, log: () => {} }), { made: [], failed: [s.id] });
	assert.equal(sent.length, 0);
	await runDue({ store, deps: down(new Date('2026-12-05T04:00:00Z')), mailer, log: () => {} });
	assert.equal(sent.length, 1, 'told after three days');
	assert.match(sent[0].subject, /delayed/);
	assert.match(sent[0].text, /2026-11 .*since 2026-12-02/);
	assert.ok(sent[0].text.includes(`/subscribe/${s.id}/cancel?token=`));
	await runDue({ store, deps: down(new Date('2026-12-06T04:00:00Z')), mailer, log: () => {} });
	assert.equal(sent.length, 1, 'told once');
	assert.equal((await store.get(s.id))?.reported, true);

	assert.deepEqual(await runDue({ store, deps: depsAt(new Date('2026-12-07T04:00:00Z')), mailer, log: () => {} }), { made: [s.id], failed: [] });
	assert.equal(sent.length, 2);
	const after = await store.get(s.id);
	assert.equal(after?.failingSince, null);
	assert.equal(after?.reported, false);
	assert.equal(after?.nextMonth, '2026-12');
});
