// SPDX-License-Identifier: AGPL-3.0-or-later
// The Filecoin Pay block: a month of a payer's balance in the payment
// contract as a Verbrauchsauszug, end to end through the pipeline, offline.
// The payer, the provider and every amount are made up (Wolkenfabrik Hosting
// GmbH); the index, Blockscout and Filfox answer through @le-space/chains'
// fake. The contract's own addresses are public.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FILECOIN_PAY } from '@le-space/chains/filecoin-pay';
import { toFilecoinAddress } from '@le-space/chains/filecoin';
import { filecoinPayFetch } from '@le-space/chains/testing/filecoin-pay';
import { RequestError, describeBlocks, generate, isUsageStatement, parseRequest } from '../src/index.js';

const PAYER = `0x${'1a'.repeat(20)}`;
const PROVIDER = `0x${'a1'.repeat(20)}`;
const USDFC = FILECOIN_PAY.token.contract;
const WARM = Object.keys(FILECOIN_PAY.services)[0];
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };

/** 10 paid in in July; August: 1.2 and 0.5 settled, 1 taken out; a settlement in September. 6.6 now. */
const chain = (/** @type {{ index?: boolean, blockscout?: boolean }} */ down = {}) =>
	filecoinPayFetch({
		contract: FILECOIN_PAY.contract,
		token: USDFC,
		toFilecoin: toFilecoinAddress,
		funds: { [PAYER]: '6.6' },
		down,
		events: [
			{ at: '2026-07-01T10:00:00Z', deposit: '10', token: USDFC, from: PAYER, to: PAYER },
			{ at: '2026-07-01T10:05:00Z', rail: 7, payer: PAYER, payee: PROVIDER, token: USDFC, operator: WARM },
			{ at: '2026-08-03T09:00:00Z', settled: '1.2', railId: 7, toPayee: '1.19', commission: '0', fee: '0.01', upTo: '2026-08-03T00:00:00Z' },
			{ at: '2026-08-22T12:00:00Z', oneTime: '0.5', railId: 7 },
			{ at: '2026-08-28T12:00:00Z', withdraw: '1', token: USDFC, from: PAYER, to: PAYER },
			{ at: '2026-09-02T09:00:00Z', settled: '0.7', railId: 7, toPayee: '0.7', commission: '0', fee: '0', upTo: '2026-09-01T00:00:00Z' }
		]
	});

/** The chain's fake, and 0.8 EUR per USDC on every day (CoinGecko's shape). @param {ReturnType<typeof chain>} inner @param {string[]} asked */
const fetchWith = (inner, asked) =>
	/** @type {typeof globalThis.fetch} */ (
		async (input, init) => {
			const url = new URL(String(input));
			asked.push(url.origin);
			if (url.origin === 'https://api.coingecko.com') return Response.json({ market_data: { current_price: { eur: 0.8, usd: 1 } } });
			if (url.origin === 'https://api.kraken.com') return Response.json({ error: ['unknown'] }, { status: 200 });
			return inner(input, init);
		}
	);

test('a month of Filecoin Pay is a Verbrauchsauszug: opening, each settlement, what was taken out, closing', async () => {
	/** @type {string[]} */
	const asked = [];
	// Asked by the f410f… form: one payer, named by its 0x address.
	const req = parseRequest({ chain: 'filecoin-pay', addresses: [toFilecoinAddress(PAYER)], period: { month: '2026-08' }, format: 'json', payer }, { today: '2026-11-06' });
	assert.equal(req.document, 'kontoauszug', 'the statement is what Filecoin Pay gives');
	assert.deepEqual(req.addresses, [PAYER]);
	assert.equal(req.statementNumber, 'VA-2026-08-01');
	assert.deepEqual(req.includeKinds, []);
	const out = await generate(req, { fetch: fetchWith(chain(), asked), now: () => new Date('2026-11-06T12:00:00Z') });
	assert.equal(out.pdf, null, 'the statement was asked for: no Eigenbeleg');
	assert.equal(out.statements.length, 1);
	assert.deepEqual(out.summary.eigenbelege, []);
	const [k] = out.summary.kontoauszuege;
	const [{ monthly, ...balance }] = k.assets;
	// 10 before August; −1.2 −0.5 settled, −1 taken out.
	assert.deepEqual(balance, { asset: 'USDFC', opening: '10', closing: '7.3', reconciled: true });
	assert.equal(k.method, 'derived');
	// 1.7 USDFC × 0.8 EUR.
	assert.deepEqual(monthly.usage.map((l) => [l.label, l.amount, l.eur, l.rows]), [['Verbrauch Filecoin Warm Storage (Rail 7)', '1.7', '1.36', 2]]);
	assert.deepEqual([monthly.usageTotal.amount, monthly.usageTotal.eur, monthly.transfersOut.amount, monthly.purchases, monthly.fees], ['1.7', '1.36', '1', null, null]);
	const hosts = new Set(asked);
	assert.deepEqual([...hosts].sort(), ['https://api.coingecko.com', 'https://api.goldsky.com', 'https://filecoin.blockscout.com']);

	const lines = /** @type {string} */ (out.csv).split('\r\n');
	const settled = lines.filter((l) => l.includes('Verbrauch (aus Guthaben abgerechnet)'));
	assert.equal(settled.length, 2);
	assert.ok(settled.every((l) => l.endsWith(';nein;Verbrauch aus Guthaben: steht im Verbrauchsauszug;')), 'without the Eigenbelege, a settlement is on none');
	assert.match(settled[0], /Filecoin Warm Storage \(Rail 7\)/);
	const pdf = new TextDecoder('latin1').decode(out.statements[0].pdf);
	assert.match(pdf, /Verbrauchsauszug VA-2026-08-01/, 'the title in the metadata');
});

