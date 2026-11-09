// SPDX-License-Identifier: AGPL-3.0-or-later
// The day's rate from @le-space/rates, named for the document.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayRates } from '../src/rates.js';

const DAY = '2026-10-05';
const midnight = Date.parse(`${DAY}T00:00:00Z`) / 1000;

/** A CoinGecko history answer and a Kraken OHLC answer, made up. @param {string[]} asked */
const fakeFetch = (asked) =>
	/** @type {typeof fetch} */ (
		async (/** @type {any} */ url) => {
			const u = String(url);
			asked.push(u);
			if (u.startsWith('https://api.coingecko.com/api/v3/coins/akash-network/history')) return Response.json({ market_data: { current_price: { eur: 3.5, usd: 4.1 } } });
			if (u.startsWith('https://api.coingecko.com/')) return new Response('{}', { status: 404 });
			if (u.startsWith('https://api.kraken.com/0/public/OHLC?pair=NEAREUR')) {
				// [time, open, high, low, close, vwap, volume, count], one candle per day
				const rows = [-2, -1, 0, 1].map((d) => [midnight + d * 86400, d === 0 ? '1.92' : '1.80', '2', '1.7', '1.9', '1.88', '100', 10]);
				return Response.json({ error: [], result: { NEAREUR: rows, last: midnight + 86400 } });
			}
			return new Response('{}', { status: 404 });
		}
	);

test('CoinGecko’s price at 00:00 UTC, named with its source and moment', async () => {
	/** @type {string[]} */
	const asked = [];
	const rates = dayRates({ fetch: fakeFetch(asked), now: () => new Date('2026-10-08T12:00:00Z') });
	assert.deepEqual(await rates.rateFor('AKT', DAY), { rate: '3.5', source: `CoinGecko, Kurs ${DAY} 00:00 UTC`, date: DAY });
	await rates.rateFor('AKT', DAY);
	assert.equal(asked.filter((u) => u.includes('akash-network')).length, 1, 'asked once per asset and day');
});

test('where CoinGecko has no rate (NEAR here), Kraken’s daily open', async () => {
	/** @type {string[]} */
	const asked = [];
	const rates = dayRates({ fetch: fakeFetch(asked), now: () => new Date('2026-10-08T12:00:00Z') });
	assert.deepEqual(await rates.rateFor('NEAR', DAY), { rate: '1.92', source: `Kraken, Kurs ${DAY} 00:00 UTC`, date: DAY });
	assert.ok(asked.some((u) => u.includes('OHLC?pair=NEAREUR')));
});

test('no rate is null, not an error; the entries stay unvalued', async () => {
	const rates = dayRates({ fetch: fakeFetch([]), now: () => new Date('2026-10-08T12:00:00Z') });
	assert.equal(await rates.rateFor('FIL', DAY), null);
	assert.equal(await rates.rateFor('NOSUCH', DAY), null);
});
