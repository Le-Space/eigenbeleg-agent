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
// Only whole, finished months. Consumption billed from a prepaid balance has
// no single payment an Eigenbeleg could stand for; the purchase of credits
// has (issue #23): for each purchase row the reader adds the payment the
// account holder made, as a `sent` entry of kind `swap` (a token for
// credits) in USD, credits × Aleph's USD price per credit, valued at the
// ECB's rate of the day, with the paying transaction's hash and its explorer
// link on Ethereum or Base. The token amount paid is not in Aleph's data; it
// is checked through the hash. The credits bought stay the `received` row,
// with the same hash, so the Eigenbeleg shows both sides. Opening and
// closing balance: the balance now less what came and went since the month
// began or ended (Aleph's summary), so `method: 'derived'`.

import { entry, multiply, normalize, sortEntries } from '@le-space/ledger';
import { ALEPH_API, ALEPH_EXPLORER, alephEntries, createAlephClient } from '@le-space/chains/aleph';
import { isEvmAddress, toChecksumAddress } from '@le-space/chains/evm-address';
import { CHAINS } from '@le-space/chains/registry';
import { plain } from '@le-space/rates/aleph-credits';

export const ASSET = 'ALEPH-CREDIT';

/** Aleph's name for the chain a purchase was paid on → the registry's chain, for the explorer link. */
const PAID_ON = /** @type {Record<string, string>} */ ({ ETH: 'ethereum', BASE: 'base' });

/**
 * The payments behind a month's credit purchases: one `sent` entry per purchase, in USD.
 *
 * @param {Awaited<ReturnType<ReturnType<typeof createAlephClient>['statement']>>} st
 * @returns {import('@le-space/ledger').LedgerEntry[]}
 */
export function purchaseEntries(st) {
	return st.topUps
		.filter((t) => t.how === 'purchase' && t.price)
		.map((t, i) => {
			const explorer = t.chain ? CHAINS[/** @type {keyof typeof CHAINS} */ (PAID_ON[t.chain.toUpperCase()])]?.explorer : undefined;
			return entry({
				id: `aleph:${st.address}:purchase:${t.time}:${i}`,
				chain: 'aleph',
				network: 'mainnet',
				account: st.address,
				hash: t.txHash ?? '',
				height: 0,
				time: t.time,
				type: 'sent',
				kind: 'swap',
				asset: 'USD',
				contract: 'native',
				decimals: 6,
				amount: `-${normalize(multiply(plain(t.credits), /** @type {string} */ (t.price), 8))}`,
				counterparty: 'aleph',
				counterpartyLabel: `Aleph Cloud (Kauf von ${plain(t.credits)} Credits${t.token ? ` mit ${t.token}` : ''}${t.chain ? ` auf ${t.chain}` : ''})`,
				memo: `${plain(t.credits)} Credits × ${t.price} USD`,
				success: true,
				explorerUrl: explorer && t.txHash ? explorer.tx.replace('{tx}', encodeURIComponent(t.txHash)) : `${ALEPH_EXPLORER}${st.address}`,
				priceAs: 'USD'
			});
		});
}

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
		entries: sortEntries([...alephEntries(st), ...purchaseEntries(st)]),
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
