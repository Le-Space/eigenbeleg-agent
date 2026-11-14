// SPDX-License-Identifier: AGPL-3.0-or-later
// The published prices of the API, in USDC: one list for the 402, /llms.txt,
// GET / and the web page. A production build charges exactly these
// (apps/api/src/paywall.js); changing a price is a change here, so the page
// and the API change in the same commit.

/** Price of one request (POST /eigenbeleg) per payment network; `default` for the others. */
export const PRICES = Object.freeze({
	default: '$0.10',
	// Ethereum's gas for one USDC transfer costs the relayer far more than Base's or NEAR's.
	'eip155:1': '$1.00'
});

/** Months in a subscription bought on the plain route (POST /eigenbeleg/subscribe). */
export const SUBSCRIPTION_MONTHS = 12;

/** @param {string} network e.g. near:mainnet */
export function priceFor(network) {
	return /** @type {Record<string, string>} */ (PRICES)[network] ?? PRICES.default;
}

/**
 * The price of `months` months of the subscription: months × the price of one request.
 * @param {string} price e.g. "$0.10"
 * @param {number} [months]
 */
export function timesMonths(price, months = SUBSCRIPTION_MONTHS) {
	const n = Number(price.replace(/^\$/, ''));
	if (!Number.isFinite(n) || n < 0) throw new Error(`price ${price}: a USDC amount like $0.10`);
	return `$${(n * months).toFixed(2)}`;
}

/**
 * "$0.10" as the page writes it: "0,10 USDC" in German, "0.10 USDC" in English.
 * @param {string} price
 * @param {'de' | 'en'} lang
 */
export function usdc(price, lang) {
	const n = price.replace(/^\$/, '');
	return `${lang === 'de' ? n.replace('.', ',') : n} USDC`;
}

/** The prices include German VAT at this rate (Le Space UG is taxed at the standard rate). */
export const VAT = 19;

/**
 * The ECB reference rate the page's euro guide uses: US dollars per euro on that day. USDC is
 * pegged to the US dollar, so the euro amount is a guide only; update it with the prices.
 */
export const USD_PER_EUR = Object.freeze({ rate: 1.1052, date: '2026-11-13' });

/**
 * "$0.10" as a euro guide: "rund 0,09 €" / "about €0.09".
 * @param {string} price
 * @param {'de' | 'en'} lang
 */
export function eurGuide(price, lang) {
	const eur = (Number(price.replace(/^\$/, '')) / USD_PER_EUR.rate).toFixed(2);
	return lang === 'de' ? `rund ${eur.replace('.', ',')} €` : `about €${eur}`;
}
