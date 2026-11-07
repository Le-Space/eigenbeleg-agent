import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactNearScheme } from '@x402/near/exact/server';
import { fixedRates } from '@eigenbeleg/eigenbeleg';

import { createApp } from '../src/app.js';
import { recordedNear } from '../../agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
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

		const only = await (await post(base, { ...job, format: 'json' })).json();
		assert.ok(only.pdf && !only.kontoauszuegePdf, 'Eigenbelege only, unless both are asked for');
		const kaOnly = await (await post(base, { ...job, format: 'json', document: 'kontoauszug' })).json();
		assert.ok(!kaOnly.pdf && kaOnly.kontoauszuegePdf.length === 1);
		assert.equal((await post(base, { ...job, document: 'beide' })).status, 400, 'a PDF is one document');
		const both = await (await post(base, { ...job, format: 'json', document: 'beide' })).json();
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

const preview = (base, body, path = '/eigenbeleg/preview') =>
	globalThis.fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the free preview: the summary without the payer, the same checks, a limit per IP', async () => {
	const lines = [];
	let reads = 0;
	const counting = { ...deps, fetch: async (/** @type {string} */ u, /** @type {any} */ init) => (reads++, deps.fetch(u, init)) };
	const app = createApp({ paywall: { middleware: null, info: { mode: 'near' } }, deps: counting, log: (l) => lines.push(l), web: null, previewLimit: { max: 4, windowMs: 60_000 } });
	const { base, close } = await serve(app);
	const { payer: _payer, ...body } = job;
	try {
		const r = await preview(base, body);
		assert.equal(r.status, 200);
		const s = await r.json();
		assert.equal(s.number, 'EB-2026-042 – EB-2026-066');
		assert.equal(s.eigenbelege.length, 25);
		assert.equal(s.positions, raw.txns.length);
		assert.equal(typeof s.totalEur, 'string');
		assert.equal(s.kontoauszuege.length, 0, 'Eigenbelege only, by default');
		const both = await (await preview(base, { ...body, document: 'beide' })).json();
		assert.equal(both.kontoauszuege.length, 1, 'the preview shows the Kontoauszug balances when it is asked for');
		assert.equal(both.kontoauszuege[0].account, 'relay.aurora');
		assert.equal(s.pdf, undefined);
		assert.doesNotMatch(JSON.stringify(s), /preview|Wolkenfabrik/);
		for (const [k, v] of r.headers) assert.doesNotMatch(`${k}: ${v}`, /totalEur|positions|EB-2026/i, k);

		const before = reads;
		// The payer's name and address never go to the free route.
		assert.equal((await preview(base, job)).status, 400);
		assert.equal((await preview(base, { ...body, chain: 'dogecoin' })).status, 400);
		assert.equal(reads, before, 'nothing is read for a refused body');
		assert.equal((await preview(base, body)).status, 429, 'the fifth preview in a minute');

		for (const path of ['/eigenbeleg/preview/', '/eigenbeleg/Preview']) assert.equal((await preview(base, body, path)).status, 404, path);
		assert.ok(lines.every((l) => !/Wolkenfabrik|Musterstraße|relay\.aurora/.test(l)));
	} finally {
		close();
	}
});

test('the preview is free behind the paywall; the payment window fits browser wallets', async () => {
	const facilitator = {
		verify: async () => ({ isValid: true }),
		settle: async () => ({ success: true, transaction: 'T', network: 'near:testnet' }),
		getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: 'near:testnet' }], extensions: [], signers: {} })
	};
	const server = new x402ResourceServer(/** @type {any} */ (facilitator)).register('near:testnet', new ExactNearScheme());
	const middleware = paymentMiddleware(/** @type {any} */ ({ 'POST /eigenbeleg': { accepts: [{ scheme: 'exact', price: '$0.10', network: 'near:testnet', payTo: 'eigenbeleg.testnet' }] } }), server);
	const { base, close } = await serve(createApp({ paywall: { middleware, info: { mode: 'near' } }, deps, log: () => {}, web: null }));
	const { payer: _payer, ...body } = job;
	try {
		assert.equal((await preview(base, body)).status, 200);
		assert.equal((await post(base, job)).status, 402);
	} finally {
		close();
	}
	// Meteor signs with 200 blocks ahead; the route must accept that (1 block ≈ 1 s).
	const src = await readFile(new URL('../src/paywall.js', import.meta.url), 'utf8');
	assert.match(src, /maxTimeoutSeconds: c\.timeoutSeconds \?\? 300/);
});

