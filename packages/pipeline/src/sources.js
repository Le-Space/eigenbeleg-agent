// SPDX-License-Identifier: AGPL-3.0-or-later
// Every host the pipeline asks, and what it learns: the web UI shows this list
// before the first request and builds its Content-Security-Policy from it, so
// the page can reach no other host. A test holds it against the URLs in the
// packages. Explorer links (nearblocks.io, mintscan.io, filfox.info/en,
// explorer.aleph.cloud) are only printed on the documents, never fetched.

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
		{ origin: 'https://filfox.info', chain: 'filecoin', learns: 'addresses', what: 'Filecoin messages and balances; for Filecoin Pay the token transfers when Blockscout does not answer (Filfox)' },
		{ origin: 'https://api.goldsky.com', chain: 'filecoin-pay', learns: 'addresses', what: "Filecoin Pay settlements and balance (the makers' index, a subgraph at Goldsky)" },
		{ origin: 'https://filecoin.blockscout.com', chain: 'filecoin-pay', learns: 'addresses', what: 'Filecoin Pay: what was paid in and taken out (the contract\'s events at Blockscout)' },
		{ origin: 'https://api2.aleph.im', chain: 'aleph', learns: 'addresses', what: 'Aleph Cloud credit history and balance (Aleph API)' },
		{ origin: 'https://api.kraken.com', chain: 'rates', learns: 'assets', what: 'EUR rates where CoinGecko has none (Kraken, the day\'s open)' },
		{ origin: 'https://api.coingecko.com', chain: 'rates', learns: 'assets', what: 'EUR rates (CoinGecko, the price at 00:00 UTC)' },
		{ origin: 'https://data-api.ecb.europa.eu', chain: 'rates', learns: 'assets', what: 'EUR per USD, for Aleph credits (ECB reference rate)' }
	];
}
