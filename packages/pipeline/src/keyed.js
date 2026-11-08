// SPDX-License-Identifier: AGPL-3.0-or-later
// The blocks that need a key the server holds: Ethereum and Base, read
// through Alchemy (readers/evm.js). They are offered only where the key is
// configured (the API's ALCHEMY_KEY): `blocksFor({ alchemyKey })` gives them
// with the keyless ones, and the API hands that map to parseRequest,
// generate, describeBlocks and checkBlock. The web UI never has a key and
// never imports this file, so it never offers them and its
// Content-Security-Policy (dataSources()) names no Alchemy host.
//
// The key goes to the reads as a parameter (`alchemyKey`, only to a block
// with `needs: 'alchemyKey'`); no descriptor, answer, file or log carries it.

import { alchemyBaseUrl, isAlchemyKey } from '@le-space/chains/alchemy';
import { CHAINS } from '@le-space/chains/registry';
import { BLOCKS, CHAINS_VERSION } from './blocks.js';
import { evmReader } from './readers/evm.js';

/** @param {'ethereum' | 'base'} id @returns {import('./blocks.js').Block} */
function evmBlock(id) {
	const r = evmReader(id);
	return {
		name: '@le-space/chains/evm',
		chain: r.chain.id,
		networks: ['mainnet'],
		assets: [r.chain.native.symbol, ...Object.values(/** @type {Record<string, { symbol: string }>} */ (r.chain.tokens)).map((t) => t.symbol)],
		kinds: ['fee', 'transfer'],
		source: `Alchemy (${r.chain.alchemy.network}), with the server's key`,
		version: CHAINS_VERSION,
		/** Offered only where the server has this key; never in the web UI. */
		needs: 'alchemyKey',
		read: r.read,
		statement: r.statement,
		probe: r.probe,
		isAddress: r.isAddress,
		canonical: r.canonical
	};
}

/** @type {Record<string, import('./blocks.js').Block>} */
export const KEYED_BLOCKS = { ethereum: evmBlock('ethereum'), base: evmBlock('base') };

/**
 * The blocks this side can serve: the keyless ones, and the EVM ones where an
 * Alchemy key is configured.
 *
 * @param {{ alchemyKey?: string | null }} [deps]
 * @returns {Record<string, import('./blocks.js').Block>}
 */
export function blocksFor({ alchemyKey } = {}) {
	return isAlchemyKey(alchemyKey) ? { ...BLOCKS, ...KEYED_BLOCKS } : BLOCKS;
}

/**
 * The hosts the keyed blocks ask, for the API's list of outbound hosts (never
 * the page's: it has no key).
 *
 * @returns {import('./sources.js').Source[]}
 */
export function keyedSources() {
	return Object.keys(KEYED_BLOCKS).map((id) => {
		const chain = /** @type {any} */ (CHAINS[id]);
		return { origin: new URL(alchemyBaseUrl(chain.alchemy.network)).origin, chain: id, learns: /** @type {const} */ ('addresses'), what: `${chain.name} history and balances (Alchemy, with the server's key)` };
	});
}
