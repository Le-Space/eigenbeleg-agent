// SPDX-License-Identifier: AGPL-3.0-or-later
// The rate of a payment's day, from @le-space/rates (shared with Le Space
// Belege): the euro price at 00:00 UTC of the day – CoinGecko's daily
// snapshot, else Kraken's daily open (NEAR and USDT too, both are in
// RATE_SOURCES); for USD (Aleph credits are priced in it) the ECB reference
// rate. A document in another currency (`currency`, DOCUMENT_CURRENCIES of
// @le-space/eigenbeleg) gets that euro rate times the currency's units per
// euro of the day: the ECB reference rate, for RUB the Bank of Russia's
// official rate – USD too, like every currency: only the crypto leg is
// CoinGecko's or Kraken's. A reference value set by hand in EUR (DOI) goes the
// same way, times the euro in the currency of its day. The Eigenbeleg names
// both legs with source and day, so a bookkeeper can look each up again.
//
// A token not in the chain's list (Ethereum, Base: #93) has no market asset:
// it is valued by its contract only – CoinGecko's price for that contract, else
// the deepest Uniswap pool against ETH or USDC at the booking's block (through
// Alchemy, with the key the EVM blocks read with), times that quote's rate of
// the day. Its symbol is the token's own claim and never asked for.
//
// No storage: rates are cached in memory for one run.

import { RateError, createDexRates, createRateService, multiplyRates } from '@le-space/rates';
import { withReferenceRates } from '@le-space/rates/reference-rate';

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
	// `… vom <day>`: the documents name each leg without its day in the Kursquelle (@le-space/eigenbeleg sourceName).
	cbr: (fx) => `amtlicher Kurs EUR/${fx.currency} der Bank von Russland vom ${String(fx.at).slice(0, 10)}`
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
	return r.fx ? `${leg(date, r)} × ${fxText(r.fx)}` : leg(date, r);
}

/**
 * What a token's rate by its contract is called on the document: CoinGecko's price for the contract, or the
 * Uniswap pool at the block, and the leg into the document's currency where there is one. The contract is
 * named: the symbol is the token's own claim.
 *
 * @param {string} date YYYY-MM-DD
 * @param {string} contract 0x + 40 hex, lower case
 * @param {{ source: string, at: string, ref?: string, fx?: { currency: string, source: string, at: string } }} r
 */
export function tokenSourceText(date, contract, r) {
	// `uniswap-v3:<pool>@<block>`; a V4 pool by its id.
	const pool = /^uniswap-v(\d):([^@]+)@(\d+)$/.exec(r.ref ?? '');
	const leg =
		r.source === 'dex' && pool
			? `Uniswap v${pool[1]}, Pool ${pool[2]} bei Block ${pool[3]}, gegen den Tageskurs ${date} 00:00 UTC (Token-Vertrag ${contract})`
			: `${r.source === 'coingecko' ? 'CoinGecko' : r.source}, Kurs ${date} 00:00 UTC (Token-Vertrag ${contract})`;
	return r.fx ? `${leg} × ${fxText(r.fx)}` : leg;
}

/** The leg from the euro into the document's currency, as named on it. @param {{ currency: string, source: string, at: string }} fx */
export function fxText(fx) {
	const text = FX_TEXT[fx.source] ?? ((/** @type {{ currency: string, at: string }} */ f) => `${fx.source} EUR/${f.currency} vom ${String(f.at).slice(0, 10)}`);
	return text(fx);
}

/**
 * @param {object} [o]
 * @param {typeof fetch} [o.fetch]
 * @param {string} [o.coingeckoKey] a CoinGecko demo key, optional
 * @param {() => Date} [o.now] for tests
 * @param {string} [o.currency] the document's currency (DOCUMENT_CURRENCIES of @le-space/eigenbeleg), EUR when not given
 * @param {string} [o.alchemyKey] the EVM blocks' key: a token not in the list is then priced by its Uniswap pool at
 *   the block where CoinGecko has none (#93); without it by CoinGecko only
 * @returns {import('@le-space/eigenbeleg').Rates & { tokenRateFor: NonNullable<import('@le-space/eigenbeleg').Rates['tokenRateFor']>, perEuro: (date: string) => Promise<{ currency: string, perEur: string, source: string, at: string } | null> }}
 */
