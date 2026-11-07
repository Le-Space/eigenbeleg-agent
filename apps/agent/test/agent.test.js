import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fixedRates } from '@eigenbeleg/eigenbeleg';
import { createApp } from '../../api/src/app.js';
import { recordedNear } from '../src/recorded.js';
import { runJob } from '../src/agent.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const recorded = recordedNear(raw);
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };

async function withApi(fn) {
	const app = createApp({ paywall: { middleware: null, info: { mode: 'none' } }, deps: { fetch: recorded, rates: fixedRates({ NEAR: '2' }), probeDay: '2026-11-01' }, log: () => {} });
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	try {
		return await fn(`http://127.0.0.1:${server.address().port}`);
	} finally {
		server.close();
	}
}

test('a job on a chain with a current block: files, checks and a receipt', async () => {
	const outDir = await mkdtemp(join(tmpdir(), 'eb-agent-'));
	const lines = [];
	const r = await withApi((api) =>
		runJob({ api, fetch, paidFetch: fetch, outDir, say: (l) => lines.push(l), job: { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, payer, number: 'EB-2026-009', document: 'beide' } })
	);
	assert.equal(r.status, 'delivered');
	assert.deepEqual(await readdir(outDir).then((f) => f.sort()), ['EB-2026-009.csv', 'EB-2026-009.pdf', 'EB-2026-009.receipt.json', 'KA-2026-11-01.pdf']);
	const receipt = JSON.parse(await readFile(join(outDir, 'EB-2026-009.receipt.json'), 'utf8'));
	assert.equal(receipt.passed, true);
	assert.equal(receipt.summary.positions, raw.txns.length);
	assert.equal(receipt.summary.eigenbelege.length, raw.txns.length, 'one Eigenbeleg per transaction');
	assert.deepEqual(receipt.summary.kontoauszuege[0].assets.map((a) => [a.asset, a.reconciled]), [['NEAR', true]]);
	assert.equal(receipt.checks.kontoauszuegeReconciled, true);
});

test('a job on a chain without a block: nothing bought, a draft PR with failing tests, commands only printed', async () => {
	const outDir = await mkdtemp(join(tmpdir(), 'eb-agent-'));
	let paid = 0;
	const lines = [];
	const r = await withApi((api) =>
		runJob({ api, fetch, paidFetch: async (...a) => (paid++, fetch(...a)), outDir, say: (l) => lines.push(l), job: { chain: 'solana', network: 'mainnet', addresses: ['ExampleSolanaAddress1111111111111111111111'], period: { month: '2026-10' }, payer } })
	);
	assert.equal(r.status, 'proposed');
	assert.equal(paid, 0);
	const plan = await readFile(join(outDir, 'proposals', 'chain-solana', 'PLAN.md'), 'utf8');
	assert.match(plan, /public indexer API/);
	assert.match(plan, /AGPL-3.0-or-later/);
	assert.ok(lines.some((l) => l.includes('gh pr create --draft')));
});
