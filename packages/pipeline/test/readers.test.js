// SPDX-License-Identifier: AGPL-3.0-or-later
// What the Eigenbeleg makes of what @le-space/chains reads: Akash and
// Filecoin (NEAR's reader hands out ledger entries itself).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moduleAddress } from '@le-space/chains/bech32';
import { AKASH_CHAIN } from '@le-space/chains/cosmos-chains';
import { normalizeFilecoin } from '@le-space/chains/filecoin';
import { FILECOIN } from '@le-space/chains';
import { BLOCKS } from '../src/blocks.js';
import * as akash from '../src/readers/akash.js';
import * as filecoin from '../src/readers/filecoin.js';

// Made-up entries in the shape the Belege reader gives (WalletEntry).
const account = moduleAddress('akash', 'wolkenfabrik-example');
const we = (/** @type {any} */ over) => ({ id: 'H:fee', hash: 'H', height: 1, time: '2026-10-05T10:00:00.000Z', date: '2026-10-05', type: 'fee', kind: 'fee', asset: 'AKT', amount: '-0.005', decimals: 6, counterparty: '', counterpartyLabel: '', memo: '', success: false, explorerUrl: 'https://www.mintscan.io/akash/transactions/H', ...over });

test('Akash: a fee goes to the network, also for a failed transaction', () => {
	const e = akash.toLedger(we({}), { chain: AKASH_CHAIN, account });
	assert.deepEqual([e.type, e.kind, e.counterparty, e.priceAs, e.success, e.schema], ['fee', 'fee', 'akash', 'AKT', true, 'le-space.ledger/1']);
	assert.equal(e.id, `akash:${account}:H:fee`);
});

test('Akash: escrow, IBC and unlisted denoms', () => {
	const escrow = akash.toLedger(we({ id: 'H:m0:e1.0:AKT', type: 'sent', kind: 'transfer', amount: '-5', counterpartyLabel: 'Akash-Escrow (Deployment)', success: true }), { chain: AKASH_CHAIN, account });
	assert.equal(escrow.kind, 'escrow');
	const ibc = akash.toLedger(we({ id: 'H:m0:e2.0:AKT', type: 'sent', kind: 'ibc', amount: '-1', success: true }), { chain: AKASH_CHAIN, account });
	assert.equal(ibc.kind, 'transfer');
	const act = akash.toLedger(we({ id: 'H:m0:e3.0:ACT', type: 'received', kind: 'swap', asset: 'ACT', amount: '2', listed: false, contract: 'uact', success: true }), { chain: AKASH_CHAIN, account });
	assert.deepEqual([act.priceAs, act.contract], ['', 'uact']);
});

test('Akash: addresses are checked by their bech32 checksum', async () => {
	assert.ok(BLOCKS.akash.isAddress(account));
	assert.ok(!BLOCKS.akash.isAddress('akash1notreal'));
	assert.ok(!BLOCKS.akash.isAddress(moduleAddress('n', 'x')));
	await assert.rejects(BLOCKS.akash.read({ account: 'akash1notreal', from: '2026-10-01', to: '2026-10-31' }), /not a valid Akash address/);
});

test('Akash: endpoints can be handed in; a browser reads through its own proxy', async () => {
	/** @type {string[]} */
	const asked = [];
	const fetch = /** @type {typeof globalThis.fetch} */ (async (/** @type {any} */ url) => {
		asked.push(String(url));
		return new Response('{}', { status: 503 });
	});
	await assert.rejects(BLOCKS.akash.read({ account, from: '2026-10-01', to: '2026-10-31', fetch, endpoints: { rpc: 'https://proxy.example/akash-rpc', rest: 'https://proxy.example/akash-rest' } }));
	assert.ok(asked.length > 0);
	for (const u of asked) assert.ok(u.startsWith('https://proxy.example/'), u);
	assert.equal(AKASH_CHAIN.endpoints.rpc, 'https://akash-rpc.publicnode.com', 'the defaults stay as they are');
});

// Made-up message and addresses in Filfox's shape.
const cid = 'bafy2bzaceexampleexampleexampleexampleexampleexampleexamplea';
const own = 'f0123456';
const rows = [
	{ message: cid, height: 1000, timestamp: 1791000000, from: own, to: 'f0999999', value: '-1500000000000000000', type: 'send' },
	{ message: cid, height: 1000, timestamp: 1791000000, from: own, to: 'f099', value: '-100000000000000', type: 'burn-fee' },
	{ message: cid, height: 1000, timestamp: 1791000000, from: own, to: 'f0777', value: '-20000000000000', type: 'miner-fee' }
];

test('Filecoin: a send and its fee (miner tip + burnt) as ledger entries', () => {
	const entries = normalizeFilecoin(/** @type {any} */ (rows), /** @type {any} */ (FILECOIN)).map((e) => filecoin.toLedger(e, own));
	const byType = Object.fromEntries(entries.map((e) => [e.type, e]));
	assert.equal(byType.sent.amount, '-1.5');
	assert.equal(byType.sent.priceAs, 'FIL');
	assert.equal(byType.fee.amount, '-0.00012');
	assert.equal(byType.fee.counterparty, 'filecoin');
	assert.match(byType.fee.explorerUrl, /filfox\.info\/en\/message\/bafy2bzace/);
});

test('Filecoin: addresses are checked by checksum before anything is fetched', async () => {
	assert.ok(BLOCKS.filecoin.isAddress('f0123456'));
	assert.ok(!BLOCKS.filecoin.isAddress('f1notarealaddressatall'));
	await assert.rejects(BLOCKS.filecoin.read({ account: 'f1notarealaddressatall', from: '2026-10-01', to: '2026-10-31' }), /not a valid Filecoin address/);
});
