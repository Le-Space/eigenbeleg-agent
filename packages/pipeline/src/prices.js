// SPDX-License-Identifier: AGPL-3.0-or-later
// The published prices of the API, in USDC: one list for the 402, /llms.txt,
// GET / and the web page. A production build charges exactly these
// (apps/api/src/paywall.js); changing a price is a change here, so the page
// and the API change in the same commit.
//
// The price depends on the document a request asks for (`document`): the
// Eigenbelege or the Kontoauszug; both ("beide") cost the sum.

/** The documents with a price of their own; "beide" is both and costs the sum. */
export const DOCUMENTS = Object.freeze(/** @type {const} */ (['eigenbelege', 'kontoauszug']));

/** @typedef {'eigenbelege' | 'kontoauszug' | 'beide'} Document */

/**
 * What a request's body asks for: its `document`, else the route's default
 * (POST /eigenbeleg: eigenbelege; the subscription: kontoauszug).
 * @param {unknown} body
 * @param {Document} [fallback]
 * @returns {Document}
 */
export function documentOf(body, fallback = 'eigenbelege') {
	const d = body && typeof body === 'object' ? /** @type {any} */ (body).document : undefined;
	return d === 'eigenbelege' || d === 'kontoauszug' || d === 'beide' ? d : fallback;
}

/** Price of one request (POST /eigenbeleg) per document and payment network; `default` for the others. */
export const PRICES = Object.freeze({
	eigenbelege: Object.freeze({
		// The relayer's gas for one USDC transfer: about $0.001 on NEAR and on Base (Nov 2026).
		default: '$0.005',
		// Ethereum's gas costs the relayer far more: about $0.01 at 0.06 gwei; $0.10 covers up to about 0.7 gwei.
		'eip155:1': '$0.10'
	}),
	kontoauszug: Object.freeze({
		default: '$0.10',
		'eip155:1': '$1.00'
	})
});

/**
 * Published prices of one request in a chain's own coin, per document and by the network's id in
 * @eigenbeleg/onchain-pay, as a decimal of the coin. A production build charges exactly these
 * (apps/api/src/release.js), and offers the payment only where the instance names an address
 * to receive it (DOI_PAY_TO).
 */
export const COIN_PRICES = Object.freeze({
	eigenbelege: Object.freeze({ doichain: '0.25' }),
	kontoauszug: Object.freeze({ doichain: '5' })
});

/** Adds decimals exactly: "5" + "0.25" → "5.25". @param {string[]} parts */
function sum(parts) {
	const places = Math.max(...parts.map((p) => (p.split('.')[1] ?? '').length));
	const total = parts.reduce((t, p) => {
		const [w, f = ''] = p.split('.');
		return t + BigInt(w + f.padEnd(places, '0'));
	}, 0n);
	if (!places) return total.toString();
	const s = total.toString().padStart(places + 1, '0');
	return `${s.slice(0, -places)}.${s.slice(-places)}`.replace(/\.?0+$/, '');
}

/**
 * @param {string} id e.g. doichain
 * @param {Document} [document]
 * @returns {string | undefined}
 */
export function coinPriceFor(id, document = 'eigenbelege') {
	if (document === 'beide') {
		const parts = DOCUMENTS.map((d) => coinPriceFor(id, d));
		return parts.every((p) => p !== undefined) ? sum(/** @type {string[]} */ (parts)) : undefined;
	}
	/** @type {Record<string, string> | undefined} */
	const list = COIN_PRICES[document];
	if (!list) throw new Error(`document ${document}: eigenbelege, kontoauszug or beide`);
	return Object.hasOwn(list, id) ? list[id] : undefined;
}

/** Months in a subscription bought on the plain route (POST /eigenbeleg/subscribe). */
export const SUBSCRIPTION_MONTHS = 12;

/**
 * @param {string} network e.g. near:mainnet
 * @param {Document} [document]
 * @returns {string} e.g. "$0.005"
 */
export function priceFor(network, document = 'eigenbelege') {
	if (document === 'beide') return dollars(DOCUMENTS.reduce((t, d) => t + unitsOf(priceFor(network, d)), 0));
	/** @type {Record<string, string> | undefined} */
	const list = PRICES[document];
	if (!list) throw new Error(`document ${document}: eigenbelege, kontoauszug or beide`);
	return list[network] ?? list.default;
}

/**
 * A price per document: { eigenbelege, kontoauszug, beide }.
 * @template T
 * @param {(d: Document) => T} f
 * @returns {{ eigenbelege: T, kontoauszug: T, beide: T }}
 */
export const perDocument = (f) => ({ eigenbelege: f('eigenbelege'), kontoauszug: f('kontoauszug'), beide: f('beide') });

/**
 * The prices per document as one phrase: "0.25 DOI for eigenbelege, 5 DOI for kontoauszug, 5.25 DOI
 * for beide"; one price where every document costs the same.
 * @param {{ eigenbelege: string, kontoauszug: string, beide: string }} prices
 */
export function byDocument(prices) {
	if (prices.eigenbelege === prices.kontoauszug && prices.kontoauszug === prices.beide) return prices.eigenbelege;
	return `${prices.eigenbelege} for eigenbelege, ${prices.kontoauszug} for kontoauszug, ${prices.beide} for beide`;
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
	return dollars(unitsOf(price) * months);
}

/** "$0.005" → 5000. @param {string} price */
function unitsOf(price) {
	const n = Number(price.replace(/^\$/, ''));
	if (!Number.isFinite(n) || n < 0) throw new Error(`price ${price}: a USDC amount like $0.005`);
	const units = Math.round(n * UNITS);
	if (Math.abs(units - n * UNITS) > 1e-6) throw new Error(`price ${price}: USDC has 6 decimals`);
	return units;
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
