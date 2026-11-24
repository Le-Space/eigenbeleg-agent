// SPDX-License-Identifier: AGPL-3.0-or-later
// The published prices of the API, in USDC: one list for the 402, /llms.txt,
// GET / and the web page. A production build charges exactly these
// (apps/api/src/paywall.js); changing a price is a change here, so the page
// and the API change in the same commit.

/** Price of one request (POST /eigenbeleg) per payment network; `default` for the others. */
export const PRICES = Object.freeze({
	// The relayer's gas for one USDC transfer: about $0.001 on NEAR and on Base (Nov 2026).
	default: '$0.005',
	// Ethereum's gas costs the relayer far more: about $0.01 at 0.06 gwei; $0.10 covers up to about 0.7 gwei.
	'eip155:1': '$0.10'
});

/**
 * Published prices of one request in a chain's own coin, by the network's id in
 * @eigenbeleg/onchain-pay, as a decimal of the coin. A production build charges exactly these
 * (apps/api/src/release.js), and offers the payment only where the instance names an address
 * to receive it (DOI_PAY_TO).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const COIN_PRICES = Object.freeze({ doichain: '0.25' });

/** @param {string} id e.g. doichain @returns {string | undefined} */
export function coinPriceFor(id) {
	return Object.hasOwn(COIN_PRICES, id) ? COIN_PRICES[id] : undefined;
}

/** Months in a subscription bought on the plain route (POST /eigenbeleg/subscribe). */
export const SUBSCRIPTION_MONTHS = 12;

/** @param {string} network e.g. near:mainnet */
export function priceFor(network) {
	return /** @type {Record<string, string>} */ (PRICES)[network] ?? PRICES.default;
}

/** USDC has 6 decimals: a price is a whole number of these units. */
const UNITS = 1_000_000;

/**
 * A USDC amount as a string: at least 2 decimals, more where the amount has them ("$0.10", "$0.005").
 * @param {number} units millionths of a USDC
 */
function dollars(units) {
	const [whole, frac = ''] = (units / UNITS).toFixed(6).replace(/0+$/, '').split('.');
	return `$${whole}.${frac.padEnd(2, '0')}`;
}

/**
 * The price of `months` months of the subscription: months × the price of one request,
 * reckoned in whole USDC units, so "$0.005" for one month stays "$0.005" and is never rounded to a cent.
 * @param {string} price e.g. "$0.005"
 * @param {number} [months]
 */
export function timesMonths(price, months = SUBSCRIPTION_MONTHS) {
	const n = Number(price.replace(/^\$/, ''));
	if (!Number.isFinite(n) || n < 0) throw new Error(`price ${price}: a USDC amount like $0.005`);
	const units = Math.round(n * UNITS);
	if (Math.abs(units - n * UNITS) > 1e-6) throw new Error(`price ${price}: USDC has 6 decimals`);
	return dollars(units * months);
}

/**
 * "$0.005" as the page writes it: "0,005 USDC" in German, "0.005 USDC" in English.
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
export const USD_PER_EUR = Object.freeze({ rate: 1.0939, date: '2026-11-23' });

/**
 * "$0.10" as a euro guide: "rund 0,09 €" / "about €0.09"; below a cent with three decimals,
 * "$0.005" → "rund 0,005 €" / "about €0.005", never "0,00 €".
 * @param {string} price
 * @param {'de' | 'en'} lang
 */
export function eurGuide(price, lang) {
	const n = Number(price.replace(/^\$/, '')) / USD_PER_EUR.rate;
	const eur = n.toFixed(n < 0.01 ? 3 : 2);
	return lang === 'de' ? `rund ${eur.replace('.', ',')} €` : `about €${eur}`;
}
