// SPDX-License-Identifier: AGPL-3.0-or-later
// Every host the pipeline asks, and what it learns: the web UI shows this list
// before the first request and builds its Content-Security-Policy from it, so
// the page can reach no other host. A test holds it against the URLs in the
// packages. Explorer links (nearblocks.io, mintscan.io, filfox.info/en) are
// only printed on the documents, never fetched.

/**
 * @typedef {object} Source
 * @property {string} origin
 * @property {string} chain the chain it serves, or `rates`
 * @property {'addresses' | 'assets'} learns what the request carries besides the IP
 * @property {string} what
 */

/**
 * @param {{ akashIndexer?: string | null }} [o] akashIndexer: the CORS proxy in front of the Akash Console
 *   indexer for a browser, on a server the indexer itself; null: none (Akash is read only as far back as
 *   the public node keeps it)
 * @returns {Source[]}
 */
export function dataSources({ akashIndexer = 'https://console-api.akash.network' } = {}) {
	return [
		{ origin: 'https://api.nearblocks.io', chain: 'near', learns: 'addresses', what: 'NEAR mainnet transactions (NearBlocks)' },
		{ origin: 'https://api-testnet.nearblocks.io', chain: 'near', learns: 'addresses', what: 'NEAR testnet transactions (NearBlocks)' },
		{ origin: 'https://archival-rpc.mainnet.fastnear.com', chain: 'near', learns: 'addresses', what: 'NEAR mainnet balances (FastNEAR archival RPC)' },
		{ origin: 'https://archival-rpc.testnet.fastnear.com', chain: 'near', learns: 'addresses', what: 'NEAR testnet balances (FastNEAR archival RPC)' },
		{ origin: 'https://akash-rpc.publicnode.com', chain: 'akash', learns: 'addresses', what: 'Akash transactions (PublicNode RPC)' },
		{ origin: 'https://akash-rest.publicnode.com', chain: 'akash', learns: 'addresses', what: 'Akash balances (PublicNode REST)' },
		...(akashIndexer ? [{ origin: new URL(akashIndexer).origin, chain: 'akash', learns: /** @type {const} */ ('addresses'), what: 'older Akash history (Akash Console indexer)' }] : []),
		{ origin: 'https://filfox.info', chain: 'filecoin', learns: 'addresses', what: 'Filecoin messages and balances (Filfox)' },
		{ origin: 'https://api.kraken.com', chain: 'rates', learns: 'assets', what: 'EUR rates (Kraken)' },
		{ origin: 'https://api.coingecko.com', chain: 'rates', learns: 'assets', what: 'EUR rates where Kraken has none (CoinGecko)' }
	];
}
