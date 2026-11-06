import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { entry } from '@eigenbeleg/ledger-core';
import { createRates, fixedRates, valueEntries } from '../src/index.js';

const kraken = await readFile(new URL('./fixtures/kraken-NEAREUR-2026-10.json', import.meta.url), 'utf8');

test('the day VWAP from Kraken (real public market data), named with its source', async () => {
	const calls = [];
	const rates = createRates({
		fetch: async (url) => {
			calls.push(url);
			return new Response(kraken, { status: 200 });
		}
	});
	const r = await rates.rateFor('NEAR', '2026-10-05');
	const row = JSON.parse(kraken).result.NEAREUR.find((x) => new Date(x[0] * 1000).toISOString().startsWith('2026-10-05'));
	assert.equal(r?.rate, row[5]);
	assert.match(r?.source ?? '', /^Kraken NEAREUR, Tagesdurchschnitt \(VWAP\) 2026-10-05 UTC$/);
	await rates.rateFor('NEAR', '2026-10-06');
	assert.equal(calls.length, 1, 'one month is fetched once');
});

test('CoinGecko steps in where Kraken has no day', async () => {
	const rates = createRates({
		fetch: async (url) =>
			String(url).includes('kraken')
				? new Response(JSON.stringify({ error: [], result: { NEAREUR: [], last: 0 } }))
				: new Response(JSON.stringify({ market_data: { current_price: { eur: 2.5 } } }))
	});
	const r = await rates.rateFor('NEAR', '2023-01-15');
	assert.equal(r?.rate, '2.5');
	assert.match(r?.source ?? '', /CoinGecko near\/EUR, Kurs 2023-01-15/);
});

test('entries are valued; unpriced and failed ones are not', async () => {
	const base = { chain: 'near', network: 'testnet', account: 'wolkenfabrik.testnet', hash: 'H', height: 1, time: '2026-10-05T10:00:00Z', contract: 'native', decimals: 24, counterparty: 'near', counterpartyLabel: '', method: '', memo: '', explorerUrl: '' };
	const v = await valueEntries(
		[
			entry({ ...base, id: 'a', type: 'fee', kind: 'fee', asset: 'NEAR', priceAs: 'NEAR', amount: '-0.000446365125', success: true }),
			entry({ ...base, id: 'b', type: 'received', kind: 'transfer', asset: 'SPAM', priceAs: '', amount: '100', success: true })
		],
		fixedRates({ NEAR: '3.8' })
	);
	assert.deepEqual(v[0].eur, { value: '-0.00169619', rate: '3.8', source: 'fester Testkurs (NEAR)' });
	assert.equal(v[1].eur, null);
});
