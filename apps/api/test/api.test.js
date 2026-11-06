import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactNearScheme } from '@x402/near/exact/server';
import { fixedRates } from '@eigenbeleg/rates';

import { createApp } from '../src/app.js';
import { recordedNear } from '../../agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/chain-near/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
/** NearBlocks and the archival RPC, as the fixture has them. */
const fetch = recordedNear(raw);
const deps = { fetch, rates: fixedRates({ NEAR: '2' }), now: () => new Date('2026-11-06T10:00:00Z') };
const job = {
	chain: 'near',
	network: 'mainnet',
	addresses: ['relay.aurora'],
	period: { from: '2026-11-01', to: '2026-11-01' },
	payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' },
	number: 'EB-2026-042'
};

/** @param {import('express').Express} app */
async function serve(app) {
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	const { port } = /** @type {any} */ (server.address());
	return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}
const post = (base, body, headers = {}) => globalThis.fetch(`${base}/eigenbeleg`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('without a paywall: PDF, CSV and JSON; bad requests are 400 before anything is fetched', async () => {
	const lines = [];
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: (l) => lines.push(l) }));
	try {
		const pdf = await post(base, job);
		assert.equal(pdf.status, 200);
		assert.equal(pdf.headers.get('content-type'), 'application/pdf');
		assert.match(pdf.headers.get('content-disposition') ?? '', /EB-2026-042\.pdf/);
		assert.ok(Buffer.from(await pdf.arrayBuffer()).subarray(0, 8).toString() === '%PDF-1.7');

		const csv = await post(base, { ...job, format: 'csv' });
		assert.match(Buffer.from(await csv.arrayBuffer()).toString('utf8'), /^\uFEFFBelegnummer;/);

		const both = await (await post(base, { ...job, format: 'json' })).json();
		assert.equal(both.eigenbelege[0], 'EB-2026-042');
		assert.equal(both.eigenbelege.length, raw.txns.length);
		assert.equal(both.kontoauszuegePdf.length, 1);
		assert.deepEqual(both.kontoauszuege[0].assets.map((a) => [a.asset, a.reconciled]), [['NEAR', true]]);

		const ka = await post(base, { ...job, document: 'kontoauszug' });
		assert.equal(ka.status, 200);
		assert.match(ka.headers.get('content-disposition') ?? '', /KA-2026-11-01\.pdf/);
		assert.equal(Buffer.from(await ka.arrayBuffer()).subarray(0, 8).toString(), '%PDF-1.7');
		assert.equal((await post(base, { ...job, document: 'kontoauszug', addresses: ['relay.aurora', 'aurora'] })).status, 400);
		assert.equal(both.positions, raw.txns.length);
		assert.ok(both.pdf.length > 1000 && both.csv.length > 100);

		for (const bad of [{ ...job, chain: 'dogecoin' }, { ...job, addresses: ['../x'] }, { ...job, payer: { name: 'X' } }, { ...job, period: { month: '2026-13' } }, { ...job, number: '<script>' }]) {
			const r = await post(base, bad);
			assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 60));
		}
		// The log has no names, addresses or bodies.
		assert.ok(lines.every((l) => !/Wolkenfabrik|Musterstraße|relay\.aurora/.test(l)));
		assert.ok(lines.some((l) => / POST \/eigenbeleg 200 /.test(l)));
	} finally {
		close();
	}
});

