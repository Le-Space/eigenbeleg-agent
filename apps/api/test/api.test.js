import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactNearScheme } from '@x402/near/exact/server';
import { fixedRates } from '@le-space/eigenbeleg';

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
	const sent = [];
	const mailer = { send: async (m) => void sent.push(m) };
	const { base, close } = await serve(createApp({ paywall: { middleware, info: { mode: 'near' } }, deps, log: () => {}, mailer }));
	try {
		for (const path of ['/eigenbeleg/', '/EIGENBELEG', '/Eigenbeleg']) {
			const r = await globalThis.fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job) });
			assert.equal(r.status, 404, path);
		}
		const required = JSON.parse(Buffer.from((await post(base, { ...job, format: 'json' })).headers.get('payment-required') ?? '', 'base64').toString());
		const payload = { x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { signedDelegateAction: 'AAAA' } };
		const r = await post(base, { ...job, format: 'json', email: 'belege@example.org' }, { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') });
		assert.equal(r.status, 402);
		const text = await r.text();
		assert.doesNotMatch(text, /totalEur|positions|Belegnummer/);
		for (const [k, v] of r.headers) assert.doesNotMatch(`${k}: ${v}`, /totalEur|positions|filename/i, k);
		await new Promise((res) => setTimeout(res, 20));
		assert.equal(sent.length, 0, 'an unsettled payment gets no mail');
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
	assert.match(src, /const timeout = c\.timeoutSeconds \?\? 300/);
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
	const info = {
		mode: 'x402',
		scheme: 'exact',
		accepts: [
			{ network: 'near:testnet', name: 'NEAR testnet', asset: 'USDC (NEP-141, testnet)', price: '$0.10', payTo: 'eigenbeleg-api.testnet' },
			{ network: 'eip155:8453', name: 'Base', asset: 'USDC (ERC-20, EIP-3009)', price: '$0.10', payTo: '0x1111111111111111111111111111111111111111' }
		]
	};
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info }, deps, log: () => {}, web: null, publicUrl: 'https://eigenbeleg.example.org' }));
	try {
		const r = await globalThis.fetch(base + '/llms.txt');
		assert.equal(r.status, 200);
		assert.match(r.headers.get('content-type') ?? '', /^text\/plain/);
		const text = await r.text();
		assert.match(text, /^# Eigenbeleg API/);
		assert.match(text, /POST https:\/\/eigenbeleg\.example\.org\/eigenbeleg: USDC on NEAR testnet \(near:testnet\): \$0\.10 to eigenbeleg-api\.testnet; Base \(eip155:8453\): \$0\.10 to 0x1111/);
		assert.match(text, /transferWithAuthorization/);
		assert.match(text, /PAYMENT-REQUIRED[\s\S]*PAYMENT-SIGNATURE[\s\S]*PAYMENT-RESPONSE/);
		assert.match(text, /web UI at https:\/\/eigenbeleg\.example\.org\/ui\/ instead: it does everything in their browser/);
		assert.match(text, /"chain": "near" \| "akash" \| "filecoin" \| "aleph"/);
		assert.match(text, /- aleph \(Aleph Cloud credits/);
		assert.equal((await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json()).agents, '/llms.txt');
	} finally {
		close();
	}
});

