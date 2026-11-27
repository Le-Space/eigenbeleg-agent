// SPDX-License-Identifier: AGPL-3.0-or-later
// Every file of an answer in one ZIP, HINWEIS.txt / NOTICE.txt first: the test
// phase's notice in the documents' language, what they cover, never an address,
// an amount or a name. A recorded public account; the payer is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync } from 'fflate';

import { fixedRates } from '@le-space/eigenbeleg';

import { PILOT_NOTICES, bundleFiles, bundleZip, generate, noticeFile, parseRequest } from '../src/index.js';
import { recordedNear } from '../../../apps/agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('./fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
const created = new Date('2026-11-06T12:34:56Z');
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const terms = 'https://eigenbeleg.example.org/ui/#agb';
const build = { version: '0.2.0', commit: 'abcdef0123456789abcdef0123456789abcdef01' };

/** @param {Record<string, unknown>} over */
const run = async (over = {}) => {
	const req = parseRequest(
		{ chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, format: 'zip', document: 'beide', includeKinds: ['fee'], number: 'EB-2026-042', payer, ...over },
		{ today: '2026-11-06' }
	);
	return { req, out: await generate(req, { fetch: recordedNear(raw, { now: NOW }), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW) }) };
};

/** @param {string} text */
const leaks = (text) => ['relay.aurora', payer.name, 'Musterstraße', 'Beispielstadt', '€', 'EUR', 'NEAR '].filter((s) => text.includes(s));

test('the ZIP: HINWEIS.txt first, then every document, the notice in German without an address, an amount or a name', async () => {
	const { req, out } = await run();
	const { name, zip } = bundleZip(out, { document: req.document, addresses: req.addresses.length, terms, build, created });
	assert.equal(name, 'EB-2026-042.zip');
	const entries = unzipSync(zip);
	assert.deepEqual(Object.keys(entries), ['HINWEIS.txt', 'EB-2026-042.pdf', 'KA-2026-11-01.pdf', 'EB-2026-042.csv']);
	assert.equal(strFromU8(entries['EB-2026-042.pdf'].subarray(0, 8)), '%PDF-1.7');
	assert.deepEqual(entries['EB-2026-042.pdf'], out.pdf, 'the documents unchanged');
	assert.deepEqual(entries['EB-2026-042.csv'], strToU8(/** @type {string} */ (out.csv)));

	const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(entries['HINWEIS.txt']);
	assert.ok(text.startsWith('﻿HINWEIS ZU DIESEN DOKUMENTEN\r\n'), 'BOM and CRLF, for any editor');
	for (const line of [
		PILOT_NOTICES.de,
		'Chain: near (mainnet)',
		'Zeitraum: 2026-11-01',
		'Adressen: 1',
		'Erstellt am: 2026-11-06T12:34:56.000Z',
		'Version: 0.2.0, commit abcdef012345',
		'Dateien: EB-2026-042.pdf, KA-2026-11-01.pdf, EB-2026-042.csv',
		`Bedingungen (AGB, Ziffern 3, 9 und 9a): ${terms}`,
		'Fehler und Fragen: eigenbeleg@le-space.de'
	])
		assert.ok(text.includes(line), line);
	assert.deepEqual(leaks(text), [], 'no address, no amount, no name');
	assert.ok(!text.includes(String(out.summary.totalEur).replace('.', ',')) && !text.includes(String(out.summary.totalEur)), 'not the total');
});

test('English documents: NOTICE.txt; a statement alone; a period of several days', async () => {
	const { req, out } = await run({ documentLanguage: 'en', document: 'kontoauszug', period: { from: '2026-11-01', to: '2026-11-02' } });
	const entries = unzipSync(bundleZip(out, { document: req.document, addresses: 1, terms, created }).zip);
	assert.deepEqual(Object.keys(entries), ['NOTICE.txt', 'KA-2026-11-01.pdf', 'KA-2026-11-01.csv']);
	const text = strFromU8(entries['NOTICE.txt']);
	for (const line of [PILOT_NOTICES.en, 'NOTICE ON THESE DOCUMENTS', 'Period: 2026-11-01 to 2026-11-02', 'Addresses: 1', 'Version: unknown', `Terms (sections 3, 9 and 9a): ${terms}`]) assert.ok(text.includes(line), line);
	assert.ok(!text.includes('Testphase'), 'English throughout');
	assert.deepEqual(leaks(text), []);
});

test('on testnet every name has its prefix, the notice keeps its own', async () => {
	const { req, out } = await run();
	assert.deepEqual(bundleFiles(out, { document: req.document, prefix: 'TEST-' }).map((f) => f.name), ['TEST-EB-2026-042.pdf', 'TEST-KA-2026-11-01.pdf', 'TEST-EB-2026-042.csv']);
	const { name, zip } = bundleZip(out, { document: req.document, addresses: 1, terms, created, prefix: 'TEST-' });
	assert.equal(name, 'TEST-EB-2026-042.zip');
	assert.equal(Object.keys(unzipSync(zip))[0], 'HINWEIS.txt');
});

test('the notice counts the addresses and names none', () => {
	const { name, text } = noticeFile({ language: 'de', chain: 'akash', network: 'mainnet', period: { from: '2026-09-01', to: '2026-09-30' }, addresses: 3, created, terms });
	assert.equal(name, 'HINWEIS.txt');
	assert.match(text, /\r\nAdressen: 3\r\n/);
	assert.match(text, /\r\nZeitraum: 2026-09-01 bis 2026-09-30\r\n/);
});

test('format zip is a request of its own: both documents and several addresses are fine', () => {
	const ok = parseRequest({ chain: 'near', network: 'mainnet', addresses: ['relay.aurora', 'aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, format: 'zip', document: 'beide', includeKinds: ['fee'], payer }, { today: '2026-11-06' });
	assert.equal(ok.format, 'zip');
	assert.throws(() => parseRequest({ chain: 'near', addresses: ['relay.aurora'], period: { month: '2026-10' }, format: 'tar', payer }, { today: '2026-11-06' }), /zip/);
});
