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
import { samplePng } from '@le-space/pdf/testing/sample-images';
import { recordedNear } from '../../agent/src/recorded.js';
import { esploraUrl, runLocal } from '../src/local.js';
import { btcTx, fakeBitcoinAddress, fakeEsplora } from '@le-space/chains/testing/bitcoin';
import { keyFingerprint } from '@le-space/chains/bitcoin';
import { HDKey } from '@scure/bip32';

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

test('the issuer’s own logo, from a file on this machine, is on every Eigenbeleg and not on the statement', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'eigenbeleg-local-'));
	try {
		const run = { outDir: dir, fetch: recorded([]), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW), today: '2026-11-06', say: () => {} };
		await runLocal({ ...run, body: { ...body, issuerLogo: samplePng() } });
		assert.match((await readFile(join(dir, 'EB-2026-042.pdf'))).toString('latin1'), /\/Subtype\s*\/Image/);
		assert.doesNotMatch((await readFile(join(dir, 'KA-2026-11-01.pdf'))).toString('latin1'), /\/Subtype\s*\/Image/);
		assert.doesNotMatch(await readFile(join(dir, 'EB-2026-042.summary.json'), 'utf8'), /issuerLogo/);
		await assert.rejects(runLocal({ ...run, body: { ...body, issuerLogo: new Uint8Array(64) } }), /issuerLogo: the picture must be a PNG or a JPEG file/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a wrong request is refused before anything is read', async () => {
	await assert.rejects(runLocal({ body: { ...body, chain: 'nope' }, outDir: tmpdir(), fetch: recorded([]), today: '2026-11-06', say: () => {} }), /chain/);
	await assert.rejects(runLocal({ body: { ...body, chain: 'ethereum' }, outDir: tmpdir(), fetch: recorded([]), today: '2026-11-06', say: () => {} }), /chain/, 'ethereum needs an Alchemy key');
});

test('--esplora: an own node, at home too; no password, query or fragment', () => {
	assert.equal(esploraUrl('http://127.0.0.1:3002/'), 'http://127.0.0.1:3002');
	assert.equal(esploraUrl('http://umbrel.local:3006/api'), 'http://umbrel.local:3006/api');
	assert.equal(esploraUrl('https://esplora.example.com/api'), 'https://esplora.example.com/api');
	for (const bad of ['ftp://esplora.example.com', 'https://user:secret@esplora.example.com', 'https://esplora.example.com/api?key=1', 'https://esplora.example.com/#x', 'not a url']) assert.equal(esploraUrl(bad), null, bad);
});

test('a Bitcoin wallet by its zpub, read from an own Esplora: one Kontoauszug named by the fingerprint', async () => {
	const zpub = HDKey.fromMasterSeed(Uint8Array.from({ length: 64 }, (_, i) => (i * 7) % 256), { private: 0x04b2430c, public: 0x04b24746 }).derive("m/84'/0'/0'").publicExtendedKey;
	const { deriveAddress, parseExtendedKey } = await import('@le-space/chains/bitcoin');
	const w = parseExtendedKey(zpub);
	const api = fakeEsplora({ txs: [btcTx('pays the wallet', 100, [[fakeBitcoinAddress('a customer'), 30_000]], [[deriveAddress(w.account, w.type, 0, 0), 20_000]])] });
	const { summary } = await runLocal({
		body: { chain: 'bitcoin', addresses: [zpub], period: { from: '2026-05-01', to: '2026-06-30' }, document: 'kontoauszug' },
		outDir: 'unused',
		preview: true,
		esplora: api.url,
		fetch: api.fetch,
		rates: fixedRates({ BTC: '50000' }),
		today: '2026-11-06',
		say: () => {}
	});
	assert.equal(summary.kontoauszuege[0].account, keyFingerprint(zpub));
	assert.deepEqual(summary.kontoauszuege[0].assets.map((/** @type {any} */ a) => [a.asset, a.closing]), [['BTC', '0.0002']]);
	assert.ok(api.calls.length > 20 && api.calls.every((c) => c.startsWith(api.url) && !c.includes(zpub)));
});