test('Ethereum and Base only with ALCHEMY_KEY; the key is in no answer and no log line', async () => {
	const key = 'wolkenfabrik-test-key-0001';
	const own = `0x${'7a'.repeat(20)}`;
	const body = { chain: 'base', addresses: [own], period: { month: '2026-10' } };
	const preview = (/** @type {string} */ base) => globalThis.fetch(`${base}/eigenbeleg/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const info = { mode: 'none' };
	const without = await serve(createApp({ paywall: { middleware: null, info }, deps, log: () => {}, web: null }));
	try {
		const { blocks } = await (await globalThis.fetch(`${without.base}/blocks`)).json();
		assert.ok(!blocks.some((/** @type {any} */ b) => b.chain === 'ethereum' || b.chain === 'base'));
		assert.equal((await preview(without.base)).status, 400);
		assert.doesNotMatch(await (await globalThis.fetch(`${without.base}/llms.txt`)).text(), /"base"|ethereum, base/);
	} finally {
		without.close();
	}
	/** @type {string[]} */
	const lines = [];
	// Alchemy is not reachable here: the preview fails as a 502, with the host at most.
	const offline = /** @type {typeof globalThis.fetch} */ (async () => { throw new TypeError('fetch failed'); });
	const withKey = await serve(createApp({ paywall: { middleware: null, info }, deps: { ...deps, fetch: offline, alchemyKey: key }, log: (l) => lines.push(l), web: null }));
	try {
		const answers = [];
		const blocks = await (await globalThis.fetch(`${withKey.base}/blocks`)).text();
		answers.push(blocks);
		assert.deepEqual(JSON.parse(blocks).blocks.filter((/** @type {any} */ b) => b.needs).map((/** @type {any} */ b) => b.chain), ['ethereum', 'base']);
		const llms = await (await globalThis.fetch(`${withKey.base}/llms.txt`)).text();
		answers.push(llms);
		assert.match(llms, /"base"/);
		const p = await preview(withKey.base);
		answers.push(await p.text());
		assert.equal(p.status, 502);
		answers.push(await (await globalThis.fetch(`${withKey.base}/blocks/base/check`)).text());
		assert.equal(JSON.parse(answers[3]).ok, false);
		assert.ok(!(answers.join('\n') + lines.join('\n')).includes(key), 'the key is in no answer and no log line');
	} finally {
		withKey.close();
	}
});

test('the files by mail: queued once the answer is out, stable subject and file names, the address in no log line', async () => {
	const lines = [];
	const sent = [];
	let done;
	const delivered = new Promise((r) => (done = r));
	const mailer = { send: async (m) => void (sent.push(m), done()) };
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: (l) => lines.push(l), mailer, publicUrl: 'https://eigenbeleg.example.org' }));
	try {
		const home = await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json();
		assert.match(home.mail, /^the files by mail/);
		assert.match(home.request.email, /^belege@example\.org/);
		assert.match(await (await globalThis.fetch(base + '/llms.txt')).text(), /"email": "belege@example\.org",\s+optional: the files also by mail/);

		const r = await post(base, { ...job, format: 'json', document: 'beide', email: 'belege@example.org', language: 'de' });
		assert.equal(r.status, 200);
		assert.equal(r.headers.get('x-eigenbeleg-mail'), 'queued');
		const body = await r.json();
		assert.equal(body.mail, 'queued');
		assert.ok(body.pdf, 'the files are in the answer as well');
		await delivered;
		assert.equal(sent.length, 1);
		const [m] = sent;
		assert.equal(m.to, 'belege@example.org');
		assert.equal(m.subject, 'Eigenbelege EB-2026-042 – EB-2026-066 · near mainnet · 2026-11-01');
		assert.deepEqual(m.attachments.map((a) => a.filename), ['EB-2026-042.pdf', 'KA-2026-11-01.pdf', 'EB-2026-042.csv']);
		assert.equal(m.attachments[0].content.subarray(0, 8).toString(), '%PDF-1.7');
		// A friendly note: greeting, what is attached (file by file), what to do, where it came from; HTML with the same words.
		assert.match(m.text, /^Guten Tag,\n\nanbei die Eigenbelege und den Kontoauszug für near \(mainnet\), 2026-11-01, als PDF\/A/);
		assert.match(m.text, /- EB-2026-042\.pdf: \d+ Eigenbelege \(\d+ Positionen, [\d.]+ EUR\)/);
		assert.match(m.text, /- KA-2026-11-01\.pdf: Kontoauszug für relay\.aurora – NEAR: Anfangsbestand .*, Endbestand .*, mit der Chain abgestimmt/);
		assert.match(m.text, /- EB-2026-042\.csv: alle Bewegungen/);
		assert.match(m.text, /So geht es weiter:\n- Eigenbelege ausdrucken, prüfen und unterschreiben/);
		assert.match(m.text, /Erstellt von der Eigenbeleg-API.*\nFür Menschen, kostenlos im Browser: https:\/\/eigenbeleg\.example\.org\/ui\/\nQuellcode \(AGPL-3\.0-or-later\): https:\/\/github\.com\/Le-Space\/eigenbeleg-agent$/);
		assert.doesNotMatch(m.text, /Musterstraße/, 'the postal address is on the documents, not in the mail');
		assert.doesNotMatch(m.text, /Made by the Eigenbeleg API|Abo/, 'one language per mail, and no subscription note on a single purchase');
		assert.match(m.html, /<!doctype html>/);
		assert.match(m.html, /Guten Tag,<\/p>/);
		assert.match(m.html, /<td[^>]*>KA-2026-11-01\.pdf<\/td><td[^>]*>Kontoauszug für relay\.aurora/);
		assert.match(m.html, /href="https:\/\/eigenbeleg\.example\.org\/ui\/"/);
		// English is the default; the language is checked like every field.
		assert.equal((await post(base, { ...job, language: 'fr' })).status, 400);
		const { composeMail } = await import('../src/mail.js');
		const summary = { eigenbelege: ['EB-2026-042'], number: 'EB-2026-042', period: { from: '2026-11-01', to: '2026-11-30' }, chain: 'near', network: 'mainnet', transactions: 1, positions: 1, totalEur: '0.01', kontoauszuege: [{ number: 'KA-2026-11-01', account: 'relay.aurora', assets: [{ asset: 'NEAR', opening: '1', closing: '1', reconciled: true }] }] };
		const en = composeMail({ ...job, email: 'belege@example.org', language: 'en', document: 'kontoauszug' }, { summary, pdf: null, csv: null, statements: [] });
		assert.equal(en.subject, 'Kontoauszug KA-2026-11-01 · near mainnet · 2026-11-01 to 2026-11-30');
		assert.match(en.text, /^Hello,\n\nattached the account statement \(Kontoauszug\) for near \(mainnet\), 2026-11-01 to 2026-11-30, as PDF\/A for the books\. The documents are in German/);
		assert.match(en.text, /- KA-2026-11-01\.pdf: account statement \(Kontoauszug\) for relay\.aurora – NEAR: opening balance 1, closing balance 1, reconciled with the chain/);
		assert.match(en.text, /What to do next:\n- File the statement like a bank statement/);
		assert.doesNotMatch(en.text, /sign the Eigenbelege/, 'no signing hint without Eigenbelege');
		assert.match(en.text, /Made by the Eigenbeleg API/);
		assert.doesNotMatch(en.text, /Erstellt von|Guten Tag/);
		// What comes from the chain or the request is escaped in the HTML.
		const hostile = composeMail({ ...job, email: 'belege@example.org', language: 'en', document: 'kontoauszug' }, { summary: { ...summary, kontoauszuege: [{ ...summary.kontoauszuege[0], account: '<img src=x onerror=alert(1)>' }] }, pdf: null, csv: null, statements: [] });
		assert.doesNotMatch(hostile.html, /<img/);
		assert.match(hostile.html, /&lt;img src=x onerror=alert\(1\)&gt;/);

		const pdf = await post(base, { ...job, email: 'belege@example.org' });
		assert.equal(pdf.status, 200);
		assert.equal(pdf.headers.get('x-eigenbeleg-mail'), 'queued');
		await pdf.arrayBuffer();

		assert.equal((await post(base, { ...job, email: 'nobody' })).status, 400);
		assert.equal((await globalThis.fetch(`${base}/eigenbeleg/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...job, payer: undefined, email: 'belege@example.org' }) })).status, 400);
		assert.ok(lines.every((l) => !/belege@|example\.org/.test(l)), 'the address is in no log line');
	} finally {
		close();
	}
});

