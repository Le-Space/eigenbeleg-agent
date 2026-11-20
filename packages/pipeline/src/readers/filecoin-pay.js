// SPDX-License-Identifier: AGPL-3.0-or-later
// Filecoin Pay for the Eigenbeleg: what a payer's balance in the payment
// contract of Filecoin Onchain Cloud did in one month, for a
// Verbrauchsauszug (monthly usage statement). Storage there is not paid by a
// wallet's transfers: the wallet pays USDFC into the contract, and the
// contract pays the storage providers out of that balance over "rails",
// settled from time to time. No provider sends an invoice, and a wallet's
// Kontoauszug shows only the paying in.
//
// The reading is @le-space/chains' Filecoin Pay reader (shared with Le
// Space Belege): settlements and the balance from the index the makers of
// Filecoin Pay keep (a public subgraph at Goldsky), what was paid in and
// taken out from the contract's events at Blockscout – from Blockscout alone
// when the index does not answer. Both answer browsers. No key: Blockscout
// then allows about ten requests and none for minutes after; a statement
// needs two. When Blockscout does not answer, the reader falls back to
// Filfox's token transfers, which miss what another address paid into the
// balance: this block then gives no statement and says to try again.
//
// Only whole, finished months. A settlement is consumption billed from a
// prepaid balance: it has no single payment an Eigenbeleg could stand for,
// so this block gives the statement only. Opening and closing balance: the
// balance now less what came and went since the month began or ended, so
// `method: 'derived'`.
//
// Limits, printed on the statement (@le-space/eigenbeleg's note): only
// USDFC; what the payer itself earns over rails is not read; a settlement
// pays up to the moment it names, so a month's settlements need not cover
// exactly that month.

import { createFilecoinPayClient, filecoinPayEntries, payerAddress } from '@le-space/chains/filecoin-pay';

export const ASSET = 'USDFC';

/** A payer: an account a contract can hold a balance for, `0x…` or its `f410f…`. @param {string} a */
export const isAddress = (a) => payerAddress(a) !== null;

/** One spelling per payer: the `0x…` form in lower case, as the entries name the account. @param {string} a */
export const canonical = (a) => /** @type {string} */ (payerAddress(a));

/**
 * @param {object} p
 * @param {string} p.account 0x… or f410f…
 * @param {string} p.from YYYY-MM-01
 * @param {string} p.to the month's last day
 * @param {typeof fetch} [p.fetch]
 * @param {{ index?: string, filfox?: string, blockscout?: string }} [p.endpoints] instead of the reader's own
 * @param {() => Date} [p.now]
 */
export async function statementFilecoinPay({ account, from, to, fetch = globalThis.fetch, endpoints, now }) {
	if (!isAddress(account)) throw new Error('not a Filecoin Pay payer (0x and 40 hex digits, or f410f…)');
	const month = from.slice(0, 7);
	if (!from.endsWith('-01') || to.slice(0, 7) !== month) throw new Error('Filecoin Pay: one whole month');
	// No rates here: the pipeline values the entries (USDFC as USDC, a dollar stablecoin).
	const client = createFilecoinPayClient({ fetch, ...(now ? { now } : {}) });
	const st = await client.statement({ address: account, month, ...(endpoints ? { endpoints } : {}) });
	// Blockscout did not answer: the reader then takes paid in and taken out from the payer's own
	// transfers, and what another address paid into the balance is missing – the balances may be off,
	// and the statement has no place to say so. No statement rather than one that may be wrong.
	if (st.movementsFrom === 'transfers') throw new Error('Filecoin Pay: Blockscout did not answer (without a key it allows few requests); try again in a few minutes');
	return {
		entries: filecoinPayEntries(st),
		opening: { [ASSET]: st.opening },
		closing: { [ASSET]: st.closing },
		method: /** @type {'derived'} */ ('derived'),
		at: null
	};
}

/** @param {Parameters<typeof statementFilecoinPay>[0]} p */
export async function readFilecoinPay(p) {
	return (await statementFilecoinPay(p)).entries;
}

/** The zero address has no balance and no rails: the index answers that when it is up. */
export async function probe({ fetch = globalThis.fetch } = {}) {
	const month = new Date().toISOString().slice(0, 7);
	const st = await createFilecoinPayClient({ fetch }).statement({ address: `0x${'0'.repeat(40)}`, month, source: 'index' });
	return { sample: 'Filecoin Pay index: balance and rails of the zero address', entries: st.entries };
}
