// SPDX-License-Identifier: AGPL-3.0-or-later
// The EVM blocks (Ethereum, Base): offered only with the server's Alchemy
// key, which never shows in a descriptor, an answer or a document; a made-up
// Ethereum history end to end through the pipeline, offline, read from
// @le-space/chains' fake Alchemy (as strict as the real one about what it is
// asked). Addresses, the key and every amount are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FAKE_ALCHEMY_KEY as KEY, startFakeAlchemy } from '@le-space/chains/testing/alchemy';
import { EVM } from '@le-space/chains/testing/blockscout';
import { fixedRates } from '@le-space/eigenbeleg';
import { RequestError, blocksFor, checkBlock, describeBlocks, generate, parseRequest } from '../src/index.js';

const OWN = EVM.wallet;
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
/** Nothing may be fetched. */
const fetch = /** @type {typeof globalThis.fetch} */ (async () => assert.fail('nothing is fetched'));

test('without an Alchemy key there are no EVM blocks: not in GET /blocks, not in a request, not in the web UI', async () => {
	assert.deepEqual(describeBlocks().map((b) => b.chain), ['near', 'akash', 'filecoin', 'doichain', 'bitcoin', 'filecoin-pay', 'aleph']);
	assert.deepEqual(Object.keys(blocksFor({ alchemyKey: 'not a key!' })), ['near', 'akash', 'filecoin', 'doichain', 'bitcoin', 'filecoin-pay', 'aleph']);
	assert.deepEqual(Object.keys(blocksFor()), ['near', 'akash', 'filecoin', 'doichain', 'bitcoin', 'filecoin-pay', 'aleph']);
	assert.throws(() => parseRequest({ chain: 'base', addresses: [OWN], period: { month: '2026-10' }, payer }, { today: '2026-11-06' }), RequestError);
	assert.equal((await checkBlock('ethereum')).ok, false);
	const req = parseRequest({ chain: 'near', addresses: ['relay.aurora'], period: { month: '2026-10' }, includeKinds: ['fee'], payer }, { today: '2026-11-06' });
	await assert.rejects(generate({ ...req, chain: 'base' }, { fetch }), /no building block/);
	// A block that needs the key refuses without one, rather than ask Blockscout.
	await assert.rejects(blocksFor({ alchemyKey: KEY }).base.read({ account: OWN, from: '2026-10-01', to: '2026-10-31', fetch }), /needs an Alchemy key/);
	const withKey = describeBlocks(blocksFor({ alchemyKey: KEY }));
	assert.deepEqual(withKey.map((b) => b.chain), ['near', 'akash', 'filecoin', 'doichain', 'bitcoin', 'filecoin-pay', 'aleph', 'ethereum', 'base']);
	assert.deepEqual(withKey.find((b) => b.chain === 'base')?.assets, ['ETH', 'USDC', 'ALEPH', 'other ERC-20 tokens, by contract']);
	assert.ok(!JSON.stringify(withKey).includes(KEY), 'the key is in no descriptor');
});

test('Ethereum with the server\'s key: the gas of every transaction sent as Eigenbelege, ETH and USDC balances derived', async (t) => {
	// Today's balances: 0.01 ETH and 1 USDC before the month, then the fake's history (all on 2026-09-01).
	const alchemy = await startFakeAlchemy({ balances: { native: 434_690_000_000_000_000n, [EVM.usdc]: 450_000_000n } });
	t.after(() => alchemy.close());
	/** @type {string[]} */
	const asked = [];
	// Alchemy's host, sent to the fake on 127.0.0.1.
	const viaFake = /** @type {typeof globalThis.fetch} */ (
		(input, init) => {
			const url = String(input);
			asked.push(url);
			return globalThis.fetch(url.replace(/^https:\/\/([a-z-]+)\.g\.alchemy\.com\/v2/, (_m, network) => alchemy.baseUrl(network)), init);
		}
	);
	const blocks = blocksFor({ alchemyKey: KEY });
	const deps = { fetch: viaFake, rates: fixedRates({ ETH: '2000', USDC: '0.9' }), alchemyKey: KEY, blocks, now: () => new Date('2026-11-06T12:00:00Z') };
	const req = parseRequest({ chain: 'ethereum', addresses: [OWN], period: { month: '2026-09' }, format: 'json', document: 'beide', includeKinds: ['fee'], payer }, { today: '2026-11-06', blocks });
	const out = await generate(req, deps);
	assert.ok(asked.length > 0 && asked.every((u) => u.startsWith('https://eth-mainnet.g.alchemy.com/v2/')), asked.join('\n'));
	// The gas of the five transactions OWN sent (the failed one too): 0.00031 ETH × 2000 EUR.
	assert.deepEqual(out.summary.eigenbelege, ['EB-2026-001', 'EB-2026-002', 'EB-2026-003', 'EB-2026-004', 'EB-2026-005']);
	assert.equal(out.summary.totalEur, '0.62');
	assert.deepEqual(out.summary.quantities, { ETH: '0.00031' });
	const [k] = out.summary.kontoauszuege;
	assert.equal(k.method, 'derived');
	assert.deepEqual(
		k.assets.map((a) => [a.asset, a.opening, a.closing, a.reconciled]),
		[
			['ETH', '0.01', '0.43469', true],
			['USDC', '1', '450', true],
			['ALEPH', '0', '0', true]
		]
	);
	const csv = /** @type {string} */ (out.csv);
	assert.match(csv, /^EB-2026-001;1;2026-09-01;00:20:00;ethereum;mainnet;0x[0-9a-fA-F]{40};Netzwerkgebühr \(Gas\);Gebühr;Ethereum-Netzwerk \(Gas\) \(ethereum\);ETH;native;-0,0001;2000;-0,2;/m);
	assert.match(csv, /;Überweisung;Ausgang;0x[0-9a-f]{40};USDC;native;-300;0,9;-270;fester Testkurs \(USDC\);.*;nein;Zahlung an ein Konto/);
	assert.match(csv, /;Überweisung;Eingang;Vertrag \(interne Transaktion\) \(0x[0-9a-f]{40}\);ETH;native;0,02;/);
	assert.ok(!csv.includes(EVM.spamToken), 'a token that calls itself USDC is not booked');
	const pdfs = [/** @type {Uint8Array} */ (out.pdf), ...out.statements.map((s) => s.pdf)].map((b) => new TextDecoder('latin1').decode(b)).join('');
	assert.ok(!(JSON.stringify(out.summary) + csv + pdfs).includes(KEY), 'the key is in no document');
	// The live check asks Alchemy with the key and answers without it.
	const check = await checkBlock('ethereum', { fetch: viaFake, alchemyKey: KEY, blocks });
	assert.equal(check.ok, true, JSON.stringify(check));
	assert.ok(!JSON.stringify(check).includes(KEY));
});
