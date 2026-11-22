// SPDX-License-Identifier: AGPL-3.0-or-later
// Bitcoin as a building block: Eigenbelege and a Kontoauszug for an own
// address, read from an Esplora API in memory, valued at the day's BTC rate.
// Addresses, transactions, amounts and the rate are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { btcTx, fakeBitcoinAddress, fakeEsplora } from '@le-space/chains/testing/bitcoin';
import { fakeDoichainAddress } from '@le-space/chains/testing/doichain';

import { BLOCKS, RequestError, dataSources, describeBlocks, generate, parseRequest } from '../src/index.js';

const own = fakeBitcoinAddress('own');
const shop = fakeBitcoinAddress('a shop', 'p2sh');
const customer = fakeBitcoinAddress('a customer', 'p2pkh');
// Height 100 is 2026-05-28 (UTC) in the fake's clock, height 300 the 30th.
const api = fakeEsplora({
	txs: [
		btcTx('customer pays', 100, [[customer, 300_000]], [[own, 200_000], [customer, 99_000]]),
		btcTx('paid the shop', 300, [[own, 200_000]], [[shop, 100_000], [own, 98_000]])
	]
});
/** A made-up rate: 50 000 EUR per BTC on every day. */
const rates = { rateFor: async (/** @type {string} */ asset, /** @type {string} */ date) => (asset === 'BTC' ? { rate: '50000', source: `Testkurs ${date}`, date } : null) };
const deps = { fetch: api.fetch, endpoints: { bitcoin: { api: api.url } }, rates, now: () => new Date('2026-11-06T10:00:00Z') };
const body = {
	chain: 'bitcoin',
	addresses: [own],
	period: { from: '2026-05-01', to: '2026-06-30' },
	format: 'json',
	document: 'beide',
	includeKinds: ['fee', 'transfer'],
	payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' }
};

test('the block: BTC on mainnet, fee and transfer, by address, mempool.space among the data sources', () => {
	const [b] = describeBlocks({ bitcoin: BLOCKS.bitcoin });
	assert.deepEqual([b.chain, b.networks, b.assets, b.kinds], ['bitcoin', ['mainnet'], ['BTC'], ['fee', 'transfer']]);
	assert.equal(BLOCKS.bitcoin.referenceAssets, undefined);
	assert.ok(BLOCKS.bitcoin.isAddress(own) && BLOCKS.bitcoin.isAddress(shop));
	assert.ok(!BLOCKS.bitcoin.isAddress(fakeDoichainAddress('own')));
	// an extended key is no address: the API takes none
	assert.ok(!BLOCKS.bitcoin.isAddress('zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'));
	const sources = dataSources().filter((s) => s.chain === 'bitcoin');
	assert.deepEqual(sources.map((s) => [s.origin, s.learns]), [['https://mempool.space', 'addresses']]);
});

test('Eigenbelege and a Kontoauszug at the day\'s rate: the payment, its miner fee, the balance reconciled', async () => {
	const out = await generate(parseRequest(body, { today: '2026-11-06' }), deps);
	// 0.001 BTC to the shop and 0.00002 fee, at 50 000 EUR: 50 + 1 EUR
	assert.deepEqual([out.summary.positions, out.summary.totalEur, out.summary.quantities], [2, '51', { BTC: '0.00102' }]);
	assert.match(out.csv, /Bitcoin-Netzwerk \(Miner-Gebühr\)/);
	assert.match(out.csv, /Testkurs 2026-05-30/);
	const btc = out.summary.kontoauszuege[0].assets.find((/** @type {any} */ a) => a.asset === 'BTC');
	assert.deepEqual([btc.opening, btc.closing, btc.reconciled], ['0', '0.00098', true]);
	assert.ok(out.pdf && out.statements[0].pdf);
	assert.ok(api.calls.every((c) => c.startsWith(api.url)));
});

test('a Doichain address or an xpub is refused before anything is asked', () => {
	for (const bad of [fakeDoichainAddress('own'), 'xpub-not-an-address'])
		assert.throws(() => parseRequest({ ...body, addresses: [bad] }, { today: '2026-11-06' }), (e) => e instanceof RequestError);
	assert.throws(() => parseRequest({ ...body, reference: { BTC: { eur: '1', from: '2026-01-01' } } }, { today: '2026-11-06' }), /bitcoin takes a reference value for no asset/);
});
