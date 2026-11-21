// SPDX-License-Identifier: AGPL-3.0-or-later
// Checks a POST /eigenbeleg body before anything is paid or fetched.
// What the payer sends (name, postal address) is used for this one response
// and dropped; it is never logged or stored.

import { monthPeriod } from '@le-space/ledger';
import { DEFAULT_KINDS } from '@le-space/eigenbeleg/document';
import { BLOCKS } from './blocks.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,39}$/;
const FORMATS = new Set(['pdf', 'csv', 'json']);
const DOCUMENTS = new Set(['eigenbelege', 'kontoauszug', 'beide']);
const KINDS = new Set(['fee', 'storage', 'transfer', 'call', 'swap']);
const MAX_DAYS = 92;

export class RequestError extends Error {}

/** One mailbox: local part, @, a host with a dot; no spaces, brackets or display names. */
const EMAIL = /^[^\s@<>,;"()[\]]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** A YYYY-MM-DD string that is a real day (2026-02-31 is not). @param {unknown} d */
function isDate(d) {
	if (typeof d !== 'string' || !DATE.test(d)) return false;
	const t = new Date(`${d}T00:00:00Z`);
	return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/**
 * @param {any} body
 * @param {{ preview?: boolean, today?: string, blocks?: Record<string, import('./blocks.js').Block> }} [opts] today: YYYY-MM-DD, for tests (default: the clock's UTC day); preview: the free POST /eigenbeleg/preview, which
 *   must not get the payer's name and address (a body with `payer` is refused) and has no format; blocks: what this side serves
 *   (the API with an Alchemy key: `blocksFor(deps)`, keyed.js), the keyless BLOCKS when not given
 * @returns {{ chain: string, network: 'mainnet' | 'testnet', addresses: string[], period: { from: string, to: string }, format: 'pdf' | 'csv' | 'json', document: 'eigenbelege' | 'kontoauszug' | 'beide', statementNumber: string, payer: { name: string, address: string, addresses: string[] }, number: string, includeKinds: string[], logo: boolean, chart: boolean, email: string | null, language: 'de' | 'en' }}
 */
export function parseRequest(body, { preview = false, today, blocks = BLOCKS } = {}) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('body must be a JSON object');
	const chain = typeof body.chain === 'string' ? body.chain : '';
	const block = Object.hasOwn(blocks, chain) ? blocks[chain] : null;
	if (!block) throw new RequestError(`no building block for chain "${chain}" yet; see GET /blocks`);
	const network = body.network ?? 'mainnet';
	if (!block.networks.includes(network)) throw new RequestError(`network must be one of ${block.networks.join(', ')}`);
	if (!Array.isArray(body.addresses) || body.addresses.length < 1 || body.addresses.length > 10) throw new RequestError('addresses: one to ten own addresses');
	// Trimmed before they are checked and compared: the same address twice
	// would be read twice, and a transfer between own addresses look like a payment.
	const trimmed = [...new Set(body.addresses.map((/** @type {unknown} */ a) => (typeof a === 'string' ? a.trim() : '')))];
	for (const a of trimmed) if (!block.isAddress(a)) throw new RequestError(`not a ${chain} address: ${String(a).slice(0, 80)}`);
	// One spelling per account where the source has one (Aleph: the EIP-55 checksum).
	const addresses = block.canonical ? [...new Set(trimmed.map(block.canonical))] : trimmed;

	let period;
	const p = body.period ?? {};
	if (typeof p.month === 'string') {
		try {
			period = monthPeriod(p.month);
		} catch {
			throw new RequestError('period.month must be YYYY-MM');
		}
	} else if (isDate(p.from) && isDate(p.to)) period = { from: p.from, to: p.to };
	else throw new RequestError('period: { month: "YYYY-MM" } or { from, to } as real dates YYYY-MM-DD');
	const days = (Date.parse(period.to) - Date.parse(period.from)) / 86400000 + 1;
	if (!(days >= 1 && days <= MAX_DAYS)) throw new RequestError(`period: 1 to ${MAX_DAYS} days`);
	// Only finished days: a period that reaches today or later ends yesterday,
	// and the Eigenbeleg says so.
	const yesterday = new Date((today ? Date.parse(`${today}T00:00:00Z`) : Date.now()) - 86400000).toISOString().slice(0, 10);
	if (period.from > yesterday) throw new RequestError('period has no finished day yet');
	// A block that reads whole months (Aleph's statement) takes one finished month.
	if (block.period === 'month' && (typeof p.month !== 'string' || period.to > yesterday)) throw new RequestError(`${chain}: one whole finished month, as period: { month: "YYYY-MM" }`);
	if (period.to > yesterday) period = { from: period.from, to: yesterday };

	const format = preview ? 'json' : body.format ?? 'pdf';
	if (!FORMATS.has(format)) throw new RequestError('format: pdf, csv or json (every file)');
	// What is delivered: the Eigenbelege (one per transaction, the default), the
	// Kontoauszug per address, or both when asked for. Never both unasked.
	// A block may give only some of them (Aleph: the statement); its first is the default.
	const offered = block.documents ?? ['eigenbelege', 'kontoauszug', 'beide'];
	const document = body.document ?? offered[0];
	if (!DOCUMENTS.has(document)) throw new RequestError('document: eigenbelege, kontoauszug or beide');
	if (!offered.includes(document)) throw new RequestError(`document: ${chain} gives ${offered.join(', ')} only`);
	if (format === 'pdf' && document === 'beide') throw new RequestError('a PDF is one document; ask for format json to get both');
	if (format === 'pdf' && document === 'kontoauszug' && body.addresses.length > 1) throw new RequestError('a Kontoauszug as PDF is for one address; ask for format json to get one per address');
	const statementNumber = body.statementNumber ?? `${block.statementPrefix ?? 'KA'}-${period.from}`;
	if (!NUMBER.test(String(statementNumber))) throw new RequestError('statementNumber: up to 40 letters, digits and . _ / -');

	if (preview && body.payer !== undefined) throw new RequestError('the preview takes no payer: name and address go only to the paid POST /eigenbeleg');
	// The preview builds the same document, but never shows or draws the payer.
	const payer = preview ? { name: 'preview', address: 'preview' } : body.payer ?? {};
	if (typeof payer.name !== 'string' || payer.name.trim().length < 2 || payer.name.length > 200) throw new RequestError('payer.name: 2 to 200 characters');
	if (typeof payer.address !== 'string' || payer.address.trim().length < 5 || payer.address.length > 500) throw new RequestError('payer.address: the postal address, 5 to 500 characters');

	const number = body.number ?? `EB-${period.to.slice(0, 4)}-001`;
	if (!NUMBER.test(String(number))) throw new RequestError('number: up to 40 letters, digits and . _ / -');

	// The chain's mark on the documents, small, beside the title: off unless asked for.
	const logo = body.logo ?? false;
	if (typeof logo !== 'boolean') throw new RequestError('logo: true or false');
	// The diagram above a statement's bookings (the balance, or the consumption per day): on unless switched off.
	const chart = body.chart ?? true;
	if (typeof chart !== 'boolean') throw new RequestError('chart: true or false');
	// The files also by mail (for a document management system's inbox): one address, used for that
	// one mail. The preview sends nothing, so it takes none.
	if (preview && body.email !== undefined) throw new RequestError('the preview takes no email: the files go only with the paid POST /eigenbeleg');
	const email = body.email === undefined || body.email === null ? null : body.email;
	if (email !== null && !(typeof email === 'string' && EMAIL.test(email) && email.length <= 254)) throw new RequestError('email: one address to mail the files to, like belege@example.org');
	// The language of the mail (and of what else is said to the person); the documents are German either way.
	const language = body.language ?? 'en';
	if (language !== 'de' && language !== 'en') throw new RequestError('language: "de" or "en" (the language of the mail; the documents are German)');
	// Only the kinds the chain has (storage deposits are NEAR's); the default is what the chain has of fee
	// and storage, or the block's own default (NEAR: its swaps too; Aleph: its credit purchases).
	const kindsOffered = block.kinds ?? [...KINDS];
	const includeKinds = body.includeKinds ?? (block.defaultKinds ?? DEFAULT_KINDS).filter((k) => kindsOffered.includes(k));
	if (!Array.isArray(includeKinds) || includeKinds.some((k) => !KINDS.has(k))) throw new RequestError(`includeKinds: some of ${[...KINDS].join(', ')}`);
	const foreign = includeKinds.filter((k) => !kindsOffered.includes(k));
	if (foreign.length) throw new RequestError(`includeKinds: ${chain} has ${kindsOffered.join(', ') || 'no kinds (a statement only)'}, not ${foreign.join(', ')}`);

	// A reference value for an asset no price source quotes (Doichain's DOI): the issuer's own figure, in EUR
	// per unit, from a day on. It is printed as such ("Referenzwert von …, Stand …, kein Börsenkurs").
	/** @type {Record<string, { from: string, eur: string, by: string }[]>} */
	const reference = {};
	if (body.reference !== undefined) {
		const assets = block.referenceAssets ?? [];
		if (!body.reference || typeof body.reference !== 'object' || Array.isArray(body.reference)) throw new RequestError('reference: an object like { "DOI": { "eur": "0.05", "from": "2026-01-01" } }');
		for (const [asset, given] of Object.entries(body.reference)) {
			if (!assets.includes(asset)) throw new RequestError(`reference: ${chain} takes a reference value for ${assets.join(', ') || 'no asset'}, not for ${String(asset).slice(0, 20)}`);
			const lines = Array.isArray(given) ? given : [given];
			if (lines.length < 1 || lines.length > 12) throw new RequestError('reference: one to twelve values per asset');
			reference[asset] = lines.map((line) => {
				if (!line || typeof line !== 'object' || typeof line.eur !== 'string' || !/^\d{1,9}(\.\d{1,12})?$/.test(line.eur) || !(Number(line.eur) > 0)) throw new RequestError('reference: eur is a positive decimal string like "0.05" (EUR per unit)');
				if (!isDate(line.from)) throw new RequestError('reference: from is the day the value holds from, YYYY-MM-DD');
				// Who set it is the issuer; the preview names nobody.
				return { from: line.from, eur: line.eur, by: preview ? '' : payer.name.trim() };
			});
		}
	}

	// An Eigenbeleg is a euro amount: for an asset nothing quotes it needs the issuer's value. The statement does not.
	const unvalued = (block.referenceAssets ?? []).filter((a) => !reference[a]);
	if (!preview && unvalued.length && document !== 'kontoauszug')
		throw new RequestError(`reference: ${unvalued.join(', ')} has no published rate, and an Eigenbeleg needs a euro value. Hand in your own reference value, e.g. "reference": { "${unvalued[0]}": { "eur": "0.05", "from": "2026-01-01" } }, or ask for "document": "kontoauszug" (in ${unvalued.join(', ')} only)`);

	return {
		reference,
		chain,
		network,
		addresses,
		period,
		format,
		document,
		statementNumber: String(statementNumber),
		payer: { name: payer.name, address: payer.address, addresses },
		number: String(number),
		includeKinds,
		logo,
		chart,
		email,
		language
	};
}
