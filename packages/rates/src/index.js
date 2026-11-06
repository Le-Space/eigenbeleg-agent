// SPDX-License-Identifier: AGPL-3.0-or-later
// The euro value of a payment on the day it was made.
//
// The rate is the day's volume-weighted average price (VWAP) on Kraken for
// the asset against EUR, for the UTC day of the payment; where Kraken has no
// candle for that day (it keeps 720 daily candles), CoinGecko's price for the
// day. Both name themselves as the source on the Eigenbeleg, with the day, so
// a bookkeeper can look the rate up again.
//
// No storage: rates are cached in memory for one request.

import { multiply } from '@eigenbeleg/ledger-core';

/** Kraken pairs by the asset an entry is priced as. */
export const KRAKEN_PAIRS = { NEAR: 'NEAREUR', USDC: 'USDCEUR', USDT: 'USDTEUR', AKT: 'AKTEUR', FIL: 'FILEUR' };
/** CoinGecko coin ids, for the fallback. */
export const COINGECKO_IDS = { NEAR: 'near', USDC: 'usd-coin', USDT: 'tether', AKT: 'akash-network', FIL: 'filecoin', ALEPH: 'aleph' };

/**
 * @typedef {object} Rate
 * @property {string} rate EUR per unit, decimal string
 * @property {string} source human-readable: where and which value
 * @property {string} date YYYY-MM-DD the rate is for
 */

/**
 * @param {object} [o]
 * @param {typeof fetch} [o.fetch]
 * @param {string} [o.coingeckoKey] a CoinGecko demo key, optional
 */
export function createRates({ fetch = globalThis.fetch, coingeckoKey } = {}) {
	/** @type {Map<string, Promise<Map<string, string>>>} */
	const kraken = new Map();
	/** @type {Map<string, Promise<string | null>>} */
	const gecko = new Map();

	/** All daily VWAPs Kraken returns from `since` on, by date. @param {string} pair @param {string} sinceDate */
	function krakenDays(pair, sinceDate) {
		const key = `${pair}:${sinceDate.slice(0, 7)}`;
		if (!kraken.has(key)) {
			const since = Math.floor(Date.parse(`${sinceDate.slice(0, 7)}-01T00:00:00Z`) / 1000) - 86400;
			kraken.set(
				key,
				(async () => {
					const res = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=1440&since=${since}`);
					if (!res.ok) throw new Error(`Kraken answered ${res.status}`);
					const body = await res.json();
					if (body.error?.length) throw new Error(`Kraken: ${body.error.join(', ')}`);
					const rows = Object.entries(body.result ?? {}).find(([k]) => k !== 'last')?.[1] ?? [];
					/** @type {Map<string, string>} */
					const days = new Map();
					// [time, open, high, low, close, vwap, volume, count]
					for (const r of rows) {
						const vwap = Number(r[5]) > 0 ? String(r[5]) : String(r[4]);
						days.set(new Date(Number(r[0]) * 1000).toISOString().slice(0, 10), vwap);
					}
					return days;
				})()
			);
		}
		return /** @type {Promise<Map<string, string>>} */ (kraken.get(key));
	}

	/** CoinGecko's price of a day (00:00 UTC). @param {string} id @param {string} date */
	function geckoDay(id, date) {
		const key = `${id}:${date}`;
		if (!gecko.has(key)) {
			const [y, m, d] = date.split('-');
			const headers = coingeckoKey ? { 'x-cg-demo-api-key': coingeckoKey } : undefined;
			gecko.set(
				key,
				(async () => {
					const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/history?date=${d}-${m}-${y}&localization=false`, { headers });
					if (!res.ok) return null;
					const body = await res.json();
					const eur = body?.market_data?.current_price?.eur;
					return typeof eur === 'number' ? eur.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : null;
				})()
			);
		}
		return /** @type {Promise<string | null>} */ (gecko.get(key));
	}

	/**
	 * The rate of an asset on a day, or null where none is known.
	 *
	 * @param {string} asset what the entry is priced as: NEAR, USDC, USDT
	 * @param {string} date YYYY-MM-DD (UTC)
	 * @returns {Promise<Rate | null>}
	 */
	async function rateFor(asset, date) {
		const pair = KRAKEN_PAIRS[/** @type {keyof typeof KRAKEN_PAIRS} */ (asset)];
		if (pair) {
			try {
				const rate = (await krakenDays(pair, date)).get(date);
				if (rate) return { rate, source: `Kraken ${pair}, Tagesdurchschnitt (VWAP) ${date} UTC`, date };
			} catch {
				// fall through to CoinGecko
			}
		}
		const id = COINGECKO_IDS[/** @type {keyof typeof COINGECKO_IDS} */ (asset)];
		if (id) {
			const rate = await geckoDay(id, date);
			if (rate) return { rate, source: `CoinGecko ${id}/EUR, Kurs ${date} 00:00 UTC`, date };
		}
		return null;
	}

	return { rateFor };
}

/**
 * @typedef {import('@eigenbeleg/ledger-core').LedgerEntry & { eur: { value: string, rate: string, source: string } | null }} ValuedEntry
 */

/**
 * Every entry with its euro value (8 decimals; printed with 4, the total rounded to cents
 * where it is printed). An entry without a price gets `eur: null`.
 *
 * @param {import('@eigenbeleg/ledger-core').LedgerEntry[]} entries
 * @param {{ rateFor: (asset: string, date: string) => Promise<Rate | null> }} rates
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

/** Fixed rates, for tests and offline demos. @param {Record<string, string>} table `NEAR:2026-10-05` → `3.8796` */
export function fixedRates(table) {
	return {
		/** @param {string} asset @param {string} date */
		async rateFor(asset, date) {
			const rate = table[`${asset}:${date}`] ?? table[asset];
			return rate ? { rate, source: `fester Testkurs (${asset})`, date } : null;
		}
	};
}
