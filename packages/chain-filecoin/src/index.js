// SPDX-License-Identifier: AGPL-3.0-or-later
// What an own Filecoin address paid and received in a period, as ledger
// entries. The reading is Le Space's Filfox reader from Belege (vendor/):
// every message's sends and receipts, and its miner fee plus burnt fee as
// one network fee; FIL and USDFC.

import { derivedStatement, entry, sortEntries } from '@eigenbeleg/ledger-core';
import { FILECOIN } from './chains.js';
import { createFilecoinClient, isFilecoinAddress, toFilecoinAddress } from './vendor/filecoin.js';

const PRICE_AS = { FIL: 'FIL', USDFC: 'USDC' };

/** Belege's WalletEntry → ledger entry. @param {any} e @param {string} account */
export function toLedger(e, account) {
	const fee = e.type === 'fee';
	return entry({
		id: `filecoin:${account}:${e.id}`,
		chain: 'filecoin',
		network: 'mainnet',
		account,
		hash: e.hash,
		height: e.height,
		time: e.time,
		type: e.type,
		kind: fee ? 'fee' : e.kind === 'swap' ? 'swap' : 'transfer',
		asset: e.asset,
		contract: e.contract ?? 'native',
		decimals: e.decimals,
		amount: e.amount,
		counterparty: fee ? 'filecoin' : String(e.counterparty ?? ''),
		counterpartyLabel: fee ? 'Filecoin-Netzwerk (Miner-Tip und verbrannte Gebühr)' : String(e.counterpartyLabel ?? ''),
		method: '',
		memo: '',
		success: fee ? true : e.success !== false,
		explorerUrl: e.explorerUrl,
		priceAs: e.listed === false ? '' : PRICE_AS[/** @type {keyof typeof PRICE_AS} */ (e.asset)] ?? ''
	});
}

/**
 * @param {{ account: string, from: string, to: string, fetch?: typeof fetch }} p
 */
async function history({ account, fetch = globalThis.fetch }) {
	if (!isFilecoinAddress(account)) throw new Error('not a valid Filecoin address');
	const address = toFilecoinAddress(account) ?? account;
	const { entries, balances } = await createFilecoinClient({ fetch }).history({ chain: /** @type {any} */ (FILECOIN), address, endpoints: FILECOIN.endpoints });
	return { all: sortEntries(entries.map((/** @type {any} */ e) => toLedger(e, address))), balances };
}

export async function readFilecoin({ account, from, to, fetch = globalThis.fetch }) {
	const { all } = await history({ account, fetch });
	return all.filter((e) => e.date >= from && e.date <= to);
}

/** For a Kontoauszug: balances derived from today's balance less the movements since (as for Akash). @param {{ account: string, from: string, to: string, fetch?: typeof fetch }} p */
export async function statementFilecoin(p) {
	const { all, balances } = await history(p);
	return derivedStatement(all, balances, p.from, p.to);
}

/** The storage market actor always exists: Filfox answers for it when the source is up. */
export async function probe({ fetch = globalThis.fetch } = {}) {
	const res = await fetch(`${FILECOIN.endpoints.api}/address/f05`);
	if (!res.ok) throw new Error(`Filfox answered ${res.status}`);
	const body = await res.json();
	if (!body?.balance) throw new Error('Filfox answered without a balance');
	return { sample: 'Filfox f05 (storage market actor)', entries: 1 };
}

export const block = {
	name: '@eigenbeleg/chain-filecoin',
	chain: 'filecoin',
	networks: ['mainnet'],
	assets: ['FIL', 'USDFC'],
	source: 'Filfox API; reader from Le-Space/belege',
	version: '0.1.0',
	read: readFilecoin,
	statement: statementFilecoin,
	probe,
	isAddress: isFilecoinAddress
};