test('Filecoin Pay: the index down, the month comes from the contract’s events and is the same', async () => {
	/** @type {string[]} */
	const asked = [];
	const req = parseRequest({ chain: 'filecoin-pay', addresses: [PAYER], period: { month: '2026-08' }, format: 'json', payer }, { today: '2026-11-06' });
	const out = await generate(req, { fetch: fetchWith(chain({ index: true }), asked), now: () => new Date('2026-11-06T12:00:00Z') }, { preview: true });
	const [{ monthly, ...balance }] = out.summary.kontoauszuege[0].assets;
	assert.deepEqual(balance, { asset: 'USDFC', opening: '10', closing: '7.3', reconciled: true });
	assert.equal(monthly.usageTotal.amount, '1.7');
});

test('Filecoin Pay: Blockscout down, no statement – paid in by another address would be missing', async () => {
	const req = parseRequest({ chain: 'filecoin-pay', addresses: [PAYER], period: { month: '2026-08' }, format: 'json', payer }, { today: '2026-11-06' });
	await assert.rejects(generate(req, { fetch: fetchWith(chain({ blockscout: true }), []), now: () => new Date('2026-11-06T12:00:00Z') }, { preview: true }), /Blockscout did not answer.*try again/);
});

test('Filecoin Pay: the month’s settlements are the consumption Eigenbeleg, in sums per rail, the Verbrauchsauszug named (#116)', async () => {
	const req = parseRequest({ chain: 'filecoin-pay', addresses: [PAYER], period: { month: '2026-08' }, format: 'json', document: 'beide', payer }, { today: '2026-11-06' });
	const out = await generate(req, { fetch: fetchWith(chain(), []), now: () => new Date('2026-11-06T12:00:00Z') });
	assert.deepEqual(out.summary.eigenbelege, ['EB-2026-001']);
	const [c] = out.summary.consumption;
	assert.deepEqual([c.account, c.month, c.statement], [PAYER, '2026-08', 'VA-2026-08-01']);
	// The settlement and the one-off payment over rail 7: 1.7 USDFC × 0.8 EUR, as the statement sums it.
	assert.deepEqual(c.lines.map((/** @type {any} */ l) => [l.label, l.recipient, l.entries, l.quantities, l.value]), [['Filecoin Warm Storage (Rail 7)', PROVIDER, 2, { USDFC: '1.7' }, '1.36']]);
	assert.equal(c.total, '1.36');
	assert.equal(out.summary.kontoauszuege[0].assets[0].monthly.usageTotal.eur, c.total);
	assert.equal(out.summary.totalEur, '1.36');
	const lines = /** @type {string} */ (out.csv).split('\r\n');
	const settled = lines.filter((l) => l.includes('Verbrauch (aus Guthaben abgerechnet)'));
	assert.ok(settled.length === 2 && settled.every((l) => l.startsWith('EB-2026-001;1;') && l.endsWith(';ja;;')), settled.join('\n'));
	const out2 = lines.find((l) => l.includes('Auszahlung aus Filecoin Pay'));
	assert.match(out2 ?? '', /;nein;/, 'taken out of the balance: no consumption');
	assert.ok(out.pdf instanceof Uint8Array && out.pdf.length > 1000);
});

test('Filecoin Pay: whole finished months, payers only; the Eigenbeleg is the month’s consumption', () => {
	const d = describeBlocks().find((b) => b.chain === 'filecoin-pay');
	assert.deepEqual([d?.documents, d?.period, d?.statementPrefix, d?.kinds, d?.networks], [['kontoauszug', 'eigenbelege', 'beide'], 'month', 'VA', [], ['mainnet']]);
	assert.match(String(d?.consumption), /per rail/);
	assert.deepEqual([isUsageStatement('filecoin-pay'), isUsageStatement('aleph'), isUsageStatement('filecoin'), isUsageStatement('constructor')], [true, true, false, false]);
	const body = { chain: 'filecoin-pay', addresses: [PAYER], period: { month: '2026-08' }, format: 'json', payer };
	const refused = (/** @type {any} */ over) => assert.throws(() => parseRequest({ ...body, ...over }, { today: '2026-11-06' }), RequestError);
	refused({ period: { from: '2026-08-01', to: '2026-08-31' } });
	refused({ period: { month: '2026-11' } });
	refused({ format: 'pdf', document: 'beide' });
	refused({ includeKinds: ['fee'] });
	// An f1 address has no account in a contract; nor has a NEAR name.
	refused({ addresses: ['f1abjxfbp274xpdqcpuaykwkfb43omjotacm2p3za'] });
	refused({ addresses: ['wolkenfabrik.near'] });
	assert.deepEqual(parseRequest({ ...body, addresses: [PAYER, toFilecoinAddress(PAYER), PAYER.toUpperCase().replace('0X', '0x')] }, { today: '2026-11-06' }).addresses, [PAYER], 'one payer, in either form');
});
