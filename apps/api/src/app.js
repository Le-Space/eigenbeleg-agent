// SPDX-License-Identifier: AGPL-3.0-or-later
// The HTTP API.
//
//   GET  /             what this is, the price and how to pay (JSON); a browser is sent to /ui/
//   GET  /blocks       the building blocks by chain, for agents
//   GET  /health
//   POST /eigenbeleg   the Eigenbeleg, behind the x402 paywall
//   POST /eigenbeleg/preview  free: positions and total, never the payer
//   GET  /ui/          the web UI (apps/web/dist), when it is built
//
// No storage beyond the request: the body (payer's name and address) lives
// in memory until the response is sent. Logs carry method, path, status and
// duration only.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { RequestError, blocksFor, checkBlock, describeBlocks, generate, parseRequest } from '@eigenbeleg/pipeline';

/**
 * @param {object} o
 * @param {{ middleware: import('express').RequestHandler | null, info: Record<string, unknown> }} o.paywall
 * @param {Parameters<typeof generate>[1]} [o.deps] with `alchemyKey` (ALCHEMY_KEY) the API also serves Ethereum and Base;
 *   the key goes to their reads only, never into an answer or a log
 * @param {(line: string) => void} [o.log]
 * @param {string} [o.source] where the source of this running version is (AGPL-3.0-or-later, section 13)
 * @param {string | null} [o.web] the built web UI (apps/web/dist); null: no UI
 * @param {{ max: number, windowMs: number }} [o.previewLimit] free previews per IP
 * @param {string} [o.publicUrl] this instance's public origin, e.g. https://eigenbeleg.le-space.de, for the share
 *   cards' absolute URLs; unset: taken from the request's Host (and X-Forwarded-Proto)
 */
