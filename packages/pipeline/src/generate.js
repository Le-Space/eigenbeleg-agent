// SPDX-License-Identifier: AGPL-3.0-or-later
// One request, start to end: read the chain, value in EUR (or the
// request's currency), build the
// Eigenbelege (one per transaction) and the Kontoauszug per account, draw
// the files. Nothing is kept afterwards. Runs in Node (the API) and in a
// browser (the web UI) alike.

import { monthPeriod, sortEntries } from '@le-space/ledger';
import { buildDocument, buildStatement, eigenbelegCsv, eigenbelegPdf, statementPdf, valueEntries } from '@le-space/eigenbeleg';
import { dayRates, referenceRates } from './rates.js';
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
 * The whole months of a period, oldest first: those a monthly consumption Eigenbeleg is made for (#116).
 * A month only partly in the period gets none.
 *
 * @param {{ from: string, to: string }} period
 */
export function wholeMonths(period) {
	const out = [];
	for (let m = period.from.slice(0, 7); m <= period.to.slice(0, 7); ) {
		const whole = monthPeriod(m);
		if (whole.from >= period.from && whole.to <= period.to) out.push(m);
		const [y, mo] = m.split('-').map(Number);
		m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
	}
	return out;
}

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
	const read = { network: req.network, from: req.period.from, to: req.period.to, fetch: deps.fetch, apiKey: deps.nearblocksKey, endpoints: deps.endpoints?.[req.chain], own: req.addresses, ...(req.addressType ? { type: req.addressType } : {}), ...(deps.connect ? { connect: deps.connect } : {}), ...(block.needs === 'alchemyKey' ? { alchemyKey: deps.alchemyKey } : {}), ...(req.tokens?.length ? { tokens: req.tokens } : {}) };
	// What the documents name an account by: a wallet read from its key carries the key's fingerprint, never the key.
	const accountOf = block.accountOf ?? ((/** @type {string} */ a) => a);
	const payer = { ...req.payer, addresses: req.payer.addresses.map(accountOf) };
	const dataSource = deps.endpoints?.[req.chain] ? block.dataSource?.(deps.endpoints[req.chain]) : undefined;
	/** @type {import('@le-space/ledger').LedgerEntry[]} */
	const entries = [];
	/** @type {{ account: string, opening: Record<string, string>, closing: Record<string, string>, method: 'archive' | 'derived', at: any, contracts?: Record<string, string> }[]} */
	const balances = [];
	// The monthly consumption Eigenbelege (#116): per account and whole month of the period, with the Eigenbelege.
	const months = wantBelege && block.consumption ? wholeMonths(req.period) : [];
	// Usage that is no movement of the account (Akash's lease payouts): valued with the rest, on no statement.
	/** @type {import('@le-space/ledger').LedgerEntry[]} */
	const apart = [];
	for (const [index, account] of req.addresses.entries()) {
		onProgress?.({ step: 'read', account: accountOf(account), index, count: req.addresses.length });
		if (months.length && block.usage) apart.push(...(await block.usage({ ...read, account, months })));
		if (wantStatement && block.statement) {
			const st = await block.statement({ ...read, account });
			entries.push(...st.entries);
			// `contracts`: a token not in the list by its contract (EVM, #93), also one without a booking in the period.
			balances.push({ account: accountOf(account), opening: st.opening, closing: st.closing, method: st.method, at: st.at, ...(st.contracts ? { contracts: st.contracts } : {}) });
		} else entries.push(...(await block.read({ ...read, account })));
	}
	onProgress?.({ step: 'rates' });
	// An asset no price source quotes (DOI) is valued by the request's reference value and by nothing else: with
	// no value handed in its table is empty, so it gets no euro value and never reaches a price feed. In another
	// currency the reference value (EUR) is taken times the euro in it on the day.
	// The request's currency (EUR unless another): the rates come in it, and the documents are in it.
	const currency = req.currency ?? 'EUR';
	// A token not in the list (EVM, #93) is valued by its contract: CoinGecko, else its Uniswap pool at the block,
	// read through Alchemy with the key the block reads with.
	const priced = deps.rates ?? dayRates({ fetch: deps.fetch, currency, ...(block.needs === 'alchemyKey' && deps.alchemyKey ? { alchemyKey: deps.alchemyKey } : {}) });
	const rates = block.referenceAssets?.length ? referenceRates(priced, Object.fromEntries(block.referenceAssets.map((a) => [a, req.reference?.[a] ?? []])), currency) : priced;
	const all = await valueEntries(sortEntries([...entries, ...apart]), rates, { currency });
	const apartIds = new Set(apart.map((e) => e.id));
	const valued = all.filter((e) => !apartIds.has(e.id));
	const usageApart = all.filter((e) => apartIds.has(e.id));
	const issuedAt = (deps.now?.() ?? new Date()).toISOString();
	// The statement each account's consumption Eigenbeleg names: the number its statement has (or would have, when only
	// the Eigenbelege were asked for), as below.
	const statementNumberOf = (/** @type {number} */ i) => (req.addresses.length > 1 ? `${req.statementNumber}-${i + 1}` : req.statementNumber);
	const consumption = req.addresses.flatMap((account, i) =>
		months.map((month) => ({
			account: accountOf(account),
			month,
			statementNumber: statementNumberOf(i),
			...(block.usage ? { entries: usageApart.filter((e) => e.account === account) } : {})
		}))
	);
	const doc = buildDocument({ payer, dataSource, chain: req.chain, network: req.network, period: req.period, entries: valued, number: req.number, includeKinds: req.includeKinds, issuedAt, layout: 'single', currency, language: req.documentLanguage ?? 'de', consumption });
	const belege = new Map(doc.transactions.map((t) => [t.hash, t.number]));
	const statements = balances.map((b, i) =>
		buildStatement({
			payer,
			dataSource,
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
			number: statementNumberOf(i),
			issuedAt,
			currency,
			language: req.documentLanguage ?? 'de',
			...(b.contracts ? { contracts: b.contracts } : {})
		})
	);
	const summary = {
		number: doc.number,
		// Every Eigenbeleg's number: the payments' own, then the months' consumption.
		eigenbelege: [...doc.transactions.map((t) => t.number), ...doc.consumption.map((r) => r.number)],
		chain: doc.chain,
		network: doc.network,
		period: doc.period,
		positions: doc.positions.length,
		transactions: doc.transactions.length,
		notOnIt: doc.excluded.length,
		// `totalEur` keeps its name and holds the total in `currency`.
		totalEur: doc.totals.eur,
		currency,
		documentLanguage: doc.language,
		quantities: doc.totals.quantities,
		// The monthly consumption Eigenbelege (#116): per account and month, in sums per resource, rail or deployment.
		consumption: doc.consumption.map((r) => ({
			number: r.number,
			account: r.account,
			month: r.month,
			statement: r.statementNumber,
			lines: r.lines.map((l) => ({ label: l.label, recipient: l.recipient, entries: l.count, quantities: l.quantities, value: l.eurExact, ...(l.unvalued ? { unvalued: l.unvalued } : {}), ...(l.detail ? { detail: l.detail } : {}) })),
			quantities: r.totals.quantities,
			total: r.totals.eur,
			...(r.unvalued ? { unvalued: r.unvalued } : {})
		})),
		kontoauszuege: statements.map((s) => ({
			number: s.number,
			account: s.account,
			method: s.method,
			// A token not in the list: its contract, which names it; the symbol is the token's own claim.
			assets: s.sections.map((x) => ({ asset: x.asset, ...(x.contract ? { contract: x.contract } : {}), opening: x.opening, closing: x.closing, reconciled: reconciled(x.difference), monthly: x.monthly }))
		}))
	};
	if (preview) return { summary, pdf: null, statements: [], csv: null };
	onProgress?.({ step: 'draw' });
	// `req.logo`: the chain's mark, small, beside the title, when asked for (@le-space/pdf's LOGOS;
	// a chain without a mark gets none).
	// `req.chart`: the diagram above a statement's bookings, drawn unless the request switches it off.
	// `req.issuerLogo`: the issuer's own logo (a PNG or JPEG file's bytes), top right in the head of an Eigenbeleg; a statement carries none.
	const pdf = req.format !== 'csv' && wantBelege ? await eigenbelegPdf(doc, { logo: req.logo, issuerLogo: req.issuerLogo }) : null;
	const statementPdfs = [];
	if (req.format !== 'csv') for (const s of statements) statementPdfs.push({ account: s.account, number: s.number, pdf: await statementPdf(s, { logo: req.logo, chart: req.chart }) });
	const csv = req.format === 'pdf' ? null : eigenbelegCsv(doc);
	return { summary, pdf, statements: statementPdfs, csv };
}
