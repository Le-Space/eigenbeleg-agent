// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dataSources } from '../src/sources.js';

/** Explorer links are printed on the documents, never fetched. */
const PRINTED_ONLY = new Set(['https://nearblocks.io', 'https://testnet.nearblocks.io', 'https://www.mintscan.io']);

test('dataSources names every host the packages fetch from, and only those', async () => {
	const root = new URL('../../', import.meta.url).pathname;
	/** @type {Set<string>} */
	const found = new Set();
	for (const pkg of await readdir(root)) {
		const src = join(root, pkg, 'src');
		const files = await readdir(src, { recursive: true }).catch(() => []);
		for (const f of files.filter((x) => x.endsWith('.js'))) {
			for (const m of (await readFile(join(src, f), 'utf8')).matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]+/g)) if (!PRINTED_ONLY.has(m[0])) found.add(m[0]);
		}
	}
	const listed = new Set(dataSources().map((s) => s.origin));
	assert.deepEqual([...found].sort(), [...listed].sort());
	const proxied = dataSources({ akashIndexer: 'https://akash-proxy.example.workers.dev' }).map((s) => s.origin);
	assert.ok(proxied.includes('https://akash-proxy.example.workers.dev') && !proxied.includes('https://console-api.akash.network'));
});
