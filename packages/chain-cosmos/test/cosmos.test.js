import { test } from 'node:test';
import assert from 'node:assert/strict';

import { block, toLedger } from '../src/index.js';
import { CHAINS } from '../src/chains.js';
import { moduleAddress } from '../src/vendor/bech32.js';

// Made-up entries in the shape the Belege reader gives (WalletEntry).
const account = moduleAddress('akash', 'wolkenfabrik-example');
const we = (over) => ({ id: 'H:fee', hash: 'H', height: 1, time: '2026-10-05T10:00:00.000Z', date: '2026-10-05', type: 'fee', kind: 'fee', asset: 'AKT', amount: '-0.005', decimals: 6, counterparty: '', counterpartyLabel: '', memo: '', success: false, explorerUrl: 'https://www.mintscan.io/akash/transactions/H', ...over });

test('a fee goes to the network, also for a failed transaction', () => {
	const e = toLedger(we({}), { chain: CHAINS.akash, account });
	assert.deepEqual([e.type, e.kind, e.counterparty, e.priceAs, e.success], ['fee', 'fee', 'akash', 'AKT', true]);
	assert.equal(e.id, `akash:${account}:H:fee`);
});

test('escrow, IBC and unlisted denoms', () => {
	const escrow = toLedger(we({ id: 'H:m0:e1.0:AKT', type: 'sent', kind: 'transfer', amount: '-5', counterpartyLabel: 'Akash-Escrow (Deployment)', success: true }), { chain: CHAINS.akash, account });
	assert.equal(escrow.kind, 'escrow');
	const ibc = toLedger(we({ id: 'H:m0:e2.0:AKT', type: 'sent', kind: 'ibc', amount: '-1', success: true }), { chain: CHAINS.akash, account });
	assert.equal(ibc.kind, 'transfer');
	const act = toLedger(we({ id: 'H:m0:e3.0:ACT', type: 'received', kind: 'swap', asset: 'ACT', amount: '2', listed: false, contract: 'uact', success: true }), { chain: CHAINS.akash, account });
	assert.equal(act.priceAs, '');
});

test('addresses are checked by their bech32 checksum', async () => {
	assert.ok(block.isAddress(account));
	assert.ok(!block.isAddress('akash1notreal'));
	assert.ok(!block.isAddress(moduleAddress('n', 'x')));
	await assert.rejects(block.read({ account: 'akash1notreal', from: '2026-10-01', to: '2026-10-31' }), /not a valid Akash address/);
});

test('endpoints can be handed in: a browser reads through its own proxy', async () => {
	/** @type {string[]} */
	const asked = [];
	const fetch = /** @type {typeof globalThis.fetch} */ (async (/** @type {any} */ url) => {
		asked.push(String(url));
		return new Response('{}', { status: 503 });
	});
	await assert.rejects(block.read({ account, from: '2026-10-01', to: '2026-10-31', fetch, endpoints: { rpc: 'https://proxy.example/akash-rpc', rest: 'https://proxy.example/akash-rest' } }));
	assert.ok(asked.length > 0);
	for (const u of asked) assert.ok(u.startsWith('https://proxy.example/'), u);
	assert.equal(CHAINS.akash.endpoints.rpc, 'https://akash-rpc.publicnode.com', 'the defaults stay as they are');
});