test('without SMTP the API offers no mail: email is refused before any payment, GET / says so', async () => {
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {} }));
	try {
		const r = await post(base, { ...job, email: 'belege@example.org' });
		assert.equal(r.status, 400);
		assert.match((await r.json()).error, /sends no mail/);
		const home = await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json();
		assert.equal(home.mail, 'not offered by this instance');
		assert.equal(home.request.email, null);
		assert.match(await (await globalThis.fetch(base + '/llms.txt')).text(), /optional \(not offered by this instance\)/);
	} finally {
		close();
	}
});

test('llms.txt and GET / say the paid API is for businesses only and link the terms', async () => {
	const { createApp, TERMS_PATH } = await import('../src/app.js');
	const app = createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, web: null });
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	try {
		const { port } = /** @type {any} */ (server.address());
		const text = await (await globalThis.fetch(`http://127.0.0.1:${port}/llms.txt`)).text();
		assert.match(text, /\*\*Businesses only\.\*\* The paid API sells to businesses \(§ 14 BGB/);
		assert.ok(text.includes(`http://127.0.0.1:${port}${TERMS_PATH}`), 'the terms URL');
		assert.match(text, /19% German VAT/);
		const root = await (await globalThis.fetch(`http://127.0.0.1:${port}/`, { headers: { accept: 'application/json' } })).json();
		assert.equal(root.terms, TERMS_PATH);
		assert.match(root.customers, /^businesses only \(§ 14 BGB\)/);
	} finally {
		server.close();
	}
});