test('GET /ui/ serves the built PWA with the build\'s CSP; no UI, no route', async () => {
	const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const dir = await mkdtemp(`${tmpdir()}/eb-web-`);
	await mkdir(`${dir}/assets`);
	await writeFile(`${dir}/index.html`, '<script type="module" src="./assets/app.js"></script>');
	await writeFile(`${dir}/assets/app.js`, 'export {};');
	await writeFile(`${dir}/sw.js`, '// sw');
	await writeFile(`${dir}/csp.txt`, "default-src 'self'; connect-src 'self' https://api.nearblocks.io\n");
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: dir }));
	try {
		const a = await globalThis.fetch(base + '/ui/');
		assert.equal(a.status, 200);
		assert.equal(a.headers.get('content-security-policy'), "default-src 'self'; connect-src 'self' https://api.nearblocks.io; frame-ancestors 'none'");
		assert.equal(a.headers.get('referrer-policy'), 'no-referrer');
		const sw = await globalThis.fetch(base + '/ui/sw.js');
		assert.equal(sw.status, 200);
		assert.doesNotMatch(sw.headers.get('cache-control') ?? '', /immutable/);
		assert.equal((await globalThis.fetch(base + '/ui/nope.png')).status, 404);
		assert.equal((await globalThis.fetch(base + '/ui/assets/app.js')).status, 200);
		assert.equal((await globalThis.fetch(base + '/ui/assets/nope.js')).status, 404);
		assert.equal((await (await globalThis.fetch(base + '/')).json()).ui, '/ui/');
		// Content negotiation on /: a browser goes to the UI, agents and curl get JSON.
		const browser = await globalThis.fetch(base + '/', { redirect: 'manual', headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } });
		assert.equal(browser.status, 302);
		assert.equal(browser.headers.get('location'), '/ui/');
		assert.match(browser.headers.get('vary') ?? '', /Accept/);
		for (const accept of ['application/json', '*/*', '']) {
			const r = await globalThis.fetch(base + '/', { redirect: 'manual', headers: accept ? { accept } : {} });
			assert.equal(r.status, 200, accept || '(none)');
			assert.equal((await r.json()).service, 'eigenbeleg');
			assert.match(r.headers.get('vary') ?? '', /Accept/);
		}
	} finally {
		close();
	}
	const none = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: null }));
	try {
		assert.equal((await globalThis.fetch(none.base + '/ui/')).status, 404);
		const html = await globalThis.fetch(none.base + '/', { redirect: 'manual', headers: { accept: 'text/html' } });
		assert.equal(html.status, 200, 'without a built UI a browser gets the JSON too');
	} finally {
		none.close();
	}
});

test('the share cards get absolute URLs: PUBLIC_URL, else the request origin, never an odd Host', async () => {
	const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const { request } = await import('node:http');
	const dir = await mkdtemp(`${tmpdir()}/eb-web-`);
	await mkdir(`${dir}/social`);
	await writeFile(`${dir}/index.html`, '<meta property="og:image" content="__PUBLIC_URL__/ui/social/eigenbeleg-de.png">');
	await writeFile(`${dir}/social/eigenbeleg-de.png`, 'png');
	/** GET /ui/ with a chosen Host header (fetch cannot set one) */
	const get = (/** @type {string} */ base, /** @type {Record<string, string>} */ headers) =>
		new Promise((resolve, reject) => {
			const u = new URL(base + '/ui/');
			request({ host: u.hostname, port: u.port, path: u.pathname, headers }, (res) => {
				let body = '';
				res.on('data', (c) => (body += c));
				res.on('end', () => resolve(body));
			})
				.on('error', reject)
				.end();
		});
	const opts = { paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: dir };
	const fixed = await serve(createApp({ ...opts, publicUrl: 'https://eigenbeleg.example.org/' }));
	try {
		assert.match(await get(fixed.base, { host: 'evil.example' }), /content="https:\/\/eigenbeleg\.example\.org\/ui\/social\/eigenbeleg-de\.png"/);
		const png = await globalThis.fetch(fixed.base + '/ui/social/eigenbeleg-de.png');
		assert.equal(png.status, 200);
		assert.match(png.headers.get('content-type') ?? '', /image\/png/);
		assert.equal((await globalThis.fetch(fixed.base + '/ui/social/nope.png')).status, 404);
	} finally {
		fixed.close();
	}
	const derived = await serve(createApp(opts));
	try {
		assert.match(await get(derived.base, { host: 'eigenbeleg.example.org', 'x-forwarded-proto': 'https' }), /content="https:\/\/eigenbeleg\.example\.org\/ui\//);
		assert.match(await get(derived.base, { host: 'localhost:4402' }), /content="http:\/\/localhost:4402\/ui\//);
		assert.match(await get(derived.base, { host: 'a"onload="x' }), /content="\/ui\//, 'an odd Host leaves a relative URL, nothing injected');
	} finally {
		derived.close();
	}
});

test('GET /llms.txt tells agents what is sold, the price and the x402 steps', async () => {
	const info = { mode: 'near', scheme: 'exact', network: 'near:testnet', price: '$0.10', asset: 'USDC (NEP-141)', payTo: 'eigenbeleg-api.testnet' };
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info }, deps, log: () => {}, web: null, publicUrl: 'https://eigenbeleg.example.org' }));
	try {
		const r = await globalThis.fetch(base + '/llms.txt');
		assert.equal(r.status, 200);
		assert.match(r.headers.get('content-type') ?? '', /^text\/plain/);
		const text = await r.text();
		assert.match(text, /^# Eigenbeleg API/);
		assert.match(text, /POST https:\/\/eigenbeleg\.example\.org\/eigenbeleg: \$0\.10 in USDC \(NEP-141\) on near:testnet, to eigenbeleg-api\.testnet/);
		assert.match(text, /PAYMENT-REQUIRED[\s\S]*PAYMENT-SIGNATURE[\s\S]*PAYMENT-RESPONSE/);
		assert.match(text, /web UI at https:\/\/eigenbeleg\.example\.org\/ui\/ instead: it does everything in their browser/);
		assert.match(text, /"chain": "near" \| "akash" \| "filecoin" \| "aleph"/);
		assert.match(text, /- aleph \(Aleph Cloud credits/);
		assert.equal((await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json()).agents, '/llms.txt');
	} finally {
		close();
	}
});
