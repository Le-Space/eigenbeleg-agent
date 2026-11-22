// SPDX-License-Identifier: AGPL-3.0-or-later
// A preview's logo (Le-Space/belege#906): kept for 24 hours under an id only the
// caller has, unreadable on disk, deleted by the sweep; the paid request and the
// subscription take the id instead of the picture; nothing of it in a log line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fixedRates } from '@le-space/eigenbeleg';
import { sampleJpeg, samplePng } from '@le-space/pdf/testing/sample-images';

import { createApp } from '../src/app.js';
import { LOGO_TTL_MS, createLogoStore } from '../src/logos.js';
import { createStore } from '../src/subscriptions.js';
import { recordedNear } from '../../agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-11-06T10:00:00Z');
const HOUR = 3600_000;

test('the store: a picture under a random id, sealed on disk, gone after 24 hours; the sweep deletes it', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-logos-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	let at = NOW.getTime();
	const store = createLogoStore({ dir, now: () => new Date(at), maxFiles: 3 });
	const a = await store.put(sampleJpeg());
	assert.match(a?.id ?? '', /^[0-9a-f]{64}$/);
	assert.equal(a?.until, new Date(at + LOGO_TTL_MS).toISOString());
	assert.deepEqual((await store.get(a?.id))?.bytes, sampleJpeg());
	// On disk: one file, named by a hash of the id, the picture and the id not in it.
	const [name] = await readdir(dir);
	assert.match(name, /^[0-9a-f]{32}\.logo$/);
	assert.ok(!(a?.id ?? '').includes(name.slice(0, 32)));
	const file = await readFile(join(dir, name));
	assert.equal(file.indexOf(Buffer.from(sampleJpeg().subarray(0, 16))), -1);
	// Another id, a wrong one, or none opens nothing.
	for (const id of ['0'.repeat(64), `${a?.id}0`, '../x', 12, null, undefined]) assert.equal(await store.get(id), null);
	// A file whose time was changed does not open either.
	const forged = Buffer.from(file);
	forged.writeBigUInt64BE(BigInt(at + HOUR));
	await writeFile(join(dir, name), forged);
	assert.equal(await store.get(a?.id), null);
	await writeFile(join(dir, name), file);

	// 23 hours later it is there and the sweep leaves it; an hour on it is gone, swept or not.
	at += 23 * HOUR;
	const b = await store.put(samplePng());
	assert.equal(await store.sweep(), 0);
	assert.ok(await store.get(a?.id));
	at += HOUR;
	assert.equal(await store.get(a?.id), null, 'not opened once the day is over');
	await writeFile(join(dir, '0123456789abcdef.tmp'), 'torn');
	await writeFile(join(dir, 'README'), 'not ours');
	assert.equal(await store.sweep(), 2, 'the old picture and the torn write');
	assert.deepEqual((await readdir(dir)).length, 2);
	assert.deepEqual((await store.get(b?.id))?.bytes, samplePng());

	// A full store keeps nothing more, until the sweep made room.
	assert.ok(await store.put(samplePng()));
	assert.ok(await store.put(samplePng()));
	assert.equal(await store.put(samplePng()), null);
	at += 25 * HOUR;
	assert.equal(await store.sweep(), 3);
	assert.ok(await store.put(samplePng()));
	// A directory that cannot be written keeps nothing and breaks nothing.
	assert.equal(await createLogoStore({ dir: join(dir, 'README', 'x') }).put(samplePng()), null);
});

