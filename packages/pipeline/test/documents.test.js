// SPDX-License-Identifier: AGPL-3.0-or-later
// What the Eigenbeleg makes of @le-space/eigenbeleg and @le-space/pdf: the
// files of a recorded NEAR day as PDF/A-2b by "eigenbeleg", one Eigenbeleg
// per transaction, the Kontoauszug beside them, the CSV; and when a
// statement counts as reconciled. The document model itself is tested in the
// package (Le-Space/belege, packages/eigenbeleg).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { fixedRates } from '@le-space/eigenbeleg';
import { pdfaStructure } from '@le-space/pdf/testing/pdfa-structure';

import { generate, parseRequest } from '../src/index.js';
import { reconciled } from '../src/generate.js';
import { recordedNear } from '../../../apps/agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('./fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
// Made-up payer, as everywhere in this repository.
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };

const req = parseRequest(
	{ chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, format: 'json', document: 'beide', includeKinds: ['fee', 'storage', 'swap'], number: 'EB-2026-042', payer },
	{ today: '2026-11-06' }
);
const out = await generate(req, { fetch: recordedNear(raw, { now: NOW }), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW) });

test('the Eigenbelege: one per fee of the day, PDF/A-2b by eigenbeleg, the payer as author', () => {
	assert.equal(out.summary.transactions, raw.txns.length);
	assert.equal(out.summary.notOnIt, 0);
	assert.equal(out.summary.eigenbelege[0], 'EB-2026-042');
	const pdf = pdfaStructure(/** @type {Uint8Array} */ (out.pdf));
	assert.deepEqual(pdf.pdfaid, { part: '2', conformance: 'B' });
	assert.equal(pdf.info.Creator, 'eigenbeleg');
	assert.equal(pdf.xmp.creatorTool, 'eigenbeleg');
	assert.equal(pdf.info.Author, payer.name);
	assert.equal(pdf.info.Title, `Eigenbeleg EB-2026-042 – ${out.summary.eigenbelege.at(-1)}`);
	assert.equal(pdf.xmp.createDate, '2026-11-06T12:00:00Z', 'the clock handed in, not the machine’s');
	assert.ok(pdf.outputIntent && pdf.embeddedFonts > 0 && pdf.id);
	assert.deepEqual(pdf.standardFonts, [], 'every font embedded');
	assert.equal(pdf.language, 'de-DE');
});

test('the Kontoauszug beside them, and the CSV of every entry', () => {
	assert.equal(out.statements.length, 1);
	const st = pdfaStructure(out.statements[0].pdf);
	assert.equal(st.info.Title, 'Kontoauszug KA-2026-11-01');
	assert.equal(st.info.Creator, 'eigenbeleg');
	assert.match(st.info.Subject, /^Kontoauszug NEAR Protocol relay\.aurora, 01\.11\.2026 – 01\.11\.2026$/);
	const [k] = out.summary.kontoauszuege;
	assert.equal(k.method, 'archive');
	assert.ok(k.assets.every((a) => a.reconciled === true));
	const lines = /** @type {string} */ (out.csv).trimEnd().split('\r\n');
	assert.ok(lines[0].startsWith('﻿Belegnummer;Position;'));
	assert.equal(lines.length, 1 + raw.txns.length + 2, 'header, one line per fee, a blank line, the sum');
	assert.match(lines.at(-1) ?? '', /^;Summe;/);
	assert.match(lines[1], /^EB-2026-042;1;2026-11-01;[0-9:]+;near;mainnet;relay\.aurora;Netzwerkgebühr \(Gas\);Gebühr;/);
});

test('reconciled: exactly, or below the twelve decimals the documents print (NEAR’s 1 yocto deposit)', () => {
	assert.deepEqual(
		[reconciled('0'), reconciled('-0.000000000000000000000003'), reconciled('0.000000000001'), reconciled('-0.000000004875'), reconciled(null)],
		[true, true, false, false, null]
	);
});
