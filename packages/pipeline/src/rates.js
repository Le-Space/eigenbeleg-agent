// SPDX-License-Identifier: AGPL-3.0-or-later
// The euro rate of a payment's day, from @le-space/rates (shared with Le
// Space Belege): the price at 00:00 UTC of the day – CoinGecko's daily
// snapshot, else Kraken's daily open (NEAR and USDT too, both are in
// RATE_SOURCES); for USD (Aleph credits are priced in it) the ECB reference
// rate. The Eigenbeleg names the source and the
// moment on the document, so a bookkeeper can look the rate up again.
//
// No storage: rates are cached in memory for one run.

import { RateError, createRateService } from '@le-space/rates';

/** How a source is named on the document. @type {Record<string, (date: string, r: { asset: string, at: string }) => string>} */
const SOURCE_TEXT = {
	coingecko: (d) => `CoinGecko, Kurs ${d} 00:00 UTC`,
	kraken: (d) => `Kraken, Kurs ${d} 00:00 UTC`,
	// A currency (USD, for Aleph credits): the ECB's reference rate of the day, or the last one before it.
	ecb: (_d, r) => `EZB-Referenzkurs ${r.asset}/EUR vom ${String(r.at).slice(0, 10)}`
};

/**
 * @param {object} [o]
 * @param {typeof fetch} [o.fetch]
 * @param {string} [o.coingeckoKey] a CoinGecko demo key, optional
 * @param {() => Date} [o.now] for tests
 * @returns {import('@eigenbeleg/eigenbeleg').Rates}
 */
export function dayRates({ fetch = globalThis.fetch, coingeckoKey, now } = {}) {
	const service = createRateService({ fetch, coingeckoKey: async () => coingeckoKey ?? null, ...(now ? { now } : {}) });
	/** @type {Map<string, Promise<import('@eigenbeleg/eigenbeleg').Rate | null>>} */
	const cache = new Map();

	/**
	 * The rate of an asset on a day, or null where none is known.
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
						r = await service.rate(asset, date);
					} catch (e) {
						// 502: no source had the day; 400: the service lists no source for the asset.
						if (e instanceof RateError) return null;
						throw e;
					}
					const text = SOURCE_TEXT[r.source] ?? ((/** @type {string} */ d) => `${r.source}, Kurs ${d} 00:00 UTC`);
					return { rate: r.rate, source: text(date, r), date };
				})()
			);
		}
		return /** @type {Promise<import('@eigenbeleg/eigenbeleg').Rate | null>} */ (cache.get(key));
	}

	return { rateFor };
}
