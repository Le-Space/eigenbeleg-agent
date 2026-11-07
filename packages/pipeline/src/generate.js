// SPDX-License-Identifier: AGPL-3.0-or-later
// One request, start to end: read the chain, value in EUR, build the
// Eigenbelege (one per transaction) and the Kontoauszug per account, draw
// the files. Nothing is kept afterwards. Runs in Node (the API) and in a
// browser (the web UI) alike.

import { sortEntries } from '@le-space/ledger';
import { buildDocument, buildStatement, eigenbelegCsv, eigenbelegPdf, statementPdf, valueEntries } from '@eigenbeleg/eigenbeleg';
import { dayRates } from './rates.js';
import { BLOCKS } from './blocks.js';

/**
 * @param {ReturnType<typeof import('./request.js').parseRequest>} req
 * @param {{ fetch?: typeof fetch, rates?: import('@eigenbeleg/eigenbeleg').Rates, nearblocksKey?: string, now?: () => Date, probeDay?: string, endpoints?: Record<string, Record<string, string>> }} [deps]
 *   endpoints: per chain, endpoints to use instead of the reader's own, e.g. `{ akash: { indexer: 'https://…' } }` for a CORS proxy
 * @param {{ preview?: boolean }} [opts] preview: the summary only, no files
 */
export async function generate(req, deps = {}, { preview = false } = {}) {
	const block = BLOCKS[req.chain];
	const wantBelege = req.document !== 'kontoauszug';
	const wantStatement = req.document !== 'eigenbelege';
	const read = { network: req.network, from: req.period.from, to: req.period.to, fetch: deps.fetch, apiKey: deps.nearblocksKey, endpoints: deps.endpoints?.[req.chain] };
	/** @type {import('@le-space/ledger').LedgerEntry[]} */
	const entries = [];
	/** @type {{ account: string, opening: Record<string, string>, closing: Record<string, string>, method: 'archive' | 'derived', at: any }[]} */
	const balances = [];
	for (const account of req.addresses) {
		if (wantStatement && block.statement) {
			const st = await block.statement({ ...read, account });
			entries.push(...st.entries);
			balances.push({ account, opening: st.opening, closing: st.closing, method: st.method, at: st.at });
		} else entries.push(...(await block.read({ ...read, account })));
	}
	const rates = deps.rates ?? dayRates({ fetch: deps.fetch });
	const valued = await valueEntries(sortEntries(entries), rates);
	const issuedAt = (deps.now?.() ?? new Date()).toISOString();
	const doc = buildDocument({ payer: req.payer, chain: req.chain, network: req.network, period: req.period, entries: valued, number: req.number, includeKinds: req.includeKinds, issuedAt, layout: 'single' });
	const belege = new Map(doc.transactions.map((t) => [t.hash, t.number]));
	const statements = balances.map((b, i) =>
		buildStatement({
			payer: req.payer,
			account: b.account,
			chain: req.chain,
			network: req.network,
			period: req.period,
			entries: valued,
			opening: b.opening,
			closing: b.closing,
			method: b.method,
			at: b.at,
			belege,
			number: balances.length > 1 ? `${req.statementNumber}-${i + 1}` : req.statementNumber,
			issuedAt
		})
	);
	const summary = {
		number: doc.number,
		eigenbelege: doc.transactions.map((t) => t.number),
		chain: doc.chain,
		network: doc.network,
		period: doc.period,
		positions: doc.positions.length,
		transactions: doc.transactions.length,
		notOnIt: doc.excluded.length,
		totalEur: doc.totals.eur,
		quantities: doc.totals.quantities,
		kontoauszuege: statements.map((s) => ({
			number: s.number,
			account: s.account,
			method: s.method,
			assets: s.sections.map((x) => ({ asset: x.asset, opening: x.opening, closing: x.closing, reconciled: x.difference === null ? null : /^-?0(\.0+)?$/.test(x.difference) }))
		}))
	};
	if (preview) return { summary, pdf: null, statements: [], csv: null };
	const pdf = req.format !== 'csv' && wantBelege ? await eigenbelegPdf(doc) : null;
	const statementPdfs = [];
	if (req.format !== 'csv') for (const s of statements) statementPdfs.push({ account: s.account, number: s.number, pdf: await statementPdf(s) });
	const csv = req.format === 'pdf' ? null : eigenbelegCsv(doc);
	return { summary, pdf, statements: statementPdfs, csv };
}
