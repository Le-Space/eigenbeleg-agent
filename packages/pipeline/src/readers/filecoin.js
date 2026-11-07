// SPDX-License-Identifier: AGPL-3.0-or-later
// Filecoin for the Eigenbeleg. The reading is @le-space/chains' Filfox reader
// (shared with Le Space Belege): every message's sends and receipts, and its
// miner fee plus burnt fee as one network fee; FIL and USDFC. This file keeps
// what the Eigenbeleg reads differently (the fee goes to the network, which
// assets are priced) and the period.

import { derivedStatement, fromWalletEntry, sortEntries } from '@le-space/ledger';
import { createFilecoinClient, isFilecoinAddress, toFilecoinAddress } from '@le-space/chains/filecoin';
import { FILECOIN } from '@le-space/chains';

const PRICE_AS = { FIL: 'FIL', USDFC: 'USDC' };

/**
 * Belege's WalletEntry → the Eigenbeleg's ledger entry.
 *
 * @param {import('@le-space/ledger/wallet-entry').WalletEntry} e
 * @param {string} account
 */
export function toLedger(e, account) {
	const fee = e.type === 'fee';
	return fromWalletEntry(
		e,
		{ chain: 'filecoin', network: 'mainnet', account, priceAs: PRICE_AS[/** @type {keyof typeof PRICE_AS} */ (e.asset)] ?? '' },
		{
			kind: fee ? 'fee' : e.kind === 'swap' ? 'swap' : 'transfer',
			contract: e.contract ?? 'native',
			counterparty: fee ? 'filecoin' : String(e.counterparty ?? ''),
			counterpartyLabel: fee ? 'Filecoin-Netzwerk (Miner-Tip und verbrannte Gebühr)' : String(e.counterpartyLabel ?? ''),
			memo: '',
			success: fee ? true : e.success !== false
		}
	);
}

/** @param {{ account: string, fetch?: typeof fetch }} p */
async function history({ account, fetch = globalThis.fetch }) {
	if (!isFilecoinAddress(account)) throw new Error('not a valid Filecoin address');
	const address = toFilecoinAddress(account) ?? account;
	const { entries, balances } = await createFilecoinClient({ fetch }).history({ chain: /** @type {any} */ (FILECOIN), address, endpoints: FILECOIN.endpoints });
	return { all: sortEntries(entries.map((e) => toLedger(e, address))), balances };
}

/** @param {{ account: string, from: string, to: string, fetch?: typeof fetch }} p */
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

export { isFilecoinAddress as isAddress };
