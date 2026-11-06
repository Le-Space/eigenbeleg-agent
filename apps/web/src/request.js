// SPDX-License-Identifier: AGPL-3.0-or-later
// What the form becomes: the request the pipeline checks (the same check the
// API runs), with the payer, who never leaves the page. Pure functions, so
// they are tested without a browser.

/**
 * @typedef {object} FormValues
 * @property {string} chain
 * @property {string} network
 * @property {string} addresses one per line (or separated by commas or spaces)
 * @property {'month' | 'range'} periodMode
 * @property {string} month YYYY-MM
 * @property {string} from YYYY-MM-DD
 * @property {string} to YYYY-MM-DD
 * @property {string} name
 * @property {string} postal
 * @property {string} number first Eigenbeleg number; the others count up from it
 * @property {string} statementNumber Kontoauszug number (default KA-<from>)
 * @property {string[]} includeKinds
 * @property {'eigenbelege' | 'kontoauszug' | 'beide'} document which documents are made
 */

/** @param {string} text */
export function splitAddresses(text) {
	return [...new Set(text.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean))];
}

/**
 * The request for `parseRequest` and `generate` (@eigenbeleg/pipeline): every
 * file in one run (format json).
 * @param {FormValues} f
 */
export function requestBody(f) {
	return {
		chain: f.chain,
		network: f.network,
		addresses: splitAddresses(f.addresses),
		period: f.periodMode === 'month' ? { month: f.month } : { from: f.from, to: f.to },
		...(f.number.trim() ? { number: f.number.trim() } : {}),
		...(f.statementNumber.trim() ? { statementNumber: f.statementNumber.trim() } : {}),
		includeKinds: [...f.includeKinds],
		document: f.document,
		format: 'json',
		payer: { name: f.name.trim(), address: f.postal.trim() }
	};
}

/** A file name from a document number. @param {unknown} n */
export const fileName = (n) => String(n).replace(/[^A-Za-z0-9._-]/g, '_');

/** The payer kept in this browser, only when the user ticks "remember". */
const PAYER_KEY = 'payer';

/** @returns {{ name: string, postal: string } | null} */
export function rememberedPayer() {
	try {
		const p = JSON.parse(globalThis.localStorage?.getItem(PAYER_KEY) ?? 'null');
		return p && typeof p.name === 'string' && typeof p.postal === 'string' ? { name: p.name, postal: p.postal } : null;
	} catch {
		return null;
	}
}

/** @param {{ name: string, postal: string } | null} p null forgets it */
export function rememberPayer(p) {
	try {
		if (p) globalThis.localStorage?.setItem(PAYER_KEY, JSON.stringify({ name: p.name, postal: p.postal }));
		else globalThis.localStorage?.removeItem(PAYER_KEY);
	} catch {
		// private mode or blocked storage: nothing is kept
	}
}