export function createApp({
	paywall,
	deps: given = {},
	log = (l) => console.log(l),
	source = 'https://github.com/Le-Space/eigenbeleg-agent',
	web = WEB_DIST,
	previewLimit = { max: 10, windowMs: 60_000 },
	publicUrl
}) {
	// The blocks this instance serves: the keyless ones, and Ethereum and Base where an Alchemy key is set.
	const blocks = blocksFor(given);
	const deps = { ...given, blocks };
	const app = express();
	app.disable('x-powered-by');
	// The paywalls match the exact path: `/eigenbeleg/` or `/EIGENBELEG` must not
	// reach the paid route around them.
	app.set('case sensitive routing', true);
	app.set('strict routing', true);
	app.use((req, res, next) => {
		const t0 = Date.now();
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Cache-Control', 'no-store');
		res.on('finish', () => log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`));
		next();
	});

	// Content negotiation: a browser (Accept: text/html) is sent to the UI;
	// agents, curl and fetch (application/json, */* or nothing) get the JSON.
	app.get('/', (req, res) => {
		res.vary('Accept');
		if (hasUi && req.accepts(['json', 'html']) === 'html') {
			res.redirect(302, '/ui/');
			return;
		}
		res.json({
			service: 'eigenbeleg',
			what: 'Eigenbelege (self-issued proofs of payment, never invoices) for the payments of own blockchain addresses, as PDF/A-2b and CSV',
			endpoint: 'POST /eigenbeleg',
			preview: 'POST /eigenbeleg/preview (free; the same body without payer)',
			ui: hasUi ? '/ui/' : null,
			people: 'the web UI does everything in the browser, free; nothing is sent to this API',
			agents: '/llms.txt',
			payment: paywall.info,
			request: {
				chain: 'near',
				network: 'mainnet | testnet (where the payments were made)',
				addresses: ['own-account.near'],
				period: { month: 'YYYY-MM' },
				format: 'pdf | csv | json (all files, PDFs base64)',
				document: 'eigenbelege (default; one per transaction) | kontoauszug (per address) | beide (format json only)',
				payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' },
				number: 'EB-2026-001 (optional, from your own range)',
				includeKinds: ['fee', 'storage']
			},
			blocks: describeBlocks(blocks),
			privacy: 'Nothing is stored beyond the request; logs hold method, path, status and duration only.',
			data: 'Powered by NearBlocks.io APIs; EUR rates: the price at 00:00 UTC from CoinGecko, else Kraken (@le-space/rates).',
			license: 'AGPL-3.0-or-later',
			source
		});
	});
	const hasUi = Boolean(web && existsSync(`${web}/index.html`));
	if (hasUi) mountUi(app, /** @type {string} */ (web), publicUrl);
	// For agents (llms.txt convention): what is sold, the price, the x402 flow, and where people go instead.
	app.get('/llms.txt', (req, res) => {
		const p = /** @type {Record<string, unknown>} */ (paywall.info);
		const price = p.mode === 'near' ? `${p.price} in USDC (NEP-141) on ${p.network}, to ${p.payTo}; the API's relayer pays the gas` : p.mode === 'none' ? 'free (development mode)' : `paid via ${p.mode}`;
		const base = origin(req, publicUrl);
		res.type('text/plain; charset=utf-8').send(`# Eigenbeleg API

> Eigenbelege (self-issued proofs of payment for German bookkeeping; never invoices) for the payments of a person's own blockchain addresses: network fees, storage deposits, transfers. PDF/A-2b and CSV, with the EUR rate of each payment's day and its source. Paid per request with x402.

People use the web UI at ${base}/ui/ instead: it does everything in their browser, for free, and sends nothing here. This API is for agents acting for someone.

## Buy

- POST ${base}/eigenbeleg/preview: free, the same body without \`payer\`; counts and totals, no files. Check here first.
- POST ${base}/eigenbeleg: ${price}.
  1. Send the body; the answer is 402 with a \`PAYMENT-REQUIRED\` header (base64 JSON, x402 v2, scheme \`exact\`).
  2. Sign what it asks for (on NEAR: one NEP-366 delegate action with one \`ft_transfer\` of USDC; the payer needs USDC and a USDC storage registration, no NEAR) and send the same request again with \`PAYMENT-SIGNATURE\`.
  3. The answer carries the files and \`PAYMENT-RESPONSE\` (the transaction). If reading the chain fails, nothing is charged.
  Clients: @x402/fetch with @x402/near (JavaScript), or this repository's agent: npm run agent -- --help.

## Body

{
  "chain": ${describeBlocks(blocks).map((b) => `"${b.chain}"`).join(' | ')}   (GET ${base}/blocks lists them and their networks),
  "network": "mainnet" | "testnet",           where the payments were made,
  "addresses": ["own-account.near"],          one to ten own addresses,
  "period": { "month": "YYYY-MM" } or { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }   finished days, at most 92,
  "format": "pdf" | "csv" | "json",          json: every file, PDFs base64,
  "document": "eigenbelege" | "kontoauszug" | "beide",
  "payer": { "name": "…", "address": "street, postcode town" }   printed on the documents; used for this response only, never stored or logged,
  "number": "EB-2026-001",                    optional, first number of the payer's own range,
  "includeKinds": ["fee", "storage"]          optional: fee, storage, transfer, call
}

## Notes

${blocks.base ? "- ethereum, base: ETH, USDC and ALEPH (the token Aleph Cloud is paid with) and the gas, read through this server's Alchemy key; the whole history of the address is read, so a busy address takes a while.\n" : ''}- aleph (Aleph Cloud credits, by the Ethereum address): one finished month (\`period.month\`), \`document\` kontoauszug only; it is a Verbrauchsauszug (VA-…), usage per day and resource, valued at the USD price per credit and the ECB rate of the day. No Eigenbeleg: usage from a prepaid balance is no single payment.
- The documents are in German. An Eigenbeleg counts only once the payer signs it; whether a tax adviser accepts it is theirs to decide.
- Nothing is stored beyond the request. Source (AGPL-3.0-or-later): ${source}
`);
	});
	app.get('/blocks', (_req, res) => res.json({ blocks: describeBlocks(blocks) }));
	app.get('/blocks/:chain/check', async (req, res) => res.json(await checkBlock(req.params.chain, deps)));
	app.get('/health', (_req, res) => res.json({ ok: true, paywall: paywall.info.mode }));

	/** @type {import('express').RequestHandler} */
	const validate = (req, res, next) => {
		try {
			res.locals.job = parseRequest(req.body, { blocks });
			next();
		} catch (e) {
			if (e instanceof RequestError) res.status(400).json({ error: e.message });
			else next(e);
		}
	};
	/** @param {import('express').Response} res @param {unknown} e */
	const failed = (res, e) =>
		res.status(502).json({ error: `could not read the chain or the rates: ${String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200)}` });

	// The free preview: same checks and the same reading as the paid route,
	// but no payer, no files, and a few per minute per IP (it costs the data
	// sources as much as a paid run).
	/** @type {Map<string, { n: number, since: number }>} */
	const previews = new Map();
	app.post('/eigenbeleg/preview', express.json({ limit: '32kb' }), async (req, res) => {
		const now = Date.now();
		for (const [ip, w] of previews) if (now - w.since > previewLimit.windowMs) previews.delete(ip);
		const key = req.ip ?? '';
		const w = previews.get(key) ?? { n: 0, since: now };
		w.n += 1;
		previews.set(key, w);
		if (w.n > previewLimit.max) {
			res.setHeader('Retry-After', String(Math.ceil((w.since + previewLimit.windowMs - now) / 1000)));
			res.status(429).json({ error: 'too many previews; try again in a minute' });
			return;
		}
		let job;
		try {
			job = parseRequest(req.body, { preview: true, blocks });
		} catch (e) {
			if (e instanceof RequestError) res.status(400).json({ error: e.message });
			else res.status(500).json({ error: 'internal error' });
			return;
		}
		try {
			const { summary } = await generate(job, deps, { preview: true });
			res.json(summary);
		} catch (e) {
			failed(res, e);
		}
	});

	/** @type {import('express').RequestHandler} */
	const pay = paywall.middleware ?? ((_req, _res, next) => next());

	// PingPay settles inside its middleware, before the route runs. So for a
	// request that carries a payment, the work is done first: a run that fails
	// answers 502 before anything is settled. (The x402 NEAR middleware
	// settles after the route, only on a status below 400.)
	/** @type {import('express').RequestHandler} */
	const workFirst =
		paywall.info.mode === 'ping'
			? async (req, res, next) => {
					if (!req.get('payment-signature') && !req.get('x-payment')) return next();
					try {
						res.locals.out = await generate(res.locals.job, deps);
					} catch (e) {
						failed(res, e);
						return;
					}
					next();
				}
			: (_req, _res, next) => next();

	app.post('/eigenbeleg', express.json({ limit: '32kb' }), validate, workFirst, pay, async (_req, res) => {
		const job = res.locals.job;
		let out = res.locals.out;
		if (!out) {
			try {
				out = await generate(job, deps);
			} catch (e) {
				// A 5xx is not settled: the payer is not charged for a failed run.
				failed(res, e);
				return;
			}
		}
		if (paywall.info.mode === 'none') res.setHeader('X-Eigenbeleg-Paywall', 'none (development)');
		// No summary in a header: headers set here would stay on the 402 that a
		// failed settlement sends. The JSON format carries the summary.
		const name = (/** @type {string} */ n) => n.replace(/[^A-Za-z0-9._-]/g, '_');
		if (job.format === 'pdf' && job.document === 'eigenbelege') {
			res.setHeader('Content-Disposition', `attachment; filename="${name(out.summary.eigenbelege[0] ?? out.summary.number)}.pdf"`);
			res.type('application/pdf').send(Buffer.from(/** @type {Uint8Array} */ (out.pdf)));
		} else if (job.format === 'pdf') {
			const [st] = out.statements;
			res.setHeader('Content-Disposition', `attachment; filename="${name(st.number)}.pdf"`);
			res.type('application/pdf').send(Buffer.from(st.pdf));
		} else if (job.format === 'csv') {
			res.setHeader('Content-Disposition', `attachment; filename="${name(out.summary.number)}.csv"`);
			res.type('text/csv; charset=utf-8').send(out.csv);
		} else {
			res.json({
				...out.summary,
				...(out.pdf ? { pdf: Buffer.from(out.pdf).toString('base64') } : {}),
				...(out.statements.length ? { kontoauszuegePdf: out.statements.map((s) => ({ account: s.account, number: s.number, pdf: Buffer.from(s.pdf).toString('base64') })) } : {}),
				csv: out.csv
			});
		}
	});

	app.use((/** @type {any} */ err, /** @type {any} */ _req, /** @type {any} */ res, /** @type {any} */ _next) => {
		const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : err?.status === 404 ? 404 : 500;
		res.status(status).json({ error: status === 500 ? 'internal error' : status === 404 ? 'not found' : String(err.message) });
	});
	return app;
}

/**
 * The public origin for absolute URLs in the page: the configured one, or the
 * request's, if its Host is a plain host name (it ends up in an HTML attribute).
 *
 * @param {import('express').Request} req
 * @param {string} [publicUrl]
 */
export function origin(req, publicUrl) {
	const configured = publicUrl?.replace(/\/+$/, '');
	if (configured && /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(configured)) return configured;
	const host = req.get('host') ?? '';
	const proto = req.get('x-forwarded-proto') === 'https' ? 'https' : req.protocol;
	return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host) ? `${proto}://${host}` : '';
}

