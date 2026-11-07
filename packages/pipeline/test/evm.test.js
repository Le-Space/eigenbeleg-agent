// SPDX-License-Identifier: AGPL-3.0-or-later
// The EVM blocks (Ethereum, Base): offered only with the server's Alchemy
// key, which never shows in a descriptor, an answer or a document; an ALEPH
// purchase on Base end to end through the pipeline, offline. Addresses, the
// key and every amount are made up; Alchemy answers in its JSON-RPC shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHAINS } from '@le-space/chains/registry';
import { fixedRates } from '@eigenbeleg/eigenbeleg';
import { RequestError, blocksFor, checkBlock, describeBlocks, generate, parseRequest } from '../src/index.js';

const KEY = 'wolkenfabrik-test-key-0001';
const OWN = `0x${'7a'.repeat(20)}`;
const EXCHANGE = `0x${'9c'.repeat(20)}`;
const RECIPIENT = `0x${'4d'.repeat(20)}`;
const ALEPH = /** @type {string} */ (Object.entries(/** @type {any} */ (CHAINS.base).tokens).find(([, t]) => /** @type {any} */ (t).symbol === 'ALEPH')?.[0]);
const TX_IN = `0x${'01'.repeat(32)}`;
const TX_OUT = `0x${'02'.repeat(32)}`;
const hex = (/** @type {bigint} */ n) => `0x${n.toString(16)}`;
const E18 = 10n ** 18n;
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };

/** 1000 ALEPH in from an exchange, then 200 ALEPH out in a transaction OWN sent (its gas: 50,000 × 1 gwei). */
const transfer = (/** @type {string} */ hash, /** @type {string} */ from, /** @type {string} */ to, /** @type {bigint} */ value, /** @type {number} */ block, /** @type {string} */ time) => ({
	hash,
	uniqueId: `${hash}:log:0`,
	category: 'erc20',
	from,
	to,
	blockNum: hex(BigInt(block)),
	asset: 'ALEPH',
	metadata: { blockTimestamp: time },
	rawContract: { address: ALEPH, value: hex(value), decimal: '0x12' }
});
const IN = transfer(TX_IN, EXCHANGE, OWN, 1000n * E18, 0x100, '2026-10-05T09:00:00.000Z');
const OUT = transfer(TX_OUT, OWN, RECIPIENT, 200n * E18, 0x200, '2026-10-05T10:00:00.000Z');

/** @type {string[]} */
let asked = [];
/** @param {{ method: string, params: any[] }} call */
function answer({ method, params }) {
	if (method === 'eth_chainId') return hex(8453n);
	if (method === 'alchemy_getAssetTransfers') return { transfers: params[0].fromAddress ? [OUT] : [IN] };
	if (method === 'eth_getTransactionByHash' && params[0] === TX_OUT) return { hash: TX_OUT, from: OWN, to: ALEPH, value: '0x0', gasPrice: hex(10n ** 9n) };
	if (method === 'eth_getTransactionReceipt' && params[0] === TX_OUT) return { status: '0x1', blockNumber: '0x200', transactionIndex: '0x0', gasUsed: hex(50_000n), effectiveGasPrice: hex(10n ** 9n) };
	if (method === 'eth_blockNumber') return '0x300';
	if (method === 'eth_getTransactionCount') return '0x1';
	if (method === 'eth_getBalance') return hex(10n ** 16n);
	if (method === 'alchemy_getTokenBalances') return { address: OWN, tokenBalances: [{ contractAddress: ALEPH, tokenBalance: hex(800n * E18) }] };
	throw new Error(`unexpected ${method}`);
}
const fetch = /** @type {typeof globalThis.fetch} */ (
	async (/** @type {any} */ input, /** @type {any} */ init) => {
		const url = String(input);
		asked.push(url);
		if (url !== `https://base-mainnet.g.alchemy.com/v2/${KEY}`) return new Response('{}', { status: 404 });
		const body = JSON.parse(init.body);
		const one = (/** @type {any} */ c) => ({ jsonrpc: '2.0', id: c.id, result: answer(c) });
		return new Response(JSON.stringify(Array.isArray(body) ? body.map(one) : one(body)), { headers: { 'content-type': 'application/json' } });
	}
);

