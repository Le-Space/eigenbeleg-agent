// SPDX-License-Identifier: AGPL-3.0-or-later
// Doichain as a building block: Eigenbelege and a Kontoauszug for an own DOI
// address, read from an ElectrumX server in memory. DOI is quoted nowhere that
// may be used, so its euro value is the request's own reference value, or
// the block's default (0.04 EUR per DOI), named as such. Addresses, transactions and amounts are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as doichain from '@le-space/chains/doichain';
import { coinbase, fakeDoichain, fakeDoichainAddress, payment } from '@le-space/chains/testing/doichain';

import { BLOCKS, REFERENCE_DEFAULT_BY, RequestError, dataSources, describeBlocks, generate, parseRequest } from '../src/index.js';

const own = fakeDoichainAddress('own');
const shop = fakeDoichainAddress('a shop');
// Height 100 is 2026-05-28 (UTC) in the fake's clock, height 300 the 30th.
const fake = fakeDoichain({
	txs: [
		coinbase('mined', 100, own, 10),
		payment('paid the shop', 300, [['mined', 0]], [{ address: shop, value: 2 }, { address: own, value: 7.99 }])
	]
});
/** The block as it is, reading the fake's chain. */
const blocks = { doichain: { ...BLOCKS.doichain, read: (/** @type {any} */ p) => doichain.readDoichain({ ...p, chain: fake.chain }), statement: (/** @type {any} */ p) => doichain.statementDoichain({ ...p, chain: fake.chain }) } };
/** A price feed that must never be asked for DOI. */
const feed = { rateFor: async (/** @type {string} */ asset) => assert.fail(`a price feed was asked for ${asset}`) };
const deps = { blocks, connect: fake.connect, rates: feed, now: () => new Date('2026-11-06T10:00:00Z') };
const body = {
	chain: 'doichain',
	addresses: [own],
	period: { from: '2026-05-01', to: '2026-06-30' },
	format: 'json',
	document: 'beide',
	includeKinds: ['fee', 'transfer'],
	payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' }
};