test('with the x402 NEAR paywall: 402 with PAYMENT-REQUIRED, then the PDF once settled', async () => {
	const settled = [];
	const facilitator = {
		verify: async () => ({ isValid: true, payer: 'agent.testnet' }),
		settle: async (payload) => {
			settled.push(payload);
			return { success: true, transaction: 'TXHASH', network: 'near:testnet', payer: 'agent.testnet' };
		},
		getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'near:testnet' }], extensions: [], signers: {} })
	};
	const server = new x402ResourceServer(/** @type {any} */ (facilitator)).register('near:testnet', new ExactNearScheme());
	const middleware = paymentMiddleware(
		/** @type {any} */ ({ 'POST /eigenbeleg': { accepts: [{ scheme: 'exact', price: '$0.10', network: 'near:testnet', payTo: 'eigenbeleg.testnet', maxTimeoutSeconds: 120 }], description: 'Eigenbeleg' } }),
		server
	);
	const { base, close } = await serve(createApp({ paywall: { middleware, info: { mode: 'near' } }, deps, log: () => {} }));
	try {
		// an invalid job is refused before a price is named
		assert.equal((await post(base, { ...job, chain: 'x' })).status, 400);

		const unpaid = await post(base, job);
		assert.equal(unpaid.status, 402);
		const required = JSON.parse(Buffer.from(unpaid.headers.get('payment-required') ?? '', 'base64').toString());
		assert.equal(required.x402Version, 2);
		const [accept] = required.accepts;
		assert.deepEqual([accept.scheme, accept.network, accept.payTo, accept.amount, accept.asset], ['exact', 'near:testnet', 'eigenbeleg.testnet', '100000', '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af']);
		assert.equal(settled.length, 0);

		const payload = { x402Version: 2, resource: required.resource, accepted: accept, payload: { signedDelegateAction: 'AAAA' } };
		const paid = await post(base, job, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') });
		assert.equal(paid.status, 200);
		assert.equal(paid.headers.get('content-type'), 'application/pdf');
		const receipt = JSON.parse(Buffer.from(paid.headers.get('payment-response') ?? '', 'base64').toString());
		assert.equal(receipt.transaction, 'TXHASH');
		assert.equal(settled.length, 1);
	} finally {
		close();
	}
});

test('a failed chain read is not charged', async () => {
	let settles = 0;
	const facilitator = {
		verify: async () => ({ isValid: true }),
		settle: async () => (settles++, { success: true, transaction: 'T', network: 'near:testnet' }),
		getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'near:testnet' }], extensions: [], signers: {} })
	};
	const server = new x402ResourceServer(/** @type {any} */ (facilitator)).register('near:testnet', new ExactNearScheme());
	const middleware = paymentMiddleware(/** @type {any} */ ({ 'POST /eigenbeleg': { accepts: [{ scheme: 'exact', price: '$0.10', network: 'near:testnet', payTo: 'eigenbeleg.testnet' }] } }), server);
	const broken = { ...deps, fetch: async () => new Response('down', { status: 503 }) };
	const { base, close } = await serve(createApp({ paywall: { middleware, info: { mode: 'near' } }, deps: broken, log: () => {} }));
	try {
		const required = JSON.parse(Buffer.from((await post(base, job)).headers.get('payment-required') ?? '', 'base64').toString());
		const payload = { x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { signedDelegateAction: 'AAAA' } };
		const r = await post(base, job, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') });
		assert.equal(r.status, 502);
		assert.equal(settles, 0);
	} finally {
		close();
	}
});

test('the paid route has one spelling; a failed settlement leaks nothing of the result', async () => {
	const facilitator = {
		verify: async () => ({ isValid: true }),
		settle: async () => ({ success: false, errorReason: 'settlement_failed', transaction: '', network: 'near:testnet' }),
		getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'near:testnet' }], extensions: [], signers: {} })
	};
	const server = new x402ResourceServer(/** @type {any} */ (facilitator)).register('near:testnet', new ExactNearScheme());
	const middleware = paymentMiddleware(/** @type {any} */ ({ 'POST /eigenbeleg': { accepts: [{ scheme: 'exact', price: '$0.10', network: 'near:testnet', payTo: 'eigenbeleg.testnet' }] } }), server);
	const { base, close } = await serve(createApp({ paywall: { middleware, info: { mode: 'near' } }, deps, log: () => {} }));
	try {
		for (const path of ['/eigenbeleg/', '/EIGENBELEG', '/Eigenbeleg']) {
			const r = await globalThis.fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job) });
			assert.equal(r.status, 404, path);
		}
		const required = JSON.parse(Buffer.from((await post(base, { ...job, format: 'json' })).headers.get('payment-required') ?? '', 'base64').toString());
		const payload = { x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { signedDelegateAction: 'AAAA' } };
		const r = await post(base, { ...job, format: 'json' }, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') });
		assert.equal(r.status, 402);
		const text = await r.text();
		assert.doesNotMatch(text, /totalEur|positions|Belegnummer/);
		for (const [k, v] of r.headers) assert.doesNotMatch(`${k}: ${v}`, /totalEur|positions|filename/i, k);
	} finally {
		close();
	}
});

test('GET / names the licence and where the running source is (AGPL section 13)', async () => {
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, source: 'https://example.com/fork' }));
	try {
		const info = await (await globalThis.fetch(base + '/')).json();
		assert.equal(info.license, 'AGPL-3.0-or-later');
		assert.equal(info.source, 'https://example.com/fork');
	} finally {
		close();
	}
});