test('the preview keeps a picture for 24 hours; the paid request and the subscription take its id', async (t) => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-logos-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	let at = NOW.getTime();
	const now = () => new Date(at);
	const deps = { fetch: recordedNear(raw, { now: NOW.getTime() }), rates: fixedRates({ NEAR: '2' }), now };
	const logos = createLogoStore({ dir: join(dir, 'logos'), now });
	const subscriptions = createStore({ dir, key: 'test-only-subscription-key-0123' });
	/** @type {string[]} */
	const lines = [];
	/** @type {any[]} */
	const sent = [];
	const app = createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, logos, subscriptions, mailer: { send: async (m) => void sent.push(m) }, log: (l) => lines.push(l), web: null, previewLimit: { max: 50, windowMs: 60_000 } });
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	t.after(() => server.close());
	const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
	const post = (/** @type {string} */ path, /** @type {unknown} */ body) => globalThis.fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const text = (/** @type {Uint8Array} */ b) => Buffer.from(b).toString('base64');
	const images = (/** @type {Buffer} */ pdf) => (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;
	const request = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' } };
	const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };

	// Without a picture the preview keeps nothing and names no id.
	const plain = await (await post('/eigenbeleg/preview', request)).json();
	assert.ok(!('issuerLogoId' in plain));
	// With one: the summary, the id and until when.
	const p = await (await post('/eigenbeleg/preview', { ...request, issuerLogo: text(samplePng()) })).json();
	assert.match(p.issuerLogoId, /^[0-9a-f]{64}$/);
	assert.equal(p.issuerLogoUntil, new Date(at + LOGO_TTL_MS).toISOString());
	assert.equal(p.positions, plain.positions);
	assert.equal((await readdir(join(dir, 'logos'))).length, 1);
	// A picture that is refused is not kept.
	assert.equal((await post('/eigenbeleg/preview', { ...request, issuerLogo: text(new Uint8Array(64)) })).status, 400);
	assert.equal((await readdir(join(dir, 'logos'))).length, 1);

	// The paid request with the id carries the picture; the preview takes the id too and keeps no second copy.
	const paid = await post('/eigenbeleg', { ...request, payer, issuerLogoId: p.issuerLogoId });
	assert.equal(paid.status, 200);
	assert.equal(images(Buffer.from(await paid.arrayBuffer())), 1);
	const again = await post('/eigenbeleg/preview', { ...request, issuerLogoId: p.issuerLogoId });
	assert.equal(again.status, 200);
	assert.ok(!('issuerLogoId' in (await again.json())));
	assert.equal((await readdir(join(dir, 'logos'))).length, 1);
	// The subscription takes the id and keeps the picture with its own details.
	const sub = await post('/eigenbeleg/subscribe', { ...request, period: undefined, document: 'beide', payer, email: 'belege@example.org', issuerLogoId: p.issuerLogoId });
	assert.equal(sub.status, 200);
	await new Promise((r) => setTimeout(r, 30));
	const [kept] = await subscriptions.list();
	assert.equal(typeof kept.job.issuerLogo, 'string');
	assert.ok(!('issuerLogoId' in kept.job));

	// Refused with the reason: both at once, an id that is none, an unknown one.
	const why = async (/** @type {object} */ more) => {
		const r = await post('/eigenbeleg', { ...request, payer, ...more });
		assert.equal(r.status, 400);
		return (await r.json()).error;
	};
	assert.match(await why({ issuerLogoId: p.issuerLogoId, issuerLogo: text(samplePng()) }), /^issuerLogoId: either the id a preview answered with or issuerLogo, not both/);
	assert.match(await why({ issuerLogoId: 'abc' }), /^issuerLogoId: no such picture \(a preview's picture is kept for 24 hours\)/);
	assert.match(await why({ issuerLogoId: 'f'.repeat(64) }), /^issuerLogoId: no such picture/);
	// After 24 hours the id opens nothing, and the sweep removes the file.
	at += LOGO_TTL_MS;
	assert.match(await why({ issuerLogoId: p.issuerLogoId, period: { from: '2026-11-01', to: '2026-11-01' } }), /^issuerLogoId: no such picture/);
	assert.equal(await logos.sweep(), 1);
	assert.deepEqual(await readdir(join(dir, 'logos')), []);

	// The id is the key to the picture: in no log line.
	assert.ok(lines.length > 5 && lines.every((l) => l.length < 400 && !l.includes(p.issuerLogoId) && !l.includes(p.issuerLogoId.slice(0, 16))));

	// An instance without the store checks the picture, keeps none and says so for an id.
	const bare = createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: null }).listen(0, '127.0.0.1');
	await new Promise((r) => bare.once('listening', r));
	t.after(() => bare.close());
	const bareBase = `http://127.0.0.1:${/** @type {any} */ (bare.address()).port}`;
	const call = (/** @type {string} */ path, /** @type {unknown} */ body) => globalThis.fetch(bareBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	assert.ok(!('issuerLogoId' in (await (await call('/eigenbeleg/preview', { ...request, issuerLogo: text(samplePng()) })).json())));
	assert.match((await (await call('/eigenbeleg', { ...request, payer, issuerLogoId: 'f'.repeat(64) })).json()).error, /^issuerLogoId: this instance keeps no pictures/);
	const llms = await (await globalThis.fetch(bareBase + '/llms.txt')).text();
	assert.match(llms, /No picture of a preview is kept here/);
	assert.match(await (await globalThis.fetch(base + '/llms.txt')).text(), /kept on this server for 24 hours, encrypted, and then deleted: the preview answers with `issuerLogoId` and `issuerLogoUntil`/);
});
