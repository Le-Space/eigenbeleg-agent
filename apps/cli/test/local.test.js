// SPDX-License-Identifier: AGPL-3.0-or-later
// The local run (issue #29, skill eigenbeleg-local): the recorded NEAR day
// becomes files in a directory, offline, with no call beyond the chain's own
// data source; the preview writes nothing; the payer's data goes nowhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fixedRates } from '@le-space/eigenbeleg';
import { recordedNear } from '../../agent/src/recorded.js';
import { runLocal } from '../src/local.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
// Made-up payer, as everywhere in this repository.
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const body = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, document: 'beide', number: 'EB-2026-042', payer };

/** The recorded chain, and a note of every host asked. @param {string[]} asked */
const recorded = (asked) => {
	const inner = recordedNear(raw, { now: NOW });
	return /** @type {typeof fetch} */ (
		(/** @type {any} */ input, /** @type {any} */ init) => {
			asked.push(new URL(String(input)).host);
			return inner(input, init);
		}
	);
};

test('a local run writes the Eigenbelege, the Kontoauszug, the CSV and a summary, and asks only the chain', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-local-'));
	/** @type {string[]} */
	const asked = [];
	/** @type {string[]} */
	const said = [];
	try {
		const { summary, files } = await runLocal({ body, outDir: dir, fetch: recorded(asked), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW), today: '2026-11-06', say: (l) => said.push(l) });
		assert.equal(summary.eigenbelege[0], 'EB-2026-042');
		assert.ok(summary.positions > 0);
		const names = (await readdir(dir)).sort();
		assert.deepEqual(names, ['EB-2026-042.csv', 'EB-2026-042.pdf', 'EB-2026-042.summary.json', 'KA-2026-11-01.pdf']);
		assert.equal(files.length, 4);
		assert.equal((await readFile(join(dir, 'EB-2026-042.pdf'))).subarray(0, 5).toString(), '%PDF-');
		assert.equal(JSON.parse(await readFile(join(dir, 'EB-2026-042.summary.json'), 'utf8')).number, summary.number);
		assert.ok(asked.length > 0 && asked.every((h) => /nearblocks\.io$|fastnear\.com$|near\.org$/.test(h)), `only the chain's sources: ${[...new Set(asked)].join(', ')}`);
		assert.ok(said.some((l) => l.startsWith('Reading relay.aurora')));
		// The payer's name is on the documents and nowhere else: not in the summary, not in a request.
		assert.doesNotMatch(JSON.stringify(summary), /Wolkenfabrik/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('the preview takes no payer and writes nothing', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-local-'));
	try {
		const { payer: _p, ...noPayer } = body;
		const { summary, files } = await runLocal({ body: noPayer, outDir: dir, preview: true, fetch: recorded([]), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW), today: '2026-11-06', say: () => {} });
		assert.ok(summary.positions > 0);
		assert.deepEqual(files, []);
		assert.deepEqual(await readdir(dir), []);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a wrong request is refused before anything is read', async () => {
	await assert.rejects(runLocal({ body: { ...body, chain: 'nope' }, outDir: tmpdir(), fetch: recorded([]), today: '2026-11-06', say: () => {} }), /chain/);
	await assert.rejects(runLocal({ body: { ...body, chain: 'ethereum' }, outDir: tmpdir(), fetch: recorded([]), today: '2026-11-06', say: () => {} }), /chain/, 'ethereum needs an Alchemy key');
});
