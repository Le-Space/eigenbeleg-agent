// SPDX-License-Identifier: AGPL-3.0-or-later
// The blocks that need an Alchemy key: Ethereum and Base, read through
// Alchemy (@le-space/chains/evm's evmReader). They are offered only where a
// key is given: `blocksFor({ alchemyKey })` gives them with the keyless ones,
// and that map goes to parseRequest, generate, describeBlocks and checkBlock.
// The API uses its own key (ALCHEMY_KEY); the web UI and the CLI use the
// person's own key, which goes from their machine to Alchemy only (#25).
// dataSources() never lists the Alchemy hosts; keyedSources() does, so each
// side adds them where it offers these blocks.
//
// A token not in the chain's list is booked by its contract once the address
// sent it on, or the request names it (`tokens`); it gets a statement section
// of its own and is valued by its contract (rates.js), never by its symbol.
//
// The key goes to the reads as a parameter (`alchemyKey`, only to a block
// with `needs: 'alchemyKey'`); no descriptor, answer, file or log carries it.

import { alchemyBaseUrl, isAlchemyKey } from '@le-space/chains/alchemy';

export { isAlchemyKey };
import { CHAINS } from '@le-space/chains/registry';
import { BLOCKS, CHAINS_VERSION } from './blocks.js';
import { evmReader } from '@le-space/chains/evm';

/** @param {'ethereum' | 'base'} id @returns {import('./blocks.js').Block} */
function evmBlock(id) {
	const r = evmReader(/** @type {import('@le-space/chains/registry').EvmChain} */ (CHAINS[id]));
	return {
		name: '@le-space/chains/evm',
		chain: r.chain.id,
		networks: ['mainnet'],
		// Every other ERC-20 the address sent on, or the request names, by its contract (#93).
		assets: [r.chain.native.symbol, ...Object.values(/** @type {Record<string, { symbol: string }>} */ (r.chain.tokens)).map((t) => t.symbol), 'other ERC-20 tokens, by contract'],
		kinds: ['fee', 'transfer'],
		source: `Alchemy (${r.chain.alchemy.network}), with an Alchemy key`,
		version: CHAINS_VERSION,
		/** Offered only where this key is given: the API's own, or the person's own in the web UI and the CLI. */
		needs: 'alchemyKey',
		/** A request may name token contracts to put on the statement although only received (#93). */
		tokens: true,
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
 * The hosts the keyed blocks ask: for the API's list of outbound hosts, and
 * for the page's list and Content-Security-Policy, where the person's own
 * key is used.
 *
 * @param {{ whose?: string }} [o] whose key, for the text: "the server's" (default) or "your own"
 * @returns {import('./sources.js').Source[]}
 */
export function keyedSources({ whose = "the server's" } = {}) {
	return Object.keys(KEYED_BLOCKS).map((id) => {
		const chain = /** @type {any} */ (CHAINS[id]);
		return { origin: new URL(alchemyBaseUrl(chain.alchemy.network)).origin, chain: id, learns: /** @type {const} */ ('addresses'), what: `${chain.name} history and balances (Alchemy, with ${whose} key)` };
	});
}
