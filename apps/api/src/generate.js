// One request, start to end: read the chain, value in EUR, build the
// Eigenbeleg, draw the files. Nothing is kept afterwards.

import { sortEntries } from '@eigenbeleg/ledger-core';
import { createRates, valueEntries } from '@eigenbeleg/rates';
import { buildDocument, eigenbelegCsv, eigenbelegPdf } from '@eigenbeleg/eigenbeleg';
import { BLOCKS } from './blocks.js';

/**
 * @param {ReturnType<typeof import('./request.js').parseRequest>} req
 * @param {{ fetch?: typeof fetch, rates?: { rateFor: Function }, nearblocksKey?: string, now?: () => Date }} [deps]
 */
export async function generate(req, deps = {}) {
	const block = BLOCKS[req.chain];
	const entries = [];
	for (const account of req.addresses)
		entries.push(...(await block.read({ account, network: req.network, from: req.period.from, to: req.period.to, fetch: deps.fetch, apiKey: deps.nearblocksKey })));
	const rates = deps.rates ?? createRates({ fetch: deps.fetch });
	const valued = await valueEntries(sortEntries(entries), /** @type {any} */ (rates));
	const doc = buildDocument({
		payer: req.payer,
		chain: req.chain,
		network: req.network,
		period: req.period,
		entries: valued,
		number: req.number,
		includeKinds: req.includeKinds,
		issuedAt: (deps.now?.() ?? new Date()).toISOString()
	});
	const summary = {
		number: doc.number,
		chain: doc.chain,
		network: doc.network,
		period: doc.period,
		positions: doc.positions.length,
		notOnIt: doc.excluded.length,
		totalEur: doc.totals.eur,
		quantities: doc.totals.quantities
	};
	const pdf = req.format === 'csv' ? null : await eigenbelegPdf(doc);
	const csv = req.format === 'pdf' ? null : eigenbelegCsv(doc);
	return { summary, pdf, csv };
}
