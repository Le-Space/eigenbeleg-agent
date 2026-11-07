// SPDX-License-Identifier: AGPL-3.0-or-later
// Ethereum and Base for the Eigenbeleg: what an own address paid and
// received – ETH, and the tokens @le-space/chains lists for the chain (USDC,
// and ALEPH, the token Aleph Cloud's credits and storage are paid with) –
// and the gas of every transaction it sent. The reading is @le-space/chains'
// EVM reader through Alchemy (shared with Le Space Belege); this file keeps
// what the Eigenbeleg reads differently (the gas goes to the network, also a
// failed transaction's; which assets are priced) and the period.
//
// They need an Alchemy key, and the key never reaches a browser: the blocks
// are offered only where one is configured (the API's ALCHEMY_KEY; see
// keyed.js), and the key travels as a parameter of each read, never in a
// descriptor, an answer or a log. Without a key the reader would fall back to
// Blockscout, which answers only a few requests per half hour and IP; these
// adapters refuse instead.

import { derivedStatement, fromWalletEntry, sortEntries } from '@le-space/ledger';
import { CHAINS } from '@le-space/chains/registry';
import { createEvmClient, isEvmAddress, toChecksumAddress } from '@le-space/chains/evm';
import { alchemyBaseUrl, isAlchemyKey } from '@le-space/chains/alchemy';

/** Market prices for the assets the chains list (ETH, USDC, ALEPH). */
const PRICE_AS = /** @type {Record<string, string>} */ ({ ETH: 'ETH', USDC: 'USDC', ALEPH: 'ALEPH' });

/** @param {unknown} key @returns {string} */
function needKey(key) {
	if (!isAlchemyKey(key)) throw new Error('this block needs an Alchemy key on the server (ALCHEMY_KEY)');
	return /** @type {string} */ (key);
}

/**
 * The adapter for one EVM chain of the registry that Alchemy serves.
 *
 * @param {'ethereum' | 'base'} id
 */
export function evmReader(id) {
	const chain = /** @type {any} */ (CHAINS[id]);
	if (chain?.kind !== 'evm' || !chain.alchemy) throw new Error(`no EVM chain ${id} with Alchemy`);
	const network = `${chain.name}-Netzwerk (Gas)`;

	/**
	 * Belege's WalletEntry → the Eigenbeleg's ledger entry; the gas goes to the network,
	 * and is paid also when the transaction failed.
	 *
	 * @param {import('@le-space/ledger/wallet-entry').WalletEntry} e
	 * @param {string} account
	 */
	const toLedger = (e, account) => {
		const fee = e.type === 'fee';
		return fromWalletEntry(
			e,
			{ chain: chain.id, network: 'mainnet', account, priceAs: PRICE_AS[e.asset] ?? '' },
			{
				counterparty: fee ? chain.id : String(e.counterparty ?? ''),
				counterpartyLabel: fee ? network : String(e.counterpartyLabel ?? ''),
				success: fee ? true : e.success !== false
			}
		);
	};

	/** @param {{ account: string, fetch?: typeof fetch, alchemyKey?: string }} p */
	const history = async ({ account, fetch = globalThis.fetch, alchemyKey }) => {
		if (!isEvmAddress(account)) throw new Error(`not an ${chain.name} address (0x and 40 hex digits)`);
		const key = needKey(alchemyKey);
		const client = createEvmClient({ fetch, alchemy: { key: async () => key } });
		const r = await client.history({ chain, address: account, endpoints: chain.endpoints });
		return { all: sortEntries(r.entries.map((/** @type {any} */ e) => toLedger(e, account))), balances: r.balances };
	};

	return {
		chain,
		toLedger,
		/** @param {{ account: string, from: string, to: string, fetch?: typeof fetch, alchemyKey?: string }} p */
		read: async (p) => (await history(p)).all.filter((e) => e.date >= p.from && e.date <= p.to),
		/** Balances derived from today's balance less the movements since, as for Akash. @param {{ account: string, from: string, to: string, fetch?: typeof fetch, alchemyKey?: string }} p */
		statement: async (p) => {
			const { all, balances } = await history(p);
			return derivedStatement(all, balances, p.from, p.to);
		},
		/** Alchemy answers for the chain with this key. @param {{ fetch?: typeof fetch, alchemyKey?: string }} [p] */
		probe: async ({ fetch = globalThis.fetch, alchemyKey } = {}) => {
			const key = needKey(alchemyKey);
			// The key is in the URL: no message here names the URL or passes on fetch's own.
			const res = await fetch(`${alchemyBaseUrl(chain.alchemy.network)}/${key}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
			}).catch(() => null);
			if (!res) throw new Error('Alchemy is not reachable');
			if (!res.ok) throw new Error(`Alchemy answered ${res.status}`);
			const body = await res.json().catch(() => null);
			const served = typeof body?.result === 'string' && /^0x[0-9a-f]+$/i.test(body.result) ? Number(BigInt(body.result)) : null;
			if (served !== chain.chainId) throw new Error(`Alchemy does not serve ${chain.name} (${chain.chainId}) here`);
			return { sample: `${chain.alchemy.network} eth_chainId`, entries: 1 };
		},
		isAddress: isEvmAddress,
		/** One spelling per account: the EIP-55 checksum. @param {string} a */
		canonical: (a) => toChecksumAddress(a)
	};
}
