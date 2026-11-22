// SPDX-License-Identifier: AGPL-3.0-or-later
// --reference DOI=0.05@2026-01-01: the person's own euro value per DOI becomes the request's
// `reference` field exactly as --job takes it, and the pipeline accepts it. Wrong input stops the
// command line with a clear error before anything is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parseRequest } from '@eigenbeleg/pipeline';
import { fakeDoichainAddress } from '@le-space/chains/testing/doichain';
import { parseReference } from '../src/reference.js';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('one --reference is the job field { DOI: { eur, from } }', () => {
	assert.deepEqual(parseReference(['DOI=0.05@2026-01-01']), { DOI: { eur: '0.05', from: '2026-01-01' } });
	assert.deepEqual(parseReference(['doi=0.05@2026-01-01']), { DOI: { eur: '0.05', from: '2026-01-01' } }, 'the asset in capitals');
	assert.equal(parseReference(undefined), undefined, 'no option, no field: the pipeline then takes its default');
	assert.equal(parseReference([]), undefined);
});

test('a repeated --reference is a list per asset, in the order given', () => {
	assert.deepEqual(parseReference(['DOI=0.05@2026-01-01', 'DOI=0.07@2026-07-01']), {
		DOI: [
			{ eur: '0.05', from: '2026-01-01' },
			{ eur: '0.07', from: '2026-07-01' }
		]
	});
});

test('a wrong --reference is refused with what it should look like', () => {
	for (const bad of ['DOI', 'DOI=0.05', '0.05@2026-01-01', 'DOI=abc@2026-01-01', 'DOI=-1@2026-01-01', 'DOI=0,05@2026-01-01', 'DOI=0.05@01.01.2026']) assert.throws(() => parseReference([bad]), /ASSET=EUR@YYYY-MM-DD/, bad);
	assert.throws(() => parseReference(['DOI=0@2026-01-01']), /above 0/);
	assert.throws(() => parseReference(['DOI=0.000@2026-01-01']), /above 0/);
	assert.throws(() => parseReference(['DOI=0.05@2026-02-31']), /no day/);
	assert.throws(() => parseReference(['DOI=0.05@2026-01-01', 'DOI=0.06@2026-01-01']), /two values from 2026-01-01/);
});

test('the pipeline takes the option’s field for Doichain Eigenbelege, as from --job', () => {
	const body = { chain: 'doichain', network: 'mainnet', addresses: [fakeDoichainAddress('own')], period: { month: '2026-10' }, format: 'json', payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' } };
	const fromOption = parseRequest({ ...body, reference: parseReference(['DOI=0.05@2026-01-01']) }, { today: '2026-11-22' });
	const fromJob = parseRequest({ ...body, reference: { DOI: { eur: '0.05', from: '2026-01-01' } } }, { today: '2026-11-22' });
	assert.deepEqual(fromOption.reference, fromJob.reference);
	assert.deepEqual(fromOption.reference, { DOI: [{ from: '2026-01-01', eur: '0.05', by: 'Wolkenfabrik Hosting GmbH' }] });
	// Without it, the default 0.04 EUR per DOI, named as the default and not as the person's.
	assert.deepEqual(parseRequest(body, { today: '2026-11-22' }).reference, { DOI: [{ from: '2026-10-01', eur: '0.04', by: 'eigenbeleg-agent (Standardwert)' }] });
});

test('the command line lists --reference and stops on a wrong one before reading anything', async () => {
	const { stdout } = await run(process.execPath, [CLI, '--help']);
	assert.match(stdout, /--reference DOI=0\.05@2026-01-01/);
	await assert.rejects(run(process.execPath, [CLI, '--chain', 'doichain', '--address', 'dc1qexample', '--month', '2026-10', '--reference', 'DOI=0,05']), (/** @type {any} */ e) => e.code === 1 && /Error: --reference: .*ASSET=EUR@YYYY-MM-DD/.test(e.stderr));
});
