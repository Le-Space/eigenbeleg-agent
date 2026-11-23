// SPDX-License-Identifier: AGPL-3.0-or-later
// The documents' language (`documentLanguage`): German by default, English on request; not the mail's `language`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { fixedRates } from '@le-space/eigenbeleg';

import { RequestError, generate, parseRequest } from '../src/index.js';
import { recordedNear } from '../../../apps/agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('./fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
// Made-up payer, as everywhere in this repository.
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const body = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, format: 'json', document: 'beide', number: 'EB-2026-042', payer };
const run = (over) => generate(parseRequest({ ...body, ...over }, { today: '2026-11-06' }), { fetch: recordedNear(raw, { now: NOW }), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW) });

test('documentLanguage: de unless en is asked for, and independent of the mail’s language', () => {
	assert.equal(parseRequest(body, { today: '2026-11-06' }).documentLanguage, 'de');
	assert.equal(parseRequest({ ...body, documentLanguage: 'en' }, { today: '2026-11-06' }).documentLanguage, 'en');
	// The mail's language defaults to English; the documents stay German unless asked.
	const mailOnly = parseRequest({ ...body, language: 'en' }, { today: '2026-11-06' });
	assert.deepEqual([mailOnly.language, mailOnly.documentLanguage], ['en', 'de']);
	for (const bad of ['fr', 'EN', 1]) assert.throws(() => parseRequest({ ...body, documentLanguage: bad }, { today: '2026-11-06' }), RequestError);
});

test('English documents: the summary says so, the CSV speaks English; German stays the default', async () => {
	const en = await run({ documentLanguage: 'en' });
	assert.equal(en.summary.documentLanguage, 'en');
	assert.ok(en.csv.startsWith('﻿Receipt number;Position;Date (UTC);'));
	assert.match(en.csv, /;Network fee \(gas\);/);
	assert.ok(en.pdf && en.statements.length === 1);
	const de = await run({});
	assert.equal(de.summary.documentLanguage, 'de');
	assert.ok(de.csv.startsWith('﻿Belegnummer;Position;Datum (UTC);'));
	assert.notDeepEqual(Buffer.from(en.pdf), Buffer.from(de.pdf));
});
