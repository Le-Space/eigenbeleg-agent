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
 * @property {Uint8Array | null} [issuerLogo] the issuer's own logo, a PNG or JPEG file's bytes; it stays in this browser
 * @property {'eigenbelege' | 'kontoauszug' | 'beide'} document which documents are made
 * @property {string} [currency] the documents' currency (ISO 4217); EUR when not given
 * @property {'de' | 'en'} [documentLanguage] the documents' language; German when not given
 * @property {string} [referenceEur] the issuer's own value in EUR per unit, for a chain whose asset has no rate (DOI); '' for none
 * @property {string} [referenceFrom] YYYY-MM-DD, the day it holds from
 * @property {string} [referenceAsset] the asset it is for
 */

/** "0,05" or "0.05" as the request writes it; null where it is no positive number. @param {string} text */
export function referenceEur(text) {
	const v = text.trim().replace(',', '.');
	return /^\d{1,9}(\.\d{1,12})?$/.test(v) && Number(v) > 0 ? v : null;
}

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
		...(f.issuerLogo ? { issuerLogo: f.issuerLogo } : {}),
		document: f.document,
		...(f.currency && f.currency !== 'EUR' ? { currency: f.currency } : {}),
		...(f.documentLanguage === 'en' ? { documentLanguage: 'en' } : {}),
		...(f.referenceAsset && f.referenceEur?.trim() ? { reference: { [f.referenceAsset]: { eur: referenceEur(f.referenceEur) ?? f.referenceEur.trim(), from: f.referenceFrom ?? '' } } } : {}),
		format: 'json',
		payer: { name: f.name.trim(), address: f.postal.trim() }
	};
}

/** A file name from a document number. @param {unknown} n */
export const fileName = (n) => String(n).replace(/[^A-Za-z0-9._-]/g, '_');

/** The payer kept in this browser, only when the user ticks "remember". */
const PAYER_KEY = 'payer';

/** A file's bytes as base64 text, to keep them beside the payer. @param {Uint8Array} bytes */
export function bytesToText(bytes) {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}

/** @param {string} text base64 @returns {Uint8Array | null} null: not base64 */
export function textToBytes(text) {
	try {
		const s = atob(text);
		const out = new Uint8Array(s.length);
		for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

/** @returns {{ name: string, postal: string, logo: Uint8Array | null } | null} logo: the issuer's logo as it was kept */
export function rememberedPayer() {
	try {
		const p = JSON.parse(globalThis.localStorage?.getItem(PAYER_KEY) ?? 'null');
		return p && typeof p.name === 'string' && typeof p.postal === 'string' ? { name: p.name, postal: p.postal, logo: typeof p.logo === 'string' ? textToBytes(p.logo) : null } : null;
	} catch {
		return null;
	}
}

/**
 * @param {{ name: string, postal: string, logo?: Uint8Array | null } | null} p null forgets it, the logo with it
 * @returns {boolean} false: the browser did not keep it (private mode, blocked or full storage)
 */
export function rememberPayer(p) {
	try {
		if (p) globalThis.localStorage?.setItem(PAYER_KEY, JSON.stringify({ name: p.name, postal: p.postal, ...(p.logo ? { logo: bytesToText(p.logo) } : {}) }));
		else globalThis.localStorage?.removeItem(PAYER_KEY);
		return true;
	} catch {
		// private mode or blocked storage: nothing is kept
		return false;
	}
}

/**
 * The chain and network last chosen, and one address list per chain and network (#115), kept in this
 * browser only while the user ticks their "remember". Unticking forgets all of them.
 */
const ACCOUNTS_KEY = 'accounts';

/**
 * @typedef {{ chain: string, network: string, addresses: string }} Accounts the form's chain, network and addresses
 * @typedef {{ chain: string, network: string, lists: Record<string, string> }} KeptAccounts
 *   lists: the addresses per `listKey(chain, network)`
 */

/** Where a chain's and network's addresses are kept. @param {string} chain @param {string} network */
export const listKey = (chain, network) => `${chain}/${network}`;

/** @param {unknown} lists @returns {Record<string, string>} only text lists under keys that name a chain and network */
function cleanLists(lists) {
	/** @type {Record<string, string>} */
	const out = {};
	if (lists && typeof lists === 'object' && !Array.isArray(lists)) {
		for (const [k, v] of Object.entries(lists)) if (typeof v === 'string' && v.trim() && /^[^/]+\/[^/]+$/.test(k)) out[k] = v;
	}
	return out;
}

/**
 * What this browser keeps. The single list of earlier versions ({ chain, network, addresses }) comes
 * back as the list of the chain and network it was saved with, so no one loses addresses.
 * @returns {KeptAccounts | null}
 */
export function rememberedAccounts() {
	try {
		const a = JSON.parse(globalThis.localStorage?.getItem(ACCOUNTS_KEY) ?? 'null');
		if (!a || typeof a.chain !== 'string' || typeof a.network !== 'string') return null;
		if (typeof a.addresses === 'string') return { chain: a.chain, network: a.network, lists: cleanLists({ [listKey(a.chain, a.network)]: a.addresses }) };
		return { chain: a.chain, network: a.network, lists: cleanLists(a.lists) };
	} catch {
		return null;
	}
}

/** The addresses kept for a chain and network, '' when none. @param {KeptAccounts | null} kept @param {string} chain @param {string} network */
export const keptAddresses = (kept, chain, network) => kept?.lists[listKey(chain, network)] ?? '';

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

/**
 * Keeps the chosen chain and network and this chain's and network's addresses, beside the lists of the
 * others; an empty list is not kept.
 * @param {Accounts | null} a null forgets them all, every chain's list with them
 */
export function rememberAccounts(a) {
	try {
		if (!a) return globalThis.localStorage?.removeItem(ACCOUNTS_KEY);
		const lists = { ...(rememberedAccounts()?.lists ?? {}), [listKey(a.chain, a.network)]: a.addresses.trim() };
		globalThis.localStorage?.setItem(ACCOUNTS_KEY, JSON.stringify({ chain: a.chain, network: a.network, lists: cleanLists(lists) }));
	} catch {
		// private mode or blocked storage: nothing is kept
	}
}
