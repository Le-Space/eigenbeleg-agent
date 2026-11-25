// SPDX-License-Identifier: AGPL-3.0-or-later
// Akash's monthly consumption Eigenbeleg (#116): what the wallet's
// deployments paid their providers from the escrow in a finished month, read
// from a node's deployment list and the indexer's block times, spread over
// each deployment's time (@le-space/chains usageInMonth, as Belege's Akash
// usage statement does), in ACT at 1 USD. The escrow deposit stays a
// prepayment on the Kontoauszug. The wallet, every dseq and amount are made
// up; the node and the indexer answer offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { akashDeployment } from '@le-space/chains/testing/cosmos';
import { moduleAddress } from '@le-space/chains/bech32';
import { fixedRates } from '@le-space/eigenbeleg';
import { BLOCKS, NoEigenbelegNeeded, describeBlocks, generate, parseRequest } from '../src/index.js';
import { wholeMonths } from '../src/generate.js';

const ACCOUNT = moduleAddress('akash', 'wolkenfabrik-example');
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const REST = 'https://rest.example';
const INDEXER = 'https://indexer.example';
/** Block heights and their times: 100 in June, the rest in July. */
const TIMES = /** @type {Record<number, string>} */ ({
	100: '2026-06-21T00:00:00Z',
	200: '2026-07-10T00:00:00Z',
	300: '2026-07-20T00:00:00Z',
	400: '2026-07-21T00:00:00Z'
});

/** @type {string[]} */
let asked = [];
const fetch = /** @type {typeof globalThis.fetch} */ (
	async (input) => {
		const url = new URL(String(input));
		asked.push(url.origin + url.pathname);
		if (url.origin === REST && url.pathname === '/akash/deployment/v1beta4/deployments/list') {
			assert.equal(url.searchParams.get('filters.owner'), ACCOUNT);
			return Response.json({
				deployments: [
					// 10 days in July, 1 ACT.
					akashDeployment({ owner: ACCOUNT, dseq: '1001', created: 200, settled: 300, uact: '1000000' }),
					// 10 days in June, 20 in July: 3 ACT, 2 of them in July.
					akashDeployment({ owner: ACCOUNT, dseq: '1002', created: 100, settled: 400, uact: '3000000', state: 'active' })
				],
				pagination: { next_key: null }
			});
		}
		const block = /^\/v1\/blocks\/(\d+)$/.exec(url.pathname);
		if (url.origin === INDEXER && block) return Response.json({ height: Number(block[1]), datetime: TIMES[Number(block[1])] });
		return Response.json({}, { status: 404 });
	}
);

/** The Akash block, its wallet read left out (the reader's own tests have it): only the deployments are read. */
const blocks = { akash: { ...BLOCKS.akash, read: async () => [], statement: async () => ({ entries: [], opening: {}, closing: {}, method: 'derived', at: null }) } };
const deps = { fetch, rates: fixedRates({ USD: '0.85' }), blocks, endpoints: { akash: { rest: REST, indexer: INDEXER } }, now: () => new Date('2026-08-05T12:00:00Z') };

test('the whole months of a period', () => {
	assert.deepEqual(wholeMonths({ from: '2026-07-01', to: '2026-07-31' }), ['2026-07']);
	assert.deepEqual(wholeMonths({ from: '2026-06-15', to: '2026-09-30' }), ['2026-07', '2026-08', '2026-09']);
	assert.deepEqual(wholeMonths({ from: '2026-07-02', to: '2026-07-31' }), []);
	assert.deepEqual(wholeMonths({ from: '2026-12-01', to: '2027-01-31' }), ['2026-12', '2027-01']);
});

test('Akash: the month’s lease payouts are the consumption Eigenbeleg, per deployment, the Kontoauszug named', async () => {
	asked = [];
	const req = parseRequest({ chain: 'akash', addresses: [ACCOUNT], period: { month: '2026-07' }, format: 'json', document: 'eigenbelege', payer }, { today: '2026-08-05' });
	const out = await generate(req, deps);
	assert.deepEqual(out.summary.eigenbelege, ['EB-2026-001']);
	const [c] = out.summary.consumption;
	assert.deepEqual([c.account, c.month, c.statement], [ACCOUNT, '2026-07', 'KA-2026-07-01']);
	assert.deepEqual(
		c.lines.map((/** @type {any} */ l) => [l.label, l.recipient, l.quantities, l.value, l.detail]),
		[
			['Deployment 1001', 'akash-providers', { ACT: '1' }, '0.85', 'Laufzeit 2026-07-10 – 2026-07-20, gesamt 1 ACT, Anteil 100.0 %'],
			['Deployment 1002', 'akash-providers', { ACT: '2' }, '1.7', 'Laufzeit 2026-06-21 – 2026-07-21, gesamt 3 ACT, Anteil 66.7 %']
		]
	);
	assert.equal(c.total, '2.55');
	assert.equal(out.summary.totalEur, '2.55');
	assert.ok(out.pdf instanceof Uint8Array && out.pdf.length > 1000);
	const csv = /** @type {string} */ (out.csv).split('\r\n');
	assert.equal(csv.filter((l) => l.startsWith('EB-2026-001;') && l.includes(';ACT;')).length, 2);
	// The node's list once, each block's time once.
	assert.deepEqual(asked.sort(), [`${INDEXER}/v1/blocks/100`, `${INDEXER}/v1/blocks/200`, `${INDEXER}/v1/blocks/300`, `${INDEXER}/v1/blocks/400`, `${REST}/akash/deployment/v1beta4/deployments/list`]);
});

test('Akash: the lease payouts are on no Kontoauszug, and a period without a whole month reads no deployments', async () => {
	asked = [];
	const both = await generate(parseRequest({ chain: 'akash', addresses: [ACCOUNT], period: { month: '2026-07' }, format: 'json', document: 'beide', payer }, { today: '2026-08-05' }), deps);
	assert.equal(both.summary.consumption.length, 1);
	assert.ok(both.summary.kontoauszuege[0].assets.every((/** @type {any} */ a) => a.asset !== 'ACT'), 'no ACT moved in the wallet');
	asked = [];
	const partBody = { chain: 'akash', addresses: [ACCOUNT], period: { from: '2026-07-05', to: '2026-07-31' }, format: 'json', payer };
	// No whole month and no kind named: nothing for an Eigenbeleg, refused before anything is read (#116).
	assert.throws(() => parseRequest(partBody, { today: '2026-08-05' }), NoEigenbelegNeeded);
	const part = await generate(parseRequest({ ...partBody, includeKinds: ['fee'] }, { today: '2026-08-05' }), deps);
	assert.deepEqual(part.summary.consumption, []);
	assert.deepEqual(asked, [], 'nothing read for a month that is not whole');
	asked = [];
	const statementOnly = await generate(parseRequest({ chain: 'akash', addresses: [ACCOUNT], period: { month: '2026-07' }, format: 'json', document: 'kontoauszug', payer }, { today: '2026-08-05' }), deps);
	assert.deepEqual([statementOnly.summary.consumption, asked], [[], []], 'the statement alone reads no deployments');
	assert.match(String(describeBlocks().find((b) => b.chain === 'akash')?.consumption), /lease payouts/);
});
