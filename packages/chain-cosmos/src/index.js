// SPDX-License-Identifier: AGPL-3.0-or-later
// What an own address on a Cosmos SDK chain (Akash) paid and received in a
// period, as ledger entries (@eigenbeleg/ledger-core).
//
// The reading itself is Le Space's reader from Belege (vendor/): the node's
// `tx_search` for everything it still has, the Akash Console indexer for
// what the pruned node has forgotten. This file maps its entries to the
// neutral format and keeps the period.

import { derivedStatement, entry, sortEntries } from '@eigenbeleg/ledger-core';
import { CHAINS } from './chains.js';
import { createCosmosClient } from './vendor/cosmos.js';
import { createAkashConsoleClient } from './vendor/akash-console.js';
import { isCosmosAddress } from './vendor/bech32.js';

/** Market prices for the native assets. */
const PRICE_AS = { AKT: 'AKT' };
const NETWORK_LABEL = { akash: 'Akash-Netzwerk (Gebühr an Validatoren)' };

/**
 * Belege's WalletEntry → ledger entry.
 *
 * @param {any} e
 * @param {{ chain: import('./chains.js').CosmosChain, account: string }} c
 */
export function toLedger(e, { chain, account }) {
	const escrow = /Escrow/i.test(String(e.counterpartyLabel ?? ''));
	const kind = e.type === 'fee' ? 'fee' : e.kind === 'ibc' ? 'transfer' : escrow ? 'escrow' : e.kind === 'swap' ? 'swap' : ['reward', 'stake'].includes(e.kind) ? e.kind : 'transfer';
	const fee = e.type === 'fee';
	return entry({
		id: `${chain.id}:${account}:${e.id}`,
		chain: chain.id,
		network: 'mainnet',
		account,
		hash: e.hash,
		height: e.height,
		time: e.time,
		type: e.type,
		kind,
		asset: e.asset,
		contract: e.listed === false ? String(e.contract ?? e.asset) : 'native',
		decimals: e.decimals,
		amount: e.amount,
		counterparty: fee ? chain.id : String(e.counterparty ?? ''),
		counterpartyLabel: fee ? NETWORK_LABEL[/** @type {keyof typeof NETWORK_LABEL} */ (chain.id)] ?? `${chain.name}-Netzwerk` : String(e.counterpartyLabel ?? ''),
		method: '',
		memo: String(e.memo ?? ''),
		// A failed transaction still pays its fee: the fee is a real payment.
		success: fee ? true : e.success !== false,
		explorerUrl: e.explorerUrl,
		priceAs: e.listed === false ? '' : PRICE_AS[/** @type {keyof typeof PRICE_AS} */ (e.asset)] ?? ''
	});
}

/**
 * @param {object} p
 * @param {string} p.account bech32 address
 * @param {string} [p.network] mainnet only
 * @param {string} p.from YYYY-MM-DD
 * @param {string} p.to YYYY-MM-DD
 * @param {typeof fetch} [p.fetch]
 * @param {string} [p.chainId] default akash
 * @param {Record<string, string>} [p.endpoints] instead of the chain's own, e.g. `indexer` behind a CORS proxy in a browser
 */
async function history({ account, from, fetch = globalThis.fetch, chainId = 'akash', endpoints: own }) {
	const chain = CHAINS[chainId];
	if (!chain) throw new Error(`unknown Cosmos chain ${chainId}`);
	if (!isCosmosAddress(account, chain.bech32Prefix)) throw new Error(`not a valid ${chain.name} address`);
	const endpoints = { ...chain.endpoints, ...own };
	const node = createCosmosClient({ fetch });
	const result = await node.history({ chain, address: account, endpoints });
	let entries = result.entries;
	if (result.history.pruned && endpoints.indexer && result.history.earliestTime && result.history.earliestTime.slice(0, 10) > from) {
		const older = await createAkashConsoleClient({ fetch }).history({ chain, address: account, indexer: endpoints.indexer, beforeHeight: result.history.earliestHeight });
		entries = [...older.entries, ...entries];
	}
	return { chain, all: sortEntries(entries.map((e) => toLedger(e, { chain, account }))), balances: result.balances };
}

/**
 * @param {object} p
 * @param {string} p.account bech32 address
 * @param {string} [p.network] mainnet only
 * @param {string} p.from YYYY-MM-DD
 * @param {string} p.to YYYY-MM-DD
 * @param {typeof fetch} [p.fetch]
 * @param {string} [p.chainId] default akash
 */
export async function readCosmos(p) {
	const { all } = await history(p);
	return all.filter((e) => e.date >= p.from && e.date <= p.to);
}

/**
 * For a Kontoauszug: the bookings of the period, and the balances before and
 * after it, derived from today's balance less every movement since. (Pruned
 * nodes keep no old balances.) What the reader cannot see – tokens coming back
 * when an unbonding ends, vesting – shifts the derived balances; the
 * statement says how they were made.
 *
 * @param {Parameters<typeof readCosmos>[0]} p
 */
export async function statementCosmos(p) {
	const { all, balances } = await history(p);
	return derivedStatement(all, balances, p.from, p.to);
}



/** Akash's community pool would do; any busy public module account works for the live check. */
export async function probe({ fetch = globalThis.fetch } = {}) {
	const res = await fetch(`${CHAINS.akash.endpoints.rpc}/status`);
	if (!res.ok) throw new Error(`Akash RPC answered ${res.status}`);
	const body = await res.json();
	if (body?.result?.node_info?.network !== CHAINS.akash.chainId) throw new Error('the Akash RPC belongs to another chain');
	return { sample: `${CHAINS.akash.endpoints.rpc} status`, entries: Number(body.result.sync_info?.latest_block_height ?? 0) > 0 ? 1 : 0 };
}

export const block = {
	name: '@eigenbeleg/chain-cosmos',
	chain: 'akash',
	networks: ['mainnet'],
	assets: ['AKT'],
	source: 'Akash RPC (PublicNode) + Akash Console indexer; reader from Le-Space/belege',
	version: '0.1.0',
	read: (/** @type {any} */ p) => readCosmos({ ...p, chainId: 'akash' }),
	statement: (/** @type {any} */ p) => statementCosmos({ ...p, chainId: 'akash' }),
	probe,
	isAddress: (/** @type {string} */ a) => isCosmosAddress(a, 'akash')
};