test('without an Alchemy key there are no EVM blocks: not in GET /blocks, not in a request, not in the web UI', async () => {
	assert.deepEqual(describeBlocks().map((b) => b.chain), ['near', 'akash', 'filecoin', 'aleph']);
	assert.deepEqual(Object.keys(blocksFor({ alchemyKey: 'not a key!' })), ['near', 'akash', 'filecoin', 'aleph']);
	assert.deepEqual(Object.keys(blocksFor()), ['near', 'akash', 'filecoin', 'aleph']);
	assert.throws(() => parseRequest({ chain: 'base', addresses: [OWN], period: { month: '2026-10' }, payer }, { today: '2026-11-06' }), RequestError);
	assert.equal((await checkBlock('ethereum')).ok, false);
	const req = parseRequest({ chain: 'near', addresses: ['relay.aurora'], period: { month: '2026-10' }, payer }, { today: '2026-11-06' });
	await assert.rejects(generate({ ...req, chain: 'base' }, { fetch }), /no building block/);
	// A block that needs the key refuses without one, rather than ask Blockscout.
	await assert.rejects(blocksFor({ alchemyKey: KEY }).base.read({ account: OWN, from: '2026-10-01', to: '2026-10-31', fetch }), /needs an Alchemy key/);
	const withKey = describeBlocks(blocksFor({ alchemyKey: KEY }));
	assert.deepEqual(withKey.map((b) => b.chain), ['near', 'akash', 'filecoin', 'aleph', 'ethereum', 'base']);
	assert.deepEqual(withKey.find((b) => b.chain === 'base')?.assets, ['ETH', 'USDC', 'ALEPH']);
	assert.ok(!JSON.stringify(withKey).includes(KEY), 'the key is in no descriptor');
});

test('Base with the server\'s key: an ALEPH purchase and its gas, the Eigenbeleg for the gas, balances derived', async () => {
	asked = [];
	const blocks = blocksFor({ alchemyKey: KEY });
	const deps = { fetch, rates: fixedRates({ ETH: '2000', ALEPH: '0.1' }), alchemyKey: KEY, blocks, now: () => new Date('2026-11-06T12:00:00Z') };
	const req = parseRequest({ chain: 'base', addresses: [OWN], period: { month: '2026-10' }, format: 'json', document: 'beide', payer }, { today: '2026-11-06', blocks });
	const out = await generate(req, deps);
	assert.ok(asked.length > 0 && asked.every((u) => u.startsWith('https://base-mainnet.g.alchemy.com/v2/')));
	// The gas of the transaction OWN sent: 50,000 × 1 gwei = 0.00005 ETH × 2000 EUR.
	assert.equal(out.summary.eigenbelege.length, 1);
	assert.equal(out.summary.totalEur, '0.1');
	assert.deepEqual(out.summary.quantities, { ETH: '0.00005' });
	const [k] = out.summary.kontoauszuege;
	assert.equal(k.method, 'derived');
	assert.deepEqual(
		k.assets.map((a) => [a.asset, a.opening, a.closing, a.reconciled]),
		[
			['ETH', '0.01005', '0.01', true],
			['ALEPH', '0', '800', true]
		]
	);
	const csv = /** @type {string} */ (out.csv);
	assert.match(csv, /;Netzwerkgebühr \(Gas\);Gebühr;Base-Netzwerk \(Gas\) \(base\);ETH;native;-0,00005;2000;-0,1;/);
	assert.match(csv, /;Überweisung;Ausgang;0x4d4d[0-9a-f]+;ALEPH;native;-200;0,1;-20;fester Testkurs \(ALEPH\);.*;nein;Zahlung an ein Konto/);
	assert.match(csv, /;Überweisung;Eingang;0x9c9c[0-9a-f]+;ALEPH;native;1000;/);
	const pdfs = [/** @type {Uint8Array} */ (out.pdf), ...out.statements.map((s) => s.pdf)].map((b) => new TextDecoder('latin1').decode(b)).join('');
	assert.ok(!(JSON.stringify(out.summary) + csv + pdfs).includes(KEY), 'the key is in no document');
	// The live check asks Alchemy with the key and answers without it.
	const check = await checkBlock('base', { fetch, alchemyKey: KEY, blocks });
	assert.equal(check.ok, true, JSON.stringify(check));
	assert.ok(!JSON.stringify(check).includes(KEY));
});