test('the test route: testnet data only, its own testnet 402, TEST- files, limits; the main 402 never offers testnet', async () => {
	const { TESTNET_MAX_DAYS } = await import('../src/app.js');
	/** A fake facilitator for one network, and the 402 accept it gives. */
	const fakePaywall = (/** @type {string} */ network, /** @type {string} */ route, /** @type {string} */ payTo) => {
		const facilitator = {
			verify: async () => ({ isValid: true, payer: 'agent.testnet' }),
			settle: async () => ({ success: true, transaction: 'TXHASH', network, payer: 'agent.testnet' }),
			getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network }], extensions: [], signers: {} })
		};
		const server = new x402ResourceServer(/** @type {any} */ (facilitator)).register(/** @type {any} */ (network), new ExactNearScheme());
		return paymentMiddleware(/** @type {any} */ ({ [route]: { accepts: [{ scheme: 'exact', price: '$0.10', network, payTo, maxTimeoutSeconds: 120 }] } }), server);
	};
	const sent = [];
	const mailer = { send: async (m) => void sent.push(m) };
	const testnet = { middleware: fakePaywall('near:testnet', 'POST /testnet/eigenbeleg', 'wolkenfabrik-test.testnet'), info: { mode: 'x402', testnet: true, accepts: [{ network: 'near:testnet', price: '$0.10', payTo: 'wolkenfabrik-test.testnet' }] } };
	const paywall = { middleware: fakePaywall('near:mainnet', 'POST /eigenbeleg', 'wolkenfabrik.near'), info: { mode: 'x402' } };
	const { base, close } = await serve(createApp({ paywall, testnet, deps, log: () => {}, mailer, testnetLimit: { max: 8, windowMs: 60_000 }, testnetMailsPerDay: 1 }));
	const tpost = (body, headers = {}) => globalThis.fetch(`${base}/testnet/eigenbeleg`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
	const required = (/** @type {Response} */ r) => JSON.parse(Buffer.from(r.headers.get('payment-required') ?? '', 'base64').toString());
	const paid = (/** @type {Response} */ r) => ({ 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify({ x402Version: 2, resource: required(r).resource, accepted: required(r).accepts[0], payload: { signedDelegateAction: 'AAAA' } })).toString('base64') });
	const tjob = { ...job, network: 'testnet' };
	try {
		// 1: mainnet data is refused before any price is named: testnet USDC never buys a mainnet document.
		const mainnet = await tpost(job);
		assert.equal(mainnet.status, 400);
		assert.match((await mainnet.json()).error, /testnet addresses only/);
		// 2: a chain without a testnet here, 3: a period longer than the test route's.
		assert.equal((await tpost({ ...tjob, chain: 'aleph', addresses: ['0x1111111111111111111111111111111111111111'], period: { month: '2026-10' } })).status, 400);
		const long = await tpost({ ...tjob, period: { from: '2026-09-01', to: '2026-10-31' } });
		assert.equal(long.status, 400);
		assert.match((await long.json()).error, new RegExp(`at most ${TESTNET_MAX_DAYS} days`));

		// 4: the test route's 402 offers testnet USDC only, to its own recipient.
		const unpaid = await tpost(tjob);
		assert.equal(unpaid.status, 402);
		assert.equal(unpaid.headers.get('x-eigenbeleg-testnet'), 'test only, no value');
		assert.deepEqual(required(unpaid).accepts.map((a) => [a.network, a.payTo]), [['near:testnet', 'wolkenfabrik-test.testnet']]);
		// The main route's 402 offers no testnet network.
		const main = await post(base, job);
		assert.equal(main.status, 402);
		assert.deepEqual(required(main).accepts.map((a) => a.network), ['near:mainnet']);

		// 5: paid: TEST- file name; the JSON says what it is; the mail's subject says [TESTNET].
		const pdf = await tpost(tjob, paid(unpaid));
		assert.equal(pdf.status, 200);
		assert.match(pdf.headers.get('content-disposition') ?? '', /filename="TEST-EB-2026-042\.pdf"/);
		const r6 = await tpost({ ...tjob, format: 'json', email: 'belege@example.org' });
		const j = await (await tpost({ ...tjob, format: 'json', email: 'belege@example.org' }, paid(r6))).json();
		assert.equal(j.network, 'testnet');
		assert.match(j.testnet, /test only, no value/);
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(sent.length, 1);
		assert.match(sent[0].subject, /^\[TESTNET\] /);
		// 6: one mail a day here; the next asks are refused, without mail they go on.
		const over = await tpost({ ...tjob, email: 'belege@example.org' });
		assert.equal(over.status, 400);
		assert.match((await over.json()).error, /at most 1 mails a day/);

		// 7: GET / and llms.txt say what the test route is.
		const home = await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json();
		assert.equal(home.testnet.endpoint ?? 'POST /testnet/eigenbeleg', 'POST /testnet/eigenbeleg');
		assert.match(home.testnet.what, /testnet addresses only/);
		assert.match(await (await globalThis.fetch(base + '/llms.txt')).text(), /## Test \(testnet\)\n\n- POST http:\/\/127\.0\.0\.1:\d+\/testnet\/eigenbeleg: the same documents for testnet addresses only/);

		assert.ok((await (await globalThis.fetch(base + '/testnet/blocks')).json()).blocks.length, 'the API base /testnet has the blocks too');
		// 8: the per-IP limit counts the 402s too (8 above, so the 9th is too many).
		const limited = await tpost(tjob);
		assert.equal(limited.status, 429);
		assert.ok(Number(limited.headers.get('retry-after')) > 0);
	} finally {
		close();
	}
});

