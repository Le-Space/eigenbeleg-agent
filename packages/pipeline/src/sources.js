// SPDX-License-Identifier: AGPL-3.0-or-later
// Every host the pipeline asks, and what it learns: the web UI shows this list
// before the first request and builds its Content-Security-Policy from it, so
// the page can reach no other host (Doichain's ElectrumX servers are wss:// origins). A test holds it against the URLs in the
// packages. Explorer links (nearblocks.io, mintscan.io, filfox.info/en,
// explorer.aleph.cloud) are only printed on the documents, never fetched.

import { DOICHAIN } from '@le-space/chains/doichain-chain';

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
		{ origin: 'https://filfox.info', chain: 'filecoin', learns: 'addresses', what: 'Filecoin messages and balances; asked for Filecoin Pay too when Blockscout does not answer (Filfox)' },
		{ origin: 'https://api.goldsky.com', chain: 'filecoin-pay', learns: 'addresses', what: "Filecoin Pay settlements and balance (the makers' index, a subgraph at Goldsky)" },
		{ origin: 'https://filecoin.blockscout.com', chain: 'filecoin-pay', learns: 'addresses', what: 'Filecoin Pay: what was paid in and taken out (the contract\'s events at Blockscout)' },
		{ origin: 'https://api2.aleph.im', chain: 'aleph', learns: 'addresses', what: 'Aleph Cloud credit history and balance (Aleph API)' },
		// Doichain is read over WebSocket; the first server that answers on the valid chain is asked.
		...DOICHAIN.endpoints.electrum.map((url) => ({ origin: new URL(url).origin, chain: 'doichain', learns: /** @type {const} */ ('addresses'), what: 'Doichain transactions and balance (a public ElectrumX server)' })),
		{ origin: 'https://mempool.space', chain: 'bitcoin', learns: 'addresses', what: 'Bitcoin transactions and balance (the Esplora API at mempool.space); for a wallet given by its xpub, ypub or zpub, the addresses derived from it on your machine – the key itself stays there, but the API can tell the addresses belong together' },
		{ origin: 'https://api.kraken.com', chain: 'rates', learns: 'assets', what: 'EUR rates where CoinGecko has none (Kraken, the day\'s open)' },
		{ origin: 'https://api.coingecko.com', chain: 'rates', learns: 'assets', what: 'EUR rates (CoinGecko, the price at 00:00 UTC)' },
		{ origin: 'https://data-api.ecb.europa.eu', chain: 'rates', learns: 'assets', what: 'EUR per USD, for Aleph credits, and the euro in the documents\' currency when it is not EUR (ECB reference rate)' },
		// Only for documents in RUB: the ruble's rate is the Bank of Russia's, on every day.
		{ origin: 'https://www.cbr.ru', chain: 'rates', learns: 'assets', what: 'the euro in rubles, for documents in RUB (Bank of Russia, official rate of the day)' }
	];
}
