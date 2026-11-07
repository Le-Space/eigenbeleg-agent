// SPDX-License-Identifier: AGPL-3.0-or-later
// Aleph Cloud for the Eigenbeleg: what an account's credits did in one
// month, for a Verbrauchsauszug (monthly usage statement). Aleph is no
// blockchain: the credits live in Aleph's own network, keyed by the
// account's Ethereum address, and are read from Aleph's public API (no key;
// it answers browsers with CORS headers). The reading is @le-space/chains'
// Aleph reader (shared with Le Space Belege): purchases and transfers in,
// transfers out, and each day's consumption per resource (kind `usage`, with
// the USD price per credit it is valued at, @le-space/rates/aleph-credits).
//
// Only whole, finished months, and only the statement: consumption billed
// from a prepaid balance has no single payment an Eigenbeleg could stand for.
// Opening and closing balance: the balance now less what came and went since
// the month began or ended (Aleph's summary), so `method: 'derived'`.

import { ALEPH_API, alephEntries, createAlephClient } from '@le-space/chains/aleph';
import { isEvmAddress, toChecksumAddress } from '@le-space/chains/evm';
import { plain } from '@le-space/rates/aleph-credits';

export const ASSET = 'ALEPH-CREDIT';

/** An Ethereum address, as Aleph keys its accounts. @param {string} a */
export const isAddress = (a) => isEvmAddress(a);

/** Aleph keys accounts by their EIP-55 checksum: the same address in any case is one account. @param {string} a */
export const canonical = (a) => toChecksumAddress(a);

/**
 * @param {object} p
 * @param {string} p.account 0x…
 * @param {string} p.from YYYY-MM-01
 * @param {string} p.to the month's last day
 * @param {typeof fetch} [p.fetch]
 * @param {{ api?: string }} [p.endpoints] instead of Aleph's own API
 * @param {() => Date} [p.now]
 */
export async function statementAleph({ account, from, to, fetch = globalThis.fetch, endpoints, now }) {
	if (!isAddress(account)) throw new Error('not an Ethereum address (0x and 40 hex digits)');
	const month = from.slice(0, 7);
	if (!from.endsWith('-01') || to.slice(0, 7) !== month) throw new Error('Aleph Cloud: one whole month');
	const client = createAlephClient({ fetch, ...(now ? { now } : {}) });
	const st = await client.statement({ address: account, month, api: endpoints?.api || ALEPH_API });
	return {
		entries: alephEntries(st),
		opening: { [ASSET]: plain(st.opening) },
		closing: { [ASSET]: plain(st.closing) },
		method: /** @type {'derived'} */ ('derived'),
		at: null
	};
}

/** @param {Parameters<typeof statementAleph>[0]} p */
export async function readAleph(p) {
	return (await statementAleph(p)).entries;
}

/** The zero address: Aleph answers its balance and summary when the API is up. */
export async function probe({ fetch = globalThis.fetch } = {}) {
	const [zero] = await createAlephClient({ fetch }).accounts({ addresses: [`0x${'0'.repeat(40)}`] });
	if (!zero || !Number.isFinite(zero.credits)) throw new Error('Aleph answered without a balance');
	return { sample: 'Aleph API: balance and credit summary of the zero address', entries: 1 };
}
