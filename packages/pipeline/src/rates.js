// SPDX-License-Identifier: AGPL-3.0-or-later
// The rate of a payment's day, from @le-space/rates (shared with Le Space
// Belege): the euro price at 00:00 UTC of the day – CoinGecko's daily
// snapshot, else Kraken's daily open (NEAR and USDT too, both are in
// RATE_SOURCES); for USD (Aleph credits are priced in it) the ECB reference
// rate. A document in another currency (`currency`, DOCUMENT_CURRENCIES of
// @le-space/eigenbeleg) gets that euro rate times the currency's units per
// euro of the day: the ECB reference rate, for RUB the Bank of Russia's
// official rate; for USD, where CoinGecko answered, its own USD price of the
// same snapshot. The Eigenbeleg names both legs with source and day, so a
// bookkeeper can look each up again.
//
// No storage: rates are cached in memory for one run.

import { RateError, createRateService } from '@le-space/rates';

/** How the euro leg's source is named on the document. @type {Record<string, (date: string, r: { asset: string, at: string }) => string>} */
const SOURCE_TEXT = {
	coingecko: (d) => `CoinGecko, Kurs ${d} 00:00 UTC`,
	kraken: (d) => `Kraken, Kurs ${d} 00:00 UTC`,
	// A currency (USD, for Aleph credits): the ECB's reference rate of the day, or the last one before it.
	ecb: (_d, r) => `EZB-Referenzkurs ${r.asset}/EUR vom ${String(r.at).slice(0, 10)}`
};

/** How the second leg, from the euro into the document's currency, is named. @type {Record<string, (fx: { currency: string, at: string }) => string>} */
const FX_TEXT = {
	ecb: (fx) => `EZB-Referenzkurs EUR/${fx.currency} vom ${String(fx.at).slice(0, 10)}`,
	cbr: (fx) => `amtlicher Kurs EUR/${fx.currency} der Bank von Russland, gültig am ${String(fx.at).slice(0, 10)}`
};

/**
 * What a rate's answer is called on the document: the euro leg, and the leg into the document's currency where there is one.
 *
 * @param {string} date YYYY-MM-DD
 * @param {{ asset: string, at: string, source: string, currency?: string, fx?: { currency: string, source: string, at: string } }} r
 */
export function sourceText(date, r) {
	const currency = r.currency ?? 'EUR';
	// The asset is the document's currency itself (USD in a document in USD): one to one.
	if (r.source === 'same') return `${currency}, 1:1`;
	const leg = SOURCE_TEXT[r.source] ?? ((/** @type {string} */ d) => `${r.source}, Kurs ${d} 00:00 UTC`);
	// CoinGecko's own USD price of the same snapshot: no second leg.
	if (currency !== 'EUR' && !r.fx) return r.source === 'coingecko' ? `CoinGecko, ${currency}-Kurs ${date} 00:00 UTC` : leg(date, r);
	if (!r.fx) return leg(date, r);
	const fx = FX_TEXT[r.fx.source] ?? ((/** @type {{ currency: string, at: string }} */ f) => `${r.fx?.source} EUR/${f.currency} vom ${String(f.at).slice(0, 10)}`);
	return `${leg(date, r)} × ${fx(r.fx)}`;
}

/**
 * @param {object} [o]
 * @param {typeof fetch} [o.fetch]
 * @param {string} [o.coingeckoKey] a CoinGecko demo key, optional
 * @param {() => Date} [o.now] for tests
 * @param {string} [o.currency] the document's currency (DOCUMENT_CURRENCIES of @le-space/eigenbeleg), EUR when not given
 * @returns {import('@le-space/eigenbeleg').Rates}
 */
export function dayRates({ fetch = globalThis.fetch, coingeckoKey, now, currency = 'EUR' } = {}) {
	const service = createRateService({ fetch, coingeckoKey: async () => coingeckoKey ?? null, ...(now ? { now } : {}) });
	/** @type {Map<string, Promise<import('@le-space/eigenbeleg').Rate | null>>} */
	const cache = new Map();
	// An EUR rate stays as it always was; another currency is named on it, as valueEntries checks.
	const mark = currency === 'EUR' ? {} : { currency };

	/**
	 * The rate of an asset on a day in the document's currency, or null where none is known.
	 *
	 * @param {string} asset what the entry is priced as: NEAR, USDC, AKT, FIL, …
	 * @param {string} date YYYY-MM-DD (UTC)
	 */
	function rateFor(asset, date) {
		const key = `${asset}:${date}`;
		if (!cache.has(key)) {
			cache.set(
				key,
				(async () => {
					let r;
					try {
						r = await service.rate(asset, date, currency === 'EUR' ? undefined : { currency });
					} catch (e) {
						// 502: no source had the day (or no rate into the currency); 400: the service lists no source for the asset.
						if (e instanceof RateError) return null;
						throw e;
					}
					return { rate: r.rate, source: sourceText(date, r), date, ...mark };
				})()
			);
		}
		return /** @type {Promise<import('@le-space/eigenbeleg').Rate | null>} */ (cache.get(key));
	}

	return { rateFor };
}
