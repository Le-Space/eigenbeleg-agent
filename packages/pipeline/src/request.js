// SPDX-License-Identifier: AGPL-3.0-or-later
// Checks a POST /eigenbeleg body before anything is paid or fetched.
// What the payer sends (name, postal address) is used for this one response
// and dropped; it is never logged or stored.

import { monthPeriod } from '@eigenbeleg/ledger-core';
import { DEFAULT_KINDS } from '@eigenbeleg/eigenbeleg';
import { BLOCKS } from './blocks.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,39}$/;
const FORMATS = new Set(['pdf', 'csv', 'json']);
const DOCUMENTS = new Set(['eigenbelege', 'kontoauszug', 'beide']);
const KINDS = new Set(['fee', 'storage', 'transfer', 'call']);
const MAX_DAYS = 92;

export class RequestError extends Error {}

/** A YYYY-MM-DD string that is a real day (2026-02-31 is not). @param {unknown} d */
function isDate(d) {
	if (typeof d !== 'string' || !DATE.test(d)) return false;
	const t = new Date(`${d}T00:00:00Z`);
	return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/**
 * @param {any} body
 * @param {{ preview?: boolean, today?: string }} [opts] today: YYYY-MM-DD, for tests (default: the clock's UTC day); preview: the free POST /eigenbeleg/preview, which
 *   must not get the payer's name and address (a body with `payer` is refused) and has no format
 * @returns {{ chain: string, network: 'mainnet' | 'testnet', addresses: string[], period: { from: string, to: string }, format: 'pdf' | 'csv' | 'json', document: 'eigenbelege' | 'kontoauszug' | 'beide', statementNumber: string, payer: { name: string, address: string, addresses: string[] }, number: string, includeKinds: string[] }}
 */
export function parseRequest(body, { preview = false, today } = {}) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('body must be a JSON object');
	const chain = typeof body.chain === 'string' ? body.chain : '';
	const block = Object.hasOwn(BLOCKS, chain) ? BLOCKS[chain] : null;
	if (!block) throw new RequestError(`no building block for chain "${chain}" yet; see GET /blocks`);
	const network = body.network ?? 'mainnet';
	if (!block.networks.includes(network)) throw new RequestError(`network must be one of ${block.networks.join(', ')}`);
	if (!Array.isArray(body.addresses) || body.addresses.length < 1 || body.addresses.length > 10) throw new RequestError('addresses: one to ten own addresses');
	// Trimmed before they are checked and compared: the same address twice
	// would be read twice, and a transfer between own addresses look like a payment.
	const addresses = [...new Set(body.addresses.map((/** @type {unknown} */ a) => (typeof a === 'string' ? a.trim() : '')))];
	for (const a of addresses) if (!block.isAddress(a)) throw new RequestError(`not a ${chain} address: ${String(a).slice(0, 80)}`);

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
	if (period.to > yesterday) period = { from: period.from, to: yesterday };

	const format = preview ? 'json' : body.format ?? 'pdf';
	if (!FORMATS.has(format)) throw new RequestError('format: pdf, csv or json (every file)');
	// What is delivered: the Eigenbelege (one per transaction, the default), the
	// Kontoauszug per address, or both when asked for. Never both unasked.
	const document = body.document ?? 'eigenbelege';
	if (!DOCUMENTS.has(document)) throw new RequestError('document: eigenbelege, kontoauszug or beide');
	if (format === 'pdf' && document === 'beide') throw new RequestError('a PDF is one document; ask for format json to get both');
	if (format === 'pdf' && document === 'kontoauszug' && body.addresses.length > 1) throw new RequestError('a Kontoauszug as PDF is for one address; ask for format json to get one per address');
	const statementNumber = body.statementNumber ?? `KA-${period.from}`;
	if (!NUMBER.test(String(statementNumber))) throw new RequestError('statementNumber: up to 40 letters, digits and . _ / -');

	if (preview && body.payer !== undefined) throw new RequestError('the preview takes no payer: name and address go only to the paid POST /eigenbeleg');
	// The preview builds the same document, but never shows or draws the payer.
	const payer = preview ? { name: 'preview', address: 'preview' } : body.payer ?? {};
	if (typeof payer.name !== 'string' || payer.name.trim().length < 2 || payer.name.length > 200) throw new RequestError('payer.name: 2 to 200 characters');
	if (typeof payer.address !== 'string' || payer.address.trim().length < 5 || payer.address.length > 500) throw new RequestError('payer.address: the postal address, 5 to 500 characters');

	const number = body.number ?? `EB-${period.to.slice(0, 4)}-001`;
	if (!NUMBER.test(String(number))) throw new RequestError('number: up to 40 letters, digits and . _ / -');

	const includeKinds = body.includeKinds ?? DEFAULT_KINDS;
	if (!Array.isArray(includeKinds) || includeKinds.some((k) => !KINDS.has(k))) throw new RequestError(`includeKinds: some of ${[...KINDS].join(', ')}`);

	return {
		chain,
		network,
		addresses,
		period,
		format,
		document,
		statementNumber: String(statementNumber),
		payer: { name: payer.name, address: payer.address, addresses },
		number: String(number),
		includeKinds
	};
}