/** Where `npm run web:build` puts the UI. */
export const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

/**
 * Serves the built UI (a static PWA) at /ui/. The page talks to no route of
 * this API: it reads the chains from the data sources itself. Its
 * Content-Security-Policy comes from the build (dist/csp.txt, made from the
 * pipeline's data sources), plus frame-ancestors, which the page's <meta>
 * cannot carry.
 *
 * The share-card meta tags need absolute URLs: __PUBLIC_URL__ becomes `publicUrl`,
 * or else the request's origin, taken only if the Host is a plain host name.
 *
 * @param {import('express').Express} app
 * @param {string} dir
 * @param {string} [publicUrl]
 */
function mountUi(app, dir, publicUrl) {
	const html = readFileSync(`${dir}/index.html`, 'utf8');
	const csp = existsSync(`${dir}/csp.txt`) ? readFileSync(`${dir}/csp.txt`, 'utf8').trim() : "default-src 'self'";
	app.get('/ui', (_req, res) => res.redirect(301, '/ui/'));
	app.get('/ui/', (req, res) => {
		res.setHeader('Content-Security-Policy', `${csp}; frame-ancestors 'none'`);
		res.setHeader('Referrer-Policy', 'no-referrer');
		res.setHeader('Cache-Control', 'no-cache');
		res.type('html').send(html.replaceAll('__PUBLIC_URL__', origin(req, publicUrl)));
	});
	app.use('/ui/assets', express.static(`${dir}/assets`, { index: false, fallthrough: false, immutable: true, maxAge: '1y' }));
	// The service worker, the manifest, icons and share cards: revalidated, so a new version is seen.
	app.get('/ui/index.html', (_req, res) => res.redirect(301, '/ui/'));
	app.use('/ui', express.static(dir, { index: false, fallthrough: false, maxAge: 0 }));
}
