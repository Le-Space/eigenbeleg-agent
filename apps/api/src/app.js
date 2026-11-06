// The HTTP API.
//
//   GET  /             what this is, the price and how to pay (JSON)
//   GET  /blocks       the building blocks by chain, for agents
//   GET  /health
//   POST /eigenbeleg   the Eigenbeleg, behind the x402 paywall
//
// No storage beyond the request: the body (payer's name and address) lives
// in memory until the response is sent. Logs carry method, path, status and
// duration only.

import express from 'express';

import { checkBlock, describeBlocks } from './blocks.js';
import { generate } from './generate.js';
import { RequestError, parseRequest } from './request.js';

/**
 * @param {object} o
 * @param {{ middleware: import('express').RequestHandler | null, info: Record<string, unknown> }} o.paywall
 * @param {Parameters<typeof generate>[1]} [o.deps]
 * @param {(line: string) => void} [o.log]
 */
export function createApp({ paywall, deps = {}, log = (l) => console.log(l) }) {
	const app = express();
	app.disable('x-powered-by');
	app.use((req, res, next) => {
		const t0 = Date.now();
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Cache-Control', 'no-store');
		res.on('finish', () => log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`));
		next();
	});

	app.get('/', (_req, res) => {
		res.json({
			service: 'eigenbeleg',
			what: 'Eigenbelege (self-issued proofs of payment, never invoices) for the payments of own blockchain addresses, as PDF/A-2b and CSV',
			endpoint: 'POST /eigenbeleg',
			payment: paywall.info,
			request: {
				chain: 'near',
				network: 'mainnet | testnet (where the payments were made)',
				addresses: ['own-account.near'],
				period: { month: 'YYYY-MM' },
				format: 'pdf | csv | json (both, base64 PDF)',
				payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' },
				number: 'EB-2026-001 (optional, from your own range)',
				includeKinds: ['fee', 'storage']
			},
			blocks: describeBlocks(),
			privacy: 'Nothing is stored beyond the request; logs hold method, path, status and duration only.',
			data: 'Powered by NearBlocks.io APIs; EUR rates from Kraken (VWAP of the day) or CoinGecko.'
		});
	});
	app.get('/blocks', (_req, res) => res.json({ blocks: describeBlocks() }));
	app.get('/blocks/:chain/check', async (req, res) => res.json(await checkBlock(req.params.chain, deps)));
	app.get('/health', (_req, res) => res.json({ ok: true, paywall: paywall.info.mode }));

	/** @type {import('express').RequestHandler} */
	const validate = (req, res, next) => {
		try {
			res.locals.job = parseRequest(req.body);
			next();
		} catch (e) {
			if (e instanceof RequestError) res.status(400).json({ error: e.message });
			else next(e);
		}
	};
	/** @type {import('express').RequestHandler} */
	const pay = paywall.middleware ?? ((_req, _res, next) => next());

	app.post('/eigenbeleg', express.json({ limit: '32kb' }), validate, pay, async (_req, res) => {
		const job = res.locals.job;
		let out;
		try {
			out = await generate(job, deps);
		} catch (e) {
			// A 5xx is not settled: the payer is not charged for a failed run.
			res.status(502).json({ error: `could not read the chain or the rates: ${String(/** @type {Error} */ (e).message).slice(0, 200)}` });
			return;
		}
		if (paywall.info.mode === 'none') res.setHeader('X-Eigenbeleg-Paywall', 'none (development)');
		res.setHeader('X-Eigenbeleg-Summary', JSON.stringify(out.summary));
		const file = out.summary.number.replace(/[^A-Za-z0-9._-]/g, '_');
		if (job.format === 'pdf') {
			res.setHeader('Content-Disposition', `attachment; filename="${file}.pdf"`);
			res.type('application/pdf').send(Buffer.from(/** @type {Uint8Array} */ (out.pdf)));
		} else if (job.format === 'csv') {
			res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
			res.type('text/csv; charset=utf-8').send(out.csv);
		} else {
			res.json({ ...out.summary, pdf: Buffer.from(/** @type {Uint8Array} */ (out.pdf)).toString('base64'), csv: out.csv });
		}
	});

	app.use((/** @type {any} */ err, /** @type {any} */ _req, /** @type {any} */ res, /** @type {any} */ _next) => {
		const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : 500;
		res.status(status).json({ error: status === 500 ? 'internal error' : String(err.message) });
	});
	return app;
}
