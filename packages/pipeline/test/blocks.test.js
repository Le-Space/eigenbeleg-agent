// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { BLOCKS, CHAINS_VERSION, checkBlock } from '../src/blocks.js';

test('the blocks are built on the installed @le-space/chains, and the old packages do not come back', async () => {
	const pkg = JSON.parse(await readFile(new URL('../../../node_modules/@le-space/chains/package.json', import.meta.url), 'utf8'));
	assert.equal(CHAINS_VERSION, pkg.version);
	for (const b of Object.values(BLOCKS)) assert.equal(b.version, pkg.version);
	// #6: readers, the booking format, the rates and the documents live in @le-space/*, never here again.
	for (const old of ['ledger-core', 'chain-near', 'chain-cosmos', 'chain-filecoin', 'rates', 'eigenbeleg']) {
		await assert.rejects(stat(new URL(`../../${old}`, import.meta.url)), undefined, `packages/${old} is back`);
	}
	// Nor their import names, in any package.json or source file of the repository.
	const root = new URL('../../../', import.meta.url);
	const files = (await readdir(root, { recursive: true, withFileTypes: true }))
		.filter((d) => d.isFile() && /\.(js|json)$/.test(d.name) && d.name !== 'package-lock.json')
		.map((d) => join(d.parentPath, d.name))
		.filter((f) => !/[/\\](node_modules|dist|\.git)[/\\]/.test(f.slice(root.pathname.length - 1)));
	assert.ok(files.length > 20);
	const OLD_NAMES = /@eigenbeleg\/(eigenbeleg|ledger-core|chain-near|chain-cosmos|chain-filecoin|rates)\b/;
	for (const f of files) assert.doesNotMatch(await readFile(f, 'utf8'), OLD_NAMES, f);
});

test('parallel checks ask the data source once; unknown chains are no lookup', async () => {
	let calls = 0;
	const original = BLOCKS.filecoin.probe;
	BLOCKS.filecoin.probe = async () => (calls++, await new Promise((r) => setTimeout(r, 20)), { sample: 'x', entries: 1 });
	try {
		const results = await Promise.all(Array.from({ length: 10 }, () => checkBlock('filecoin')));
		assert.equal(calls, 1);
		assert.ok(results.every((r) => r.ok));
	} finally {
		BLOCKS.filecoin.probe = original;
	}
	assert.equal((await checkBlock('constructor')).ok, false);
});
