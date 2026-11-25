// SPDX-License-Identifier: AGPL-3.0-or-later
// A swap on NEAR, through the whole pipeline: NEAR wrapped, the wNEAR given to
// a DEX for USDC. @le-space/chains reads both as a swap (Le-Space/belege#898);
// on an Eigenbeleg as "Tausch" only when the request names the kind: by default
// a swap is documented by the statement (#116). Every account, hash and amount is made up.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixedRates } from '@le-space/eigenbeleg';

import { BLOCKS, NO_EIGENBELEG, NoEigenbelegNeeded, generate, parseRequest } from '../src/index.js';
import { recordedNear } from '../../../apps/agent/src/recorded.js';

const OURS = 'wolkenfabrik.near';
const DEX = 'tauschboerse.near';
const USDC = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const WRAP = 'Wrap111111111111111111111111111111111111111';
const SWAP = 'Swap111111111111111111111111111111111111111';
const NOW = Date.parse('2026-11-06T12:00:00Z');
// 2026-11-01, a minute apart.
const T1 = '1793534400000000000';
const T2 = '1793534460000000000';
const yocto = (/** @type {string} */ near) => (BigInt(Math.round(Number(near) * 1e6)) * 10n ** 18n).toString();

const signed = (/** @type {any} */ over) => ({
	block: { block_height: '300' },
	signer_account_id: OURS,
	receiver_account_id: 'wrap.near',
	outcomes: { status: true },
	outcomes_agg: { transaction_fee: '446365125000000000000' },
	...over
});
const moved = (/** @type {any} */ over) => ({
	block: { block_height: '301' },
	affected_account_id: OURS,
	involved_account_id: DEX,
	contract_account_id: 'wrap.near',
	cause: 'TRANSFER',
	event_index: '0',
	...over
});

const raw = {
	account: OURS,
	network: /** @type {'mainnet'} */ ('mainnet'),
	txns: [
		signed({ transaction_hash: SWAP, block_timestamp: T2, block: { block_height: '301' }, actions: [{ action: 'FUNCTION_CALL', method: 'ft_transfer_call' }], actions_agg: { deposit: '1' } }),
		signed({ transaction_hash: WRAP, block_timestamp: T1, actions: [{ action: 'FUNCTION_CALL', method: 'near_deposit' }], actions_agg: { deposit: yocto('2') } })
	],
	ftTxns: [
		moved({ transaction_hash: SWAP, block_timestamp: T2, contract_account_id: USDC, delta_amount: '5670000', receipt_id: 's2' }),
		moved({ transaction_hash: SWAP, block_timestamp: T2, delta_amount: `-${yocto('2')}`, receipt_id: 's1' }),
		moved({ transaction_hash: WRAP, block_timestamp: T1, block: { block_height: '300' }, involved_account_id: '', cause: 'MINT', delta_amount: yocto('2'), receipt_id: 'w1' })
	]
};

const body = {
	chain: 'near',
	network: 'mainnet',
	addresses: [OURS],
	period: { from: '2026-11-01', to: '2026-11-01' },
	format: 'json',
	document: 'eigenbelege',
	// Asked for: by default swaps, fees and deposits are documented by the statement (#116).
	includeKinds: ['fee', 'storage', 'swap'],
	number: 'EB-2026-001',
	payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' }
};
const deps = { fetch: recordedNear(raw, { now: NOW }), rates: fixedRates({ NEAR: '2.5', USDC: '0.9' }), now: () => new Date(NOW) };

/** The CSV's lines as cells. @param {string} csv */
const rows = (csv) => csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(';'));

test('NEAR has swaps; on the Eigenbeleg only when the request names them (#116)', () => {
	assert.deepEqual(BLOCKS.near.kinds, ['fee', 'storage', 'transfer', 'call', 'swap']);
	assert.deepEqual(parseRequest(body, { today: '2026-11-06' }).includeKinds, ['fee', 'storage', 'swap']);
	const { includeKinds: _, ...unnamed } = body;
	assert.deepEqual(parseRequest({ ...unnamed, document: 'kontoauszug' }, { today: '2026-11-06' }).includeKinds, []);
	assert.deepEqual(parseRequest({ ...body, includeKinds: ['fee'] }, { today: '2026-11-06' }).includeKinds, ['fee']);
});

