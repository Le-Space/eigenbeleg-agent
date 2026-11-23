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

// A wallet from a made-up seed (the 64 bytes 255, 254, …): its zpub, and an address of each branch.
const { HDKey } = await import('@scure/bip32');
const { deriveAddress, keyFingerprint, parseExtendedKey } = await import('@le-space/chains/bitcoin');
const zpub = HDKey.fromMasterSeed(Uint8Array.from({ length: 64 }, (_, i) => 255 - i), { private: 0x04b2430c, public: 0x04b24746 }).derive("m/84'/0'/0'").publicExtendedKey;
const wallet = parseExtendedKey(zpub);
const receive1 = deriveAddress(wallet.account, wallet.type, 0, 1);
const change0 = deriveAddress(wallet.account, wallet.type, 1, 0);

test('a wallet by its zpub on the web UI and the CLI: one Kontoauszug, named by the key\'s fingerprint, the key never asked nor printed', async () => {
	const walletApi = fakeEsplora({
		txs: [
			btcTx('customer pays the wallet', 100, [[customer, 300_000]], [[receive1, 200_000]]),
			btcTx('wallet pays the shop', 300, [[receive1, 200_000]], [[shop, 100_000], [change0, 98_000]])
		]
	});
	const req = parseRequest({ ...body, addresses: [zpub] }, { today: '2026-11-06', keys: true });
	const out = await generate(req, { ...deps, fetch: walletApi.fetch, endpoints: { bitcoin: { api: walletApi.url } } });
	assert.deepEqual([out.summary.positions, out.summary.totalEur], [2, '51']);
	const [k] = out.summary.kontoauszuege;
	assert.equal(k.account, keyFingerprint(zpub));
	const btc = k.assets.find((/** @type {any} */ a) => a.asset === 'BTC');
	assert.deepEqual([btc.opening, btc.closing, btc.reconciled], ['0', '0.00098', true]);
	assert.ok(!out.csv.includes(zpub) && !JSON.stringify(out.summary).includes(zpub));
	assert.ok(walletApi.calls.every((c) => !c.includes(zpub)));
	// the change back to the wallet is no booking
	assert.ok(!out.csv.includes(change0));
	assert.ok(out.statements[0].pdf.length > 1000);
	// read from an Esplora of one's own: the documents name it (@le-space/eigenbeleg draws it in the footer)
	assert.equal(BLOCKS.bitcoin.dataSource?.({ api: walletApi.url }), 'Esplora-API von esplora.example.com');
	assert.equal(BLOCKS.bitcoin.dataSource?.({}), undefined);
});

test('the API takes no extended key; an xpub needs its address type', () => {
	assert.throws(() => parseRequest({ ...body, addresses: [zpub] }, { today: '2026-11-06' }), /zpub…\) is read on the web UI or with the CLI/);
	assert.throws(() => parseRequest({ ...body, addresses: [zpub] }, { today: '2026-11-06' }), (e) => !String(e.message).includes(zpub));
	const xpub = HDKey.fromMasterSeed(Uint8Array.from({ length: 64 }, (_, i) => i)).derive("m/44'/0'/0'").publicExtendedKey;
	assert.throws(() => parseRequest({ ...body, addresses: [xpub] }, { today: '2026-11-06', keys: true }), /an xpub needs addressType/);
	assert.equal(parseRequest({ ...body, addresses: [xpub], addressType: 'p2pkh' }, { today: '2026-11-06', keys: true }).addressType, 'p2pkh');
	assert.throws(() => parseRequest({ ...body, addresses: [xpub], addressType: 'taproot' }, { today: '2026-11-06', keys: true }), /addressType: p2wpkh/);
});
