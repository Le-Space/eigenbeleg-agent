// The Cosmos SDK chains this block reads, and their explorers. A trimmed
// copy of the Cosmos part of Le-Space/belege bridge/src/chains/registry.js
// (relicensed MIT by its rights holder, Le Space UG, 2026-11-06).

/**
 * @typedef {object} Explorer
 * @property {string} name
 * @property {string} tx with {tx}
 * @property {string} address with {address}
 */

/**
 * @typedef {object} CosmosChain
 * @property {string} id
 * @property {'cosmos'} kind
 * @property {string} name
 * @property {string} chainId
 * @property {string} bech32Prefix
 * @property {string} nativeDenom
 * @property {Record<string, { symbol: string, decimals: number }>} denoms
 * @property {{ rpc: string, rest: string, indexer?: string }} endpoints
 * @property {Explorer} explorer
 */

/** @type {Record<string, CosmosChain>} */
export const CHAINS = {
	akash: {
		id: 'akash',
		kind: 'cosmos',
		name: 'Akash',
		chainId: 'akashnet-2',
		bech32Prefix: 'akash',
		nativeDenom: 'uakt',
		denoms: { uakt: { symbol: 'AKT', decimals: 6 } },
		// Public Akash nodes are pruned; older history comes from the Akash
		// Console indexer (vendor/akash-console.js).
		endpoints: {
			rpc: 'https://akash-rpc.publicnode.com',
			rest: 'https://akash-rest.publicnode.com',
			indexer: 'https://console-api.akash.network'
		},
		explorer: {
			name: 'Mintscan',
			tx: 'https://www.mintscan.io/akash/transactions/{tx}',
			address: 'https://www.mintscan.io/akash/accounts/{address}'
		}
	}
};

/** @param {Explorer} explorer @param {string} tx */
export const txUrl = (explorer, tx) => explorer.tx.replace('{tx}', encodeURIComponent(tx));
/** @param {Explorer} explorer @param {string} address */
export const addressUrl = (explorer, address) => explorer.address.replace('{address}', encodeURIComponent(address));
