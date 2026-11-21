// The paid route described for machines (describe.js): the schema and the
// example are held to the check and to a real answer, so they cannot drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { generatePrivateKey } from 'viem/accounts';
import { fixedRates } from '@le-space/eigenbeleg';
import { CURRENCIES, parseRequest } from '@eigenbeleg/pipeline';

import { createApp } from '../src/app.js';
import { createPaywall } from '../src/paywall.js';
import { REQUEST_EXAMPLE, REQUEST_SCHEMA, RESPONSE_EXAMPLE, openapi } from '../src/describe.js';
import { recordedNear } from '../../agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const deps = { fetch: recordedNear(raw), rates: fixedRates({ NEAR: '2' }), now: () => new Date('2026-11-06T10:00:00Z') };

/** @param {import('express').Express} app */
async function serve(app) {
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	const { port } = /** @type {any} */ (server.address());
	return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

test('the example passes the check, and the schema names what the check takes', () => {
	const job = parseRequest(REQUEST_EXAMPLE, { today: '2026-11-06' });
	assert.equal(job.chain, 'near');
	assert.equal(job.format, 'json');
	// Every field of the example is in the schema; what the schema requires, the check refuses when missing.
	for (const key of Object.keys(REQUEST_EXAMPLE)) assert.ok(key in REQUEST_SCHEMA.properties, key);
	for (const key of REQUEST_SCHEMA.required) {
		const { [key]: _gone, ...rest } = /** @type {Record<string, unknown>} */ (REQUEST_EXAMPLE);
		assert.throws(() => parseRequest(rest, { today: '2026-11-06' }), undefined, key);
	}
	// The enums are the check's own.
	for (const format of REQUEST_SCHEMA.properties.format.enum) assert.doesNotThrow(() => parseRequest({ ...REQUEST_EXAMPLE, format, document: 'eigenbelege' }, { today: '2026-11-06' }));
	assert.throws(() => parseRequest({ ...REQUEST_EXAMPLE, format: 'docx' }, { today: '2026-11-06' }));
	assert.deepEqual(REQUEST_SCHEMA.properties.currency.enum, CURRENCIES);
	for (const currency of REQUEST_SCHEMA.properties.currency.enum) assert.equal(parseRequest({ ...REQUEST_EXAMPLE, currency }, { today: '2026-11-06' }).currency, currency);
	assert.throws(() => parseRequest({ ...REQUEST_EXAMPLE, currency: 'JPY' }, { today: '2026-11-06' }));
	// No real person: the made-up payer of the README.
	assert.equal(REQUEST_EXAMPLE.payer.name, 'Wolkenfabrik Hosting GmbH');
});

test('every 402 of POST /eigenbeleg says what to send; a subscription\'s does not', async () => {
	const pw = await createPaywall({ mode: 'x402', networks: ['eip155:8453'], payToEvm: '0x1111111111111111111111111111111111111111', evmRelayerKey: generatePrivateKey() });
	const app = express();
	app.post('/eigenbeleg', express.json(), /** @type {any} */ (pw.middleware), (_req, res) => res.json({ ok: true }));
	app.post('/eigenbeleg/subscribe', express.json(), /** @type {any} */ (pw.middleware), (_req, res) => res.json({ ok: true }));
	const { base, close } = await serve(app);
	try {
		const required = async (/** @type {string} */ path) => {
			const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
			assert.equal(r.status, 402);
			return JSON.parse(Buffer.from(r.headers.get('payment-required') ?? '', 'base64').toString());
		};
		const one = await required('/eigenbeleg');
		const info = one.extensions.bazaar.info;
		assert.equal(info.input.type, 'http');
		assert.equal(info.input.method, 'POST');
		assert.equal(info.input.bodyType, 'json');
		assert.deepEqual(info.input.body, REQUEST_EXAMPLE);
		assert.deepEqual(info.output.example, RESPONSE_EXAMPLE);
		assert.ok(JSON.stringify(one.extensions.bazaar.schema).includes('"addresses"'), 'the body\'s schema travels with it');
		assert.equal(one.accepts[0].network, 'eip155:8453', 'the payment itself is as before');
		assert.equal((await required('/eigenbeleg/subscribe')).extensions?.bazaar, undefined);
	} finally {
		close();
	}
});

test('GET /openapi.json: the routes, the body, the price of this instance; the example is a real answer\'s shape', async () => {
	const info = { mode: 'x402', accepts: [{ network: 'near:mainnet', name: 'NEAR', asset: 'USDC (NEP-141)', price: '$0.10', payTo: 'wolkenfabrik.near' }] };
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info }, deps, log: () => {}, web: null, publicUrl: 'https://eigenbeleg.example.org' }));
	try {
		const res = await fetch(base + '/openapi.json');
		assert.equal(res.status, 200);
		const doc = await res.json();
		assert.equal(doc.openapi, '3.1.0');
		assert.deepEqual(doc.servers, [{ url: 'https://eigenbeleg.example.org' }]);
		assert.deepEqual(Object.keys(doc.paths), ['/eigenbeleg/preview', '/eigenbeleg', '/blocks', '/llms.txt']);
		const paid = doc.paths['/eigenbeleg'].post;
		assert.deepEqual(paid['x-payment-info'].accepts, [{ network: 'near:mainnet', asset: 'USDC (NEP-141)', price: '$0.10', payTo: 'wolkenfabrik.near' }]);
		assert.match(paid.responses[402].description, /\$0\.10 in USDC \(NEP-141\) on NEAR/);
		assert.equal(doc.paths['/eigenbeleg/preview'].post.responses[402], undefined, 'the preview is free');
		// The chains are this instance's, the same GET /blocks lists.
		const blocks = (await (await fetch(base + '/blocks')).json()).blocks.map((/** @type {any} */ b) => b.chain);
		assert.deepEqual(doc.components.schemas.Request.properties.chain.enum, blocks);
		assert.equal((await (await fetch(base + '/')).json()).openapi, '/openapi.json');
		assert.match(await (await fetch(base + '/llms.txt')).text(), /openapi\.json/);

		// What the example promises is in a real answer.
		const answer = await (await fetch(base + '/eigenbeleg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain: 'near', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, format: 'json', payer: REQUEST_EXAMPLE.payer }) })).json();
		for (const key of Object.keys(RESPONSE_EXAMPLE)) assert.ok(key in answer, key);
	} finally {
		close();
	}
	// Free in development: no 402 and no price in the description.
	const free = openapi({ base: '', payment: { mode: 'none' }, chains: ['near'], terms: '/ui/#agb', source: 'https://example.org/src' });
	assert.equal(free.paths['/eigenbeleg'].post.responses[402], undefined);
	assert.equal(free.paths['/eigenbeleg'].post['x-payment-info'], undefined);
	assert.equal(free.servers, undefined);
});
