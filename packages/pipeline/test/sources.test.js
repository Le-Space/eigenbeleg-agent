// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as near from '@le-space/chains/near';
import { AKASH_CHAIN } from '@le-space/chains/cosmos-chains';
import { FILECOIN } from '@le-space/chains';
import { dataSources } from '../src/sources.js';

/** Explorer links are printed on the documents, never fetched. */
const PRINTED_ONLY = new Set(['https://nearblocks.io', 'https://testnet.nearblocks.io', 'https://www.mintscan.io', 'https://filfox.info/en']);

/** Every origin in a nested object of endpoint strings. @param {unknown} o */
const originsIn = (o) => [...JSON.stringify(o).matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]+/g)].map((m) => m[0]);

test('dataSources names every host the readers and the rates ask, and only those', async () => {
	// The readers' default endpoints (what the browser asks without a proxy), and the two rate hosts
	// (@le-space/rates asks the ECB and central banks only for currencies, which no chain here prices as).
	const expected = new Set([
		...originsIn(near.NETWORKS),
		...originsIn(AKASH_CHAIN.endpoints),
		...originsIn(FILECOIN.endpoints),
		'https://api.coingecko.com',
		'https://api.kraken.com'
	].filter((o) => !PRINTED_ONLY.has(o)));
	// And nothing in this repository's own packages asks anywhere else.
	const root = new URL('../../', import.meta.url).pathname;
	for (const pkg of await readdir(root)) {
		const src = join(root, pkg, 'src');
		const files = await readdir(src, { recursive: true }).catch(() => []);
		for (const f of files.filter((x) => x.endsWith('.js'))) {
			for (const m of (await readFile(join(src, f), 'utf8')).matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]+/g)) if (!PRINTED_ONLY.has(m[0])) assert.ok(expected.has(m[0]), `${pkg}/src/${f} asks ${m[0]}`);
		}
	}
	const listed = new Set(dataSources().map((s) => s.origin));
	assert.deepEqual([...listed].sort(), [...expected].sort());
	const proxied = dataSources({ akashIndexer: 'https://akash-proxy.example.workers.dev' }).map((s) => s.origin);
	assert.ok(proxied.includes('https://akash-proxy.example.workers.dev') && !proxied.includes('https://console-api.akash.network'));
});