test('the block: DOI on mainnet, fee and transfer, read from ElectrumX, its servers among the data sources', () => {
	const [b] = describeBlocks({ doichain: BLOCKS.doichain });
	assert.deepEqual([b.chain, b.networks, b.assets, b.kinds, b.referenceAssets, b.referenceDefault], ['doichain', ['mainnet'], ['DOI'], ['fee', 'transfer'], ['DOI'], { DOI: '0.04' }]);
	assert.ok(BLOCKS.doichain.isAddress(own) && !BLOCKS.doichain.isAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'));
	const servers = dataSources().filter((s) => s.chain === 'doichain');
	assert.equal(servers.length, 4);
	assert.ok(servers.every((s) => /^wss:\/\/[a-z0-9-]+\.doi\.works:50004$/.test(s.origin) && s.learns === 'addresses'));
});

test('with the issuer\'s reference value: Eigenbelege and a Kontoauszug in DOI and EUR, named as a reference value', async () => {
	const job = parseRequest({ ...body, reference: { DOI: { eur: '0.05', from: '2026-01-01' } } }, { blocks, today: '2026-11-06' });
	assert.deepEqual(job.reference, { DOI: [{ from: '2026-01-01', eur: '0.05', by: 'Wolkenfabrik Hosting GmbH' }] });
	const out = await generate(job, deps);
	// the payment to the shop and its miner fee; the mined coins came in and are on the statement
	assert.deepEqual([out.summary.positions, out.summary.totalEur, out.summary.quantities], [2, '0.1', { DOI: '2.01' }]);
	assert.match(out.csv, /Referenzwert von Wolkenfabrik Hosting GmbH, Stand 2026-01-01 \(kein Börsenkurs\)/);
	assert.match(out.csv, /DOI/);
	const [statement] = out.summary.kontoauszuege;
	const doi = statement.assets.find((/** @type {any} */ a) => a.asset === 'DOI');
	assert.deepEqual([doi.opening, doi.closing, doi.reconciled], ['0', '7.99', true]);
	assert.ok(out.pdf && out.statements[0].pdf);
});

test('without a reference value: the default 0.04 EUR per DOI, named as the default, and no price feed is asked', async () => {
	const job = parseRequest(body, { blocks, today: '2026-11-06' });
	assert.deepEqual(job.reference, { DOI: [{ from: '2026-05-01', eur: '0.04', by: REFERENCE_DEFAULT_BY }] });
	const out = await generate(job, deps);
	assert.equal(out.summary.positions, 2);
	assert.match(out.csv, /Referenzwert von eigenbeleg-agent \(Standardwert\), Stand 2026-05-01 \(kein Börsenkurs\)/);
	assert.ok(!/CoinGecko|Kraken/.test(out.csv));
	assert.ok(out.pdf && out.statements[0].pdf);
	const doi = out.summary.kontoauszuege[0].assets.find((/** @type {any} */ a) => a.asset === 'DOI');
	assert.equal(doi.closing, '7.99');
	// the issuer's own value wins over the default
	assert.equal(parseRequest({ ...body, reference: { DOI: { eur: '0.05', from: '2026-01-01' } } }, { blocks, today: '2026-11-06' }).reference.DOI[0].eur, '0.05');
});

test('a block with no default and no value: the Kontoauszug in DOI alone, no Eigenbeleg', async () => {
	const bare = { doichain: { ...blocks.doichain, referenceDefault: undefined } };
	assert.throws(() => parseRequest(body, { blocks: bare, today: '2026-11-06' }), (e) => e instanceof RequestError && /DOI has no published rate, and an Eigenbeleg needs a euro value.*"document": "kontoauszug"/.test(e.message));
	const out = await generate(parseRequest({ ...body, document: 'kontoauszug' }, { blocks: bare, today: '2026-11-06' }), { ...deps, blocks: bare });
	assert.equal(out.summary.positions, 0);
	assert.ok(out.statements[0].pdf);
	assert.ok(!out.csv.includes('Referenzwert'));
	assert.ok(!/CoinGecko|Kraken/.test(out.csv));
});

test('a reference value is the issuer\'s figure for DOI, and nothing else', () => {
	const parse = (/** @type {any} */ reference, chain = 'doichain') => parseRequest({ ...body, chain, reference }, { blocks: { ...BLOCKS, ...blocks }, today: '2026-11-06' });
	assert.equal(parse([{ eur: '0.04', from: '2026-01-01' }].reduce((o, l) => ({ ...o, DOI: [l, { eur: '0.05', from: '2026-06-01' }] }), {})).reference.DOI.length, 2);
	for (const [bad, why] of /** @type {[any, RegExp][]} */ ([
		[{ DOI: { eur: 0.05, from: '2026-01-01' } }, /eur is a positive decimal string/],
		[{ DOI: { eur: '0', from: '2026-01-01' } }, /positive decimal/],
		[{ DOI: { eur: '0,05', from: '2026-01-01' } }, /positive decimal/],
		[{ DOI: { eur: '0.05', from: 'January' } }, /from is the day/],
		[{ NEAR: { eur: '2', from: '2026-01-01' } }, /takes a reference value for DOI, not for NEAR/],
		[{ DOI: [] }, /one to twelve/],
		['0.05', /an object like/]
	])) assert.throws(() => parse(bad), (e) => e instanceof RequestError && why.test(e.message));
	// a chain with price sources takes none: its rates stay the published ones
	assert.throws(() => parseRequest({ ...body, chain: 'near', addresses: ['wolkenfabrik.near'], includeKinds: ['fee'], reference: { NEAR: { eur: '2', from: '2026-01-01' } } }, { today: '2026-11-06' }), /near takes a reference value for no asset/);
	// the preview names nobody as the one who set it
	const { payer: _payer, ...unpaid } = body;
	assert.equal(parseRequest({ ...unpaid, reference: { DOI: { eur: '0.05', from: '2026-01-01' } } }, { preview: true, blocks, today: '2026-11-06' }).reference.DOI[0].by, '');
});

test('in another currency: the reference value in EUR times the euro in it on the day, both named; no price feed asked', async () => {
	/** @type {string[]} */
	const days = [];
	// Made up: 0.9312 CHF per euro, the ECB's of the day before.
	const perEuro = async (/** @type {string} */ date) => (days.push(date), { currency: 'CHF', perEur: '0.9312', source: 'ecb', at: '2026-05-27T00:00:00Z' });
	const job = parseRequest({ ...body, currency: 'CHF', reference: { DOI: { eur: '0.05', from: '2026-01-01' } } }, { blocks, today: '2026-11-06' });
	const out = await generate(job, { ...deps, rates: { ...feed, perEuro } });
	// 2.01 DOI × 0.05 EUR × 0.9312 = 0.0935856 CHF
	assert.deepEqual([out.summary.currency, out.summary.positions, out.summary.totalEur], ['CHF', 2, '0.09']);
	assert.ok(days.includes('2026-05-30'), 'the leg of the payment\'s day');
	const lines = out.csv.trimEnd().split('\r\n');
	assert.match(lines[0], /;Kurs CHF;Wert CHF/);
	assert.match(lines[1], /Referenzwert von Wolkenfabrik Hosting GmbH, Stand 2026-01-01 \(kein Börsenkurs\) × EZB-Referenzkurs EUR\/CHF vom 2026-05-27/);
	assert.match(lines[1], /;0,04656;/);
	// No leg into the currency on the day: no value, so no position, as on a day without a rate.
	const none = await generate(job, { ...deps, rates: { ...feed, perEuro: async () => null } });
	assert.deepEqual([none.summary.positions, none.summary.notOnIt > 0], [0, true]);
});
