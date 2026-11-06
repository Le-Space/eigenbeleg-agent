import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FILECOIN } from '../src/chains.js';
import { block, toLedger } from '../src/index.js';
import { normalizeFilecoin } from '../src/vendor/filecoin.js';

// Made-up message and addresses in Filfox's shape.
const cid = 'bafy2bzaceexampleexampleexampleexampleexampleexampleexamplea';
const own = 'f0123456';
const rows = [
	{ message: cid, height: 1000, timestamp: 1791000000, from: own, to: 'f0999999', value: '-1500000000000000000', type: 'send' },
	{ message: cid, height: 1000, timestamp: 1791000000, from: own, to: 'f099', value: '-100000000000000', type: 'burn-fee' },
	{ message: cid, height: 1000, timestamp: 1791000000, from: own, to: 'f0777', value: '-20000000000000', type: 'miner-fee' }
];

test('a send and its fee (miner tip + burnt) as ledger entries', () => {
	const entries = normalizeFilecoin(rows, FILECOIN).map((e) => toLedger(e, own));
	const byType = Object.fromEntries(entries.map((e) => [e.type, e]));
	assert.equal(byType.sent.amount, '-1.5');
	assert.equal(byType.sent.priceAs, 'FIL');
	assert.equal(byType.fee.amount, '-0.00012');
	assert.equal(byType.fee.counterparty, 'filecoin');
	assert.match(byType.fee.explorerUrl, /filfox\.info\/en\/message\/bafy2bzace/);
});

test('addresses are checked by checksum before anything is fetched', async () => {
	assert.ok(block.isAddress('f0123456'));
	assert.ok(!block.isAddress('f1notarealaddressatall'));
	await assert.rejects(block.read({ account: 'f1notarealaddressatall', from: '2026-10-01', to: '2026-10-31' }), /not a valid Filecoin address/);
});
