// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle } from '../worker.js';

const env = { ALLOWED_ORIGINS: 'https://eigenbeleg.le-space.de, http://localhost:5173' };
const ORIGIN = 'https://eigenbeleg.le-space.de';
const ADDR = 'akash1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu';
const HASH = 'A'.repeat(64);
/** @type {string[]} */
let asked = [];
const upstream = /** @type {typeof fetch} */ (async (/** @type {any} */ u) => {
	asked.push(String(u));
	return new Response('{"transactions":[]}', { headers: { 'content-type': 'application/json', 'set-cookie': 'x=1' } });
});
const req = (/** @type {string} */ path, /** @type {RequestInit & { origin?: string }} */ o = {}) =>
	new Request(`https://proxy.example${path}`, { method: o.method ?? 'GET', headers: { origin: o.origin ?? ORIGIN, 'cf-connecting-ip': '203.0.113.7' } });

test('forwards the two read paths, with CORS for our origin and nothing kept', async () => {
	asked = [];
	for (const path of [`/v1/addresses/${ADDR}/transactions/0/100`, `/v1/transactions/${HASH}`, '/v1/blocks/24680']) {
		const r = await handle(req(path), env, null, upstream);
		assert.equal(r.status, 200, path);
		assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
		assert.equal(r.headers.get('cache-control'), 'no-store');
		assert.equal(r.headers.get('set-cookie'), null, 'only the content type is passed on');
		assert.deepEqual(await r.json(), { transactions: [] });
	}
	assert.deepEqual(asked, [`https://console-api.akash.network/v1/addresses/${ADDR}/transactions/0/100`, `https://console-api.akash.network/v1/transactions/${HASH}`, 'https://console-api.akash.network/v1/blocks/24680']);
});

test('refuses other origins, methods, paths and queries without asking upstream', async () => {
	asked = [];
	const cases = [
		[req(`/v1/transactions/${HASH}`, { origin: 'https://evil.example' }), 403],
		[req(`/v1/transactions/${HASH}`, { origin: '' }), 403],
		[req(`/v1/transactions/${HASH}`, { method: 'POST' }), 405],
		[req('/v1/dashboard-data'), 404],
		[req(`/v1/addresses/${ADDR}/transactions/0/100?x=1`), 404],
		[req('/v1/addresses/cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu/transactions/0/1'), 404],
		[req(`/v1/transactions/${HASH}/../../graphql`), 404],
		[req('/v1/blocks/latest'), 404],
		[req('/'), 404]
	];
	for (const [r, status] of cases) assert.equal((await handle(/** @type {Request} */ (r), env, null, upstream)).status, status, /** @type {Request} */ (r).url);
	assert.deepEqual(asked, []);
	const pre = await handle(req(`/v1/transactions/${HASH}`, { method: 'OPTIONS' }), env, null, upstream);
	assert.equal(pre.status, 204);
	assert.equal(pre.headers.get('access-control-allow-methods'), 'GET');
});

test('a rate limit per IP, when the binding is there', async () => {
	/** @type {string[]} */
	const keys = [];
	const limited = { ...env, LIMITER: { limit: async (/** @type {{ key: string }} */ o) => (keys.push(o.key), { success: false }) } };
	const r = await handle(req(`/v1/transactions/${HASH}`), limited, null, upstream);
	assert.equal(r.status, 429);
	assert.deepEqual(keys, ['203.0.113.7']);
});
