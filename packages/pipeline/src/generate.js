// SPDX-License-Identifier: AGPL-3.0-or-later
// One request, start to end: read the chain, value in EUR, build the
// Eigenbelege (one per transaction) and the Kontoauszug per account, draw
// the files. Nothing is kept afterwards. Runs in Node (the API) and in a
// browser (the web UI) alike.

import { sortEntries } from '@le-space/ledger';
import { buildDocument, buildStatement, eigenbelegCsv, eigenbelegPdf, statementPdf, valueEntries } from '@le-space/eigenbeleg';
import { withReferenceRates } from '@le-space/rates/reference-rate';
import { dayRates } from './rates.js';
import { BLOCKS } from './blocks.js';

/**
 * Whether opening balance plus bookings meet the chain's balance (null: the chain names none). A
 * difference below the twelve decimals the documents print counts as met: the NEAR reader leaves
 * out the 1 yoctoNEAR a token transfer attaches as its security deposit (no payment, 10⁻²⁴ NEAR).
 *
 * @param {string | null} difference
 */
export const reconciled = (difference) => (difference === null ? null : /^-?0(\.0+)?$/.test(difference) || /^-?0\.0{12}\d*$/.test(difference));

/**
 * @typedef {{ step: 'read', account: string, index: number, count: number } | { step: 'rates' } | { step: 'draw' }} Progress
 *   read: one account's chain history is being read (index of count); rates: the EUR rates of the days; draw: the PDFs
 */

/**
 * @param {ReturnType<typeof import('./request.js').parseRequest>} req
 * @param {{ fetch?: typeof fetch, rates?: import('@le-space/eigenbeleg').Rates, nearblocksKey?: string, alchemyKey?: string, blocks?: Record<string, import('./blocks.js').Block>, now?: () => Date, probeDay?: string, endpoints?: Record<string, Record<string, string>>, connect?: (url: string) => Promise<any> }} [deps]
 *   connect: instead of a WebSocket to an ElectrumX server (Doichain), for tests
 *   blocks: what this side serves (BLOCKS when not given; the API with an Alchemy key: `blocksFor(deps)`, keyed.js)
 *   alchemyKey: the server's, for the EVM blocks; it goes to their reads only
 *   endpoints: per chain, endpoints to use instead of the reader's own, e.g. `{ akash: { indexer: 'https://…' } }` for a CORS proxy
 * @param {{ preview?: boolean, onProgress?: (p: Progress) => void }} [opts] preview: the summary only, no files;
 *   onProgress: told before each step (the web UI shows it on the button)
 */
export async function generate(req, deps = {}, { preview = false, onProgress } = {}) {
	const blocks = deps.blocks ?? BLOCKS;
	const block = Object.hasOwn(blocks, req.chain) ? blocks[req.chain] : null;
	if (!block) throw new Error(`no building block for chain ${req.chain} here`);
	const wantBelege = req.document !== 'kontoauszug';
	const wantStatement = req.document !== 'eigenbelege';
	const read = { network: req.network, from: req.period.from, to: req.period.to, fetch: deps.fetch, apiKey: deps.nearblocksKey, endpoints: deps.endpoints?.[req.chain], own: req.addresses, ...(deps.connect ? { connect: deps.connect } : {}), ...(block.needs === 'alchemyKey' ? { alchemyKey: deps.alchemyKey } : {}) };
	/** @type {import('@le-space/ledger').LedgerEntry[]} */
	const entries = [];
	/** @type {{ account: string, opening: Record<string, string>, closing: Record<string, string>, method: 'archive' | 'derived', at: any }[]} */
	const balances = [];
	for (const [index, account] of req.addresses.entries()) {
		onProgress?.({ step: 'read', account, index, count: req.addresses.length });
		if (wantStatement && block.statement) {
			const st = await block.statement({ ...read, account });
			entries.push(...st.entries);
			balances.push({ account, opening: st.opening, closing: st.closing, method: st.method, at: st.at });
		} else entries.push(...(await block.read({ ...read, account })));
	}
	onProgress?.({ step: 'rates' });
	// An asset no price source quotes (DOI) is valued by the request's reference value and by nothing else: with
	// no value handed in its table is empty, so it gets no euro value and never reaches a price feed.
	const priced = deps.rates ?? dayRates({ fetch: deps.fetch });
	const rates = block.referenceAssets?.length ? withReferenceRates(priced, Object.fromEntries(block.referenceAssets.map((a) => [a, req.reference?.[a] ?? []]))) : priced;
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
			assets: s.sections.map((x) => ({ asset: x.asset, opening: x.opening, closing: x.closing, reconciled: reconciled(x.difference), monthly: x.monthly }))
		}))
	};
	if (preview) return { summary, pdf: null, statements: [], csv: null };
	onProgress?.({ step: 'draw' });
	// `req.logo`: the chain's mark, small, beside the title, when asked for (@le-space/pdf's LOGOS;
	// a chain without a mark gets none).
	// `req.chart`: the diagram above a statement's bookings, drawn unless the request switches it off.
	const pdf = req.format !== 'csv' && wantBelege ? await eigenbelegPdf(doc, { logo: req.logo }) : null;
	const statementPdfs = [];
	if (req.format !== 'csv') for (const s of statements) statementPdfs.push({ account: s.account, number: s.number, pdf: await statementPdf(s, { logo: req.logo, chart: req.chart }) });
	const csv = req.format === 'pdf' ? null : eigenbelegCsv(doc);
	return { summary, pdf, statements: statementPdfs, csv };
}
