// SPDX-License-Identifier: AGPL-3.0-or-later
// What the form becomes: the request the pipeline checks (the same check the
// API runs), with the payer, who never leaves the page. Pure functions, so
// they are tested without a browser. The person's own Alchemy key (#25) is
// never part of the request body: it goes to the reads as a dependency.

import { isAlchemyKey } from '@eigenbeleg/pipeline/keyed';

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
 * @property {boolean} logo the chain's mark on the documents
 * @property {boolean} chart the diagram above a statement's bookings
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
		logo: f.logo,
		chart: f.chart,
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

/** The chain, network and addresses kept in this browser, only when the user ticks their "remember". */
const ACCOUNTS_KEY = 'accounts';

/** @typedef {{ chain: string, network: string, addresses: string }} Accounts */

/** @returns {Accounts | null} */
export function rememberedAccounts() {
	try {
		const a = JSON.parse(globalThis.localStorage?.getItem(ACCOUNTS_KEY) ?? 'null');
		return a && typeof a.chain === 'string' && typeof a.network === 'string' && typeof a.addresses === 'string' ? { chain: a.chain, network: a.network, addresses: a.addresses } : null;
	} catch {
		return null;
	}
}

/** The person's own Alchemy key, kept in this browser only when they tick its "remember" (#25). */
const KEY_KEY = 'alchemyKey';

/** @returns {string | null} */
export function rememberedKey() {
	try {
		const k = globalThis.localStorage?.getItem(KEY_KEY);
		return isAlchemyKey(k) ? /** @type {string} */ (k) : null;
	} catch {
		return null;
	}
}

/** @param {string | null} k null forgets it; anything that is not a key is not kept */
export function rememberKey(k) {
	try {
		if (isAlchemyKey(k)) globalThis.localStorage?.setItem(KEY_KEY, /** @type {string} */ (k));
		else globalThis.localStorage?.removeItem(KEY_KEY);
	} catch {
		// private mode or blocked storage: nothing is kept
	}
}

/** What a NearBlocks key looks like: a token without spaces. Anything else is not sent anywhere. */
export const isNearblocksKey = (/** @type {unknown} */ k) => typeof k === 'string' && /^[A-Za-z0-9._-]{8,200}$/.test(k);

/** The person's own NearBlocks key (#5), kept in this browser only when they tick its "remember". */
const NB_KEY = 'nearblocksKey';

/** @returns {string | null} */
export function rememberedNearblocksKey() {
	try {
		const k = globalThis.localStorage?.getItem(NB_KEY);
		return isNearblocksKey(k) ? /** @type {string} */ (k) : null;
	} catch {
		return null;
	}
}

/** @param {string | null} k null forgets it; anything that is not a key is not kept */
export function rememberNearblocksKey(k) {
	try {
		if (isNearblocksKey(k)) globalThis.localStorage?.setItem(NB_KEY, /** @type {string} */ (k));
		else globalThis.localStorage?.removeItem(NB_KEY);
	} catch {
		// private mode or blocked storage: nothing is kept
	}
}

/** @param {Accounts | null} a null forgets them */
export function rememberAccounts(a) {
	try {
		if (a) globalThis.localStorage?.setItem(ACCOUNTS_KEY, JSON.stringify({ chain: a.chain, network: a.network, addresses: a.addresses }));
		else globalThis.localStorage?.removeItem(ACCOUNTS_KEY);
	} catch {
		// private mode or blocked storage: nothing is kept
	}
}