test('the wrapping and the swap at the DEX each get an Eigenbeleg that says Tausch', async () => {
	const out = await generate(parseRequest(body, { today: '2026-11-06' }), deps);
	assert.deepEqual(out.summary.eigenbelege, ['EB-2026-001', 'EB-2026-002']);
	const [head, ...lines] = rows(/** @type {string} */ (out.csv));
	const col = (/** @type {string} */ name) => head.indexOf(name);
	assert.deepEqual(
		lines.filter((l) => l[col('Art')] === 'Tausch').map((l) => [l[col('Belegnummer')], l[col('Datum (UTC)')], l[col('Richtung')], l[col('Gegenpartei')], l[col('Asset')], l[col('Menge')], l[col('Wert EUR')], l[col('Auf Eigenbeleg')]]),
		[
			// What left the wallet is on an Eigenbeleg, at the day's rate of NEAR …
			['EB-2026-001', '2026-11-01', 'Ausgang', 'wrap.near', 'NEAR', '-2', '-5', 'ja'],
			['EB-2026-002', '2026-11-01', 'Ausgang', DEX, 'wNEAR', '-2', '-5', 'ja'],
			// … what came back is named in the CSV: no payment, so on none.
			['', '2026-11-01', 'Eingang', '', 'wNEAR', '2', '5', 'nein'],
			['', '2026-11-01', 'Eingang', DEX, 'USDC', '5,67', '5,103', 'nein']
		]
	);
});

test('without the kind, the swaps are in the CSV and on no Eigenbeleg', async () => {
	const out = await generate(parseRequest({ ...body, includeKinds: ['fee'] }, { today: '2026-11-06' }), deps);
	assert.equal(out.summary.eigenbelege.length, 2, 'the two fees');
	assert.ok(out.summary.notOnIt > 0);
});

test('by default (#116) a swap and its fees need no Eigenbeleg: beide gives the statement alone, the CSV says why', async () => {
	const { includeKinds: _, ...plain } = body;
	assert.throws(() => parseRequest(plain, { today: '2026-11-06' }), (e) => e instanceof NoEigenbelegNeeded && e.code === 'no-eigenbeleg-needed' && e.message.startsWith(NO_EIGENBELEG.de));
	const req = parseRequest({ ...plain, document: 'beide', language: 'de' }, { today: '2026-11-06' });
	assert.equal(req.document, 'kontoauszug', 'the statement alone');
	assert.equal(req.noEigenbeleg, NO_EIGENBELEG.de);
	const out = await generate(req, deps);
	assert.deepEqual(out.summary.eigenbelege, []);
	assert.equal(out.summary.noEigenbeleg, NO_EIGENBELEG.de);
	assert.equal(out.summary.kontoauszuege.length, 1);
	assert.equal(out.pdf, null, 'no Eigenbeleg drawn');
	const [head, ...lines] = rows(/** @type {string} */ (out.csv));
	const col = (/** @type {string} */ name) => head.indexOf(name);
	const why = (/** @type {string} */ kind, /** @type {string} */ direction) => lines.filter((l) => l[col('Art')] === kind && l[col('Richtung')] === direction).map((l) => [l[col('Auf Eigenbeleg')], l[col('Hinweis')]]);
	assert.deepEqual(why('Tausch', 'Ausgang'), [['nein', 'Tausch – belegt durch den Kontoauszug'], ['nein', 'Tausch – belegt durch den Kontoauszug']]);
	assert.ok(why('Netzwerkgebühr (Gas)', 'Gebühr').length > 0);
	for (const w of why('Netzwerkgebühr (Gas)', 'Gebühr')) assert.deepEqual(w, ['nein', 'Netzwerkgebühr – belegt durch den Kontoauszug']);
	// What came back keeps its own reason.
	assert.deepEqual(why('Tausch', 'Eingang').map(([, w]) => w), ['Eingang, keine Zahlung', 'Eingang, keine Zahlung']);
});

test('the reasons in English, and on the movements an Eigenbeleg lists beside its positions', async () => {
	const out = await generate(parseRequest({ ...body, includeKinds: ['swap'], documentLanguage: 'en' }, { today: '2026-11-06' }), deps);
	const [head, ...lines] = rows(/** @type {string} */ (out.csv));
	const fees = lines.filter((l) => l[head.indexOf('Direction')] === 'fee');
	assert.ok(fees.length > 0);
	for (const l of fees) assert.equal(l[head.indexOf('Note')], 'network fee – documented by the account statement');
});