test('without a testnet paywall the test route is off: 404, and GET / and llms.txt say so', async () => {
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {} }));
	try {
		const r = await globalThis.fetch(`${base}/testnet/eigenbeleg`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...job, network: 'testnet' }) });
		assert.equal(r.status, 404);
		assert.equal((await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json()).testnet, 'not offered by this instance');
		assert.doesNotMatch(await (await globalThis.fetch(base + '/llms.txt')).text(), /## Test/);
	} finally {
		close();
	}
});

test('GET / and llms.txt name where to get help, and that Le Space never asks for keys', async () => {
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {} }));
	try {
		const home = await (await globalThis.fetch(base + '/', { headers: { accept: 'application/json' } })).json();
		assert.equal(home.support.help, 'eigenbeleg@le-space.de');
		assert.equal(home.support.payments, 'support@le-space.de');
		assert.equal(home.support.page, '/ui/#hilfe');
		const text = await (await globalThis.fetch(base + '/llms.txt')).text();
		assert.match(text, /- Help: eigenbeleg@le-space\.de; payments, invoices and credits: support@le-space\.de\./);
		assert.match(text, /Le Space never asks for a seed phrase, passkey, private key or token/);
	} finally {
		close();
	}
});

test('/.well-known/security.txt (RFC 9116): both contacts, an Expires within a year, the policy', async () => {
	const { base, close } = await serve(createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps, log: () => {}, publicUrl: 'https://eigenbeleg.example.org' }));
	try {
		const r = await globalThis.fetch(base + '/.well-known/security.txt');
		assert.equal(r.status, 200);
		assert.match(r.headers.get('content-type') ?? '', /^text\/plain; charset=utf-8/);
		const text = await r.text();
		assert.match(text, /^Contact: mailto:security@le-space\.de$/m);
		assert.match(text, /^Contact: https:\/\/github\.com\/Le-Space\/eigenbeleg-agent\/security\/advisories\/new$/m);
		assert.match(text, /^Canonical: https:\/\/eigenbeleg\.example\.org\/\.well-known\/security\.txt$/m);
		assert.match(text, /^Policy: https:\/\/github\.com\/Le-Space\/eigenbeleg-agent\/blob\/main\/SECURITY\.md$/m);
		const expires = Date.parse(/^Expires: (\S+)$/m.exec(text)?.[1] ?? '');
		const now = deps.now().getTime();
		assert.ok(expires > now && expires - now < 365 * 86_400_000, 'in the future, less than a year ahead');
	} finally {
		close();
	}
});