export function dayRates({ fetch = globalThis.fetch, coingeckoKey, now, currency = 'EUR', alchemyKey } = {}) {
	const dex = alchemyKey ? createDexRates({ fetch, alchemyKey: async () => alchemyKey }) : null;
	const service = createRateService({ fetch, coingeckoKey: async () => coingeckoKey ?? null, ...(now ? { now } : {}), ...(dex ? { dex } : {}) });
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

	/** @type {Map<string, Promise<{ currency: string, perEur: string, source: string, at: string } | null>>} */
	const legs = new Map();
	/**
	 * The euro in the document's currency on a day (the second leg alone), or null where none is known.
	 * @param {string} date YYYY-MM-DD (UTC)
	 */
	function perEuro(date) {
		if (!legs.has(date)) {
			legs.set(
				date,
				service.perEuro(currency, date).catch((e) => {
					if (e instanceof RateError) return null;
					throw e;
				})
			);
		}
		return /** @type {Promise<{ currency: string, perEur: string, source: string, at: string } | null>} */ (legs.get(date));
	}

	/**
	 * A token not in the chain's list, by its contract (#93): CoinGecko's price for the contract, else its
	 * Uniswap pool at the booking's block; null where neither has one.
	 *
	 * @param {{ asset: string, contract: string, chain: string, block: number, decimals: number }} token
	 * @param {string} date YYYY-MM-DD (UTC)
	 */
	function tokenRateFor(token, date) {
		const contract = token.contract.toLowerCase();
		// The pool's price is that of the block: one rate per block, CoinGecko's per day.
		const key = `${token.chain}:${contract}:${date}:${token.block}`;
		if (!cache.has(key)) {
			cache.set(
				key,
				(async () => {
					let r;
					try {
						r = await service.rate(token.asset, date, { contract, chain: token.chain, block: token.block, decimals: token.decimals, ...(currency === 'EUR' ? {} : { currency }) });
					} catch (e) {
						if (e instanceof RateError) return null;
						throw e;
					}
					return { rate: r.rate, source: tokenSourceText(date, contract, r), date, ...mark };
				})()
			);
		}
		return /** @type {Promise<import('@le-space/eigenbeleg').Rate | null>} */ (cache.get(key));
	}

	return { rateFor, tokenRateFor, perEuro };
}

/**
 * The rates with the listed assets valued by their reference tables (in EUR) and by nothing else, as
 * withReferenceRates; in another currency each reference value times the euro in it on the day, both named.
 * A day without the second leg stays unvalued, as one without a rate.
 *
 * @param {import('@le-space/eigenbeleg').Rates & { perEuro?: ReturnType<typeof dayRates>['perEuro'] }} priced the request's rates, in its currency
 * @param {Record<string, { from: string, eur: string, by?: string }[]>} tables by asset: `{ DOI: [...] }`
 * @param {string} [currency] the document's currency, EUR when not given
 * @returns {import('@le-space/eigenbeleg').Rates}
 */
export function referenceRates(priced, tables, currency = 'EUR') {
	const inEur = withReferenceRates(priced, tables);
	if (currency === 'EUR') return inEur;
	return {
		// A token by its contract is no reference asset: as the request's rates give it.
		...(priced.tokenRateFor ? { tokenRateFor: priced.tokenRateFor } : {}),
		async rateFor(asset, date) {
			if (!Object.hasOwn(tables, asset)) return priced.rateFor(asset, date);
			const r = await inEur.rateFor(asset, date);
			if (!r) return null;
			const fx = (await priced.perEuro?.(date)) ?? null;
			if (!fx) return null;
			return { rate: multiplyRates(r.rate, fx.perEur), source: `${r.source} × ${fxText(fx)}`, date, currency };
		}
	};
}
