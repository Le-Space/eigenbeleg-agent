import { test } from 'node:test';
import assert from 'node:assert/strict';

import { entry, fromUnits, monthPeriod, multiply, round, sortEntries, sum, toUnits } from '../src/index.js';

const base = {
	id: 'near:H1:fee',
	chain: 'near',
	network: 'mainnet',
	account: 'example.near',
	hash: 'H1',
	height: 1,
	time: '2026-10-05T12:00:00.000Z',
	type: /** @type {const} */ ('fee'),
	kind: /** @type {const} */ ('fee'),
	asset: 'NEAR',
	contract: 'native',
	decimals: 24,
	amount: '-0.000312',
	counterparty: 'near',
	counterpartyLabel: 'NEAR Protocol (Netzwerk)',
	method: '',
	memo: '',
	success: true,
	explorerUrl: ''
};

test('units and decimals round-trip exactly, beyond float precision', () => {
	assert.equal(fromUnits(300545372466008700000000n, 24), '0.3005453724660087');
	assert.equal(fromUnits('-1', 24), '-0.000000000000000000000001');
	assert.equal(toUnits('0.000000000000000000000001', 24), 1n);
	assert.equal(toUnits('-12.34', 2), -1234n);
	assert.equal(fromUnits(0n, 6), '0');
});

test('sum and multiply round half away from zero', () => {
	assert.equal(sum(['0.1', '0.2', '-0.05']), '0.25');
	assert.equal(multiply('2.5', '3.8796'), '9.7');
	assert.equal(multiply('-0.000312', '3.8796', 4), '-0.0012');
	assert.equal(multiply('0.005', '1'), '0.01');
	assert.equal(multiply('-0.005', '1'), '-0.01');
	assert.equal(round('12.344999', 2), '12.34');
});

test('an entry is checked and gets its date', () => {
	const e = entry(base);
	assert.equal(e.schema, 'eigenbeleg.ledger/1');
	assert.equal(e.date, '2026-10-05');
	assert.throws(() => entry({ ...base, amount: '0.1' }), /must be negative/);
	assert.throws(() => entry({ ...base, kind: /** @type {any} */ ('gift') }), /bad kind/);
	assert.throws(() => entry({ ...base, amount: '1e-3' }), /bad amount/);
});

test('sorting puts the fee after the payment of the same transaction', () => {
	const pay = entry({ ...base, id: 'near:H1:transfer', type: 'sent', kind: 'transfer', amount: '-1' });
	const fee = entry(base);
	assert.deepEqual(sortEntries([fee, pay]).map((e) => e.id), ['near:H1:transfer', 'near:H1:fee']);
});

test('a month is its first to its last day', () => {
	assert.deepEqual(monthPeriod('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
	assert.deepEqual(monthPeriod('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
	assert.throws(() => monthPeriod('2026-13'));
});

test('balances derived from today less every movement since', async () => {
	const { derivedStatement } = await import('../src/index.js');
	const mk = (id, date, amount) => entry({ ...base, id, hash: id, time: `${date}T10:00:00Z`, type: amount.startsWith('-') ? 'sent' : 'received', kind: 'transfer', amount });
	const all = [mk('a', '2026-09-30', '5'), mk('b', '2026-10-10', '-2'), mk('c', '2026-11-03', '1')];
	const r = derivedStatement(all, [{ asset: 'NEAR', amount: '7' }], '2026-10-01', '2026-10-31');
	assert.deepEqual([r.opening.NEAR, r.closing.NEAR, r.entries.map((e) => e.id), r.method], ['8', '6', ['b'], 'derived']);
});
