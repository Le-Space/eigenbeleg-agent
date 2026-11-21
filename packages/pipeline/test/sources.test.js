// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as near from '@le-space/chains/near';
import { AKASH_CHAIN } from '@le-space/chains/cosmos-chains';
import { FILECOIN } from '@le-space/chains/filecoin-chain';
import { ALEPH_API, ALEPH_EXPLORER } from '@le-space/chains/aleph';
import { FILECOIN_PAY } from '@le-space/chains/filecoin-pay';
import { alchemyBaseUrl } from '@le-space/chains/alchemy';
import { CHAINS } from '@le-space/chains/registry';
import { dataSources } from '../src/sources.js';
import { KEYED_BLOCKS, keyedSources } from '../src/keyed.js';
import { NETWORKS } from '../../onchain-pay/src/networks.js';

/** Explorer links are printed on the documents, never fetched. */
/**
 * The explorers of the payment networks (packages/onchain-pay): links in an answer, never fetched. That package's
 * ElectrumX servers (wss://) are asked by the API alone, and only where it takes such a payment (apps/api/src/onchain.js):
 * GET / and /llms.txt name them there. The page and the readers never ask them, so dataSources does not list them.
 */
const PAYMENT_EXPLORERS = Object.values(NETWORKS).map((n) => new URL(n.explorer.tx.replace('{tx}', 'x')).origin);

const PRINTED_ONLY = new Set(['https://nearblocks.io', 'https://testnet.nearblocks.io', 'https://www.mintscan.io', 'https://filfox.info/en', new URL(ALEPH_EXPLORER).origin, ...PAYMENT_EXPLORERS]);

/** Every origin in a nested object of endpoint strings. @param {unknown} o */
const originsIn = (o) => [...JSON.stringify(o).matchAll(/https:\/\/[a-z0-9.-]+\.[a-z]+/g)].map((m) => m[0]);

test('dataSources names every host the readers and the rates ask, and only those', async () => {
	// The readers' default endpoints (what the browser asks without a proxy), and the rate hosts
	// (@le-space/rates asks the ECB only for USD, for Aleph credits; the other central banks never).
	const expected = new Set([
		...originsIn(near.NETWORKS),
		...originsIn(AKASH_CHAIN.endpoints),
		...originsIn(FILECOIN.endpoints),
		new URL(ALEPH_API).origin,
		// Filecoin Pay without a key: the makers' index and Blockscout's own instance (Filfox is Filecoin's already).
		new URL(FILECOIN_PAY.index).origin,
		new URL(FILECOIN_PAY.api).origin,
		'https://api.coingecko.com',
		'https://api.kraken.com',
		'https://data-api.ecb.europa.eu'
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
	// Ethereum and Base (only with an Alchemy key) are listed apart, by keyedSources: the API adds them with its
	// own key, the page with the person's own (#25); dataSources itself names no Alchemy host.
	assert.deepEqual(
		keyedSources().map((s) => s.origin),
		Object.keys(KEYED_BLOCKS).map((id) => new URL(alchemyBaseUrl(/** @type {any} */ (CHAINS[id]).alchemy.network)).origin)
	);
	assert.ok(![...listed].some((o) => /alchemy/i.test(o)), 'dataSources has no Alchemy host');
	assert.match(keyedSources({ whose: 'your own' })[0].what, /with your own key/);
	const proxied = dataSources({ akashIndexer: 'https://akash-proxy.example.workers.dev' }).map((s) => s.origin);
	assert.ok(proxied.includes('https://akash-proxy.example.workers.dev') && !proxied.includes('https://console-api.akash.network'));
});
