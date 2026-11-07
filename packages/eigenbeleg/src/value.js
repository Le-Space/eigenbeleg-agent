// SPDX-License-Identifier: AGPL-3.0-or-later
// Every entry with its euro value on the day it was made. Where the rate
// comes from is the caller's (the pipeline asks @le-space/rates); this file
// only applies it, and names a fixed rate for tests and offline demos.

import { multiply } from '@le-space/ledger';

/**
 * @typedef {object} Rate
 * @property {string} rate EUR per unit, decimal string
 * @property {string} source human-readable: where and which moment, printed on the document
 * @property {string} date YYYY-MM-DD the rate is for
 */

/** @typedef {{ rateFor: (asset: string, date: string) => Promise<Rate | null> }} Rates */

/**
 * @typedef {import('@le-space/ledger').LedgerEntry & { eur: { value: string, rate: string, source: string } | null }} ValuedEntry
 */

/**
 * Every entry with its euro value (8 decimals; printed with 4, the total rounded to cents
 * where it is printed). An entry without a price gets `eur: null`.
 *
 * @param {import('@le-space/ledger').LedgerEntry[]} entries
 * @param {Rates} rates
 * @returns {Promise<ValuedEntry[]>}
 */
export async function valueEntries(entries, rates) {
	const out = [];
	for (const e of entries) {
		const r = e.priceAs && e.success ? await rates.rateFor(e.priceAs, e.date) : null;
		out.push({ ...e, eur: r ? { value: multiply(e.amount, r.rate, 8), rate: r.rate, source: r.source } : null });
	}
	return out;
}

/** Fixed rates, for tests and offline demos. @param {Record<string, string>} table `NEAR:2026-10-05` → `3.8796` @returns {Rates} */
export function fixedRates(table) {
	return {
		async rateFor(asset, date) {
			const rate = table[`${asset}:${date}`] ?? table[asset];
			return rate ? { rate, source: `fester Testkurs (${asset})`, date } : null;
		}
	};
}
