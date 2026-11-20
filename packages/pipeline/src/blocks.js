// SPDX-License-Identifier: AGPL-3.0-or-later
// The building blocks this service has, by chain: what the agent checks
// before it takes a job (GET /blocks). The readers are @le-space/chains
// (Le-Space/belege, packages/chains), shared with Le Space Belege; a block
// here says what the Eigenbeleg makes of a chain: how to read a period, the
// balances for a Kontoauszug, a live check, and the address check that runs
// before anything is fetched.

import * as near from '@le-space/chains/near';
import * as akash from '@le-space/chains/akash';
import * as filecoin from '@le-space/chains/filecoin';
import * as aleph from './readers/aleph.js';
import * as filecoinPay from './readers/filecoin-pay.js';

/** The version of @le-space/chains the blocks are built on (a test holds it against the installed package). */
export const CHAINS_VERSION = '0.5.0';

/**
 * @typedef {object} Block
 * @property {string} name the module the reading comes from
 * @property {string} chain the id in requests and the web UI
 * @property {string[]} networks where payments can be read
 * @property {string[]} assets what the chain's fees and deposits are paid in
 * @property {string[]} kinds the kinds of payment the chain has for an Eigenbeleg, of fee, storage, transfer, call, swap (storage deposits exist on NEAR only; swap: Aleph's credit purchases); empty: no Eigenbeleg
 * @property {string[]} [defaultKinds] the kinds on the Eigenbeleg unless the request says (DEFAULT_KINDS when not given)
 * @property {string} source which API
 * @property {string} version
 * @property {(p: any) => Promise<import('@le-space/ledger').LedgerEntry[]>} read a period's entries, oldest first
 * @property {(p: any) => Promise<any>} [statement] the entries and the balances before and after the period
 * @property {(o?: any) => Promise<{ sample: string, entries: number }>} probe a live check against public data
 * @property {(a: string) => boolean} isAddress before anything is fetched
 * @property {(a: string) => string} [canonical] one spelling per account, where the source has one
 * @property {string[]} [documents] the documents it gives, when not all (Filecoin Pay: the statement only)
 * @property {'month'} [period] reads whole finished months only
 * @property {string} [statementPrefix] the statement's number prefix, when not KA (VA: a Verbrauchsauszug, `isUsageStatement`)
 * @property {'alchemyKey'} [needs] a key only the server has (keyed.js); such a block is never in BLOCKS
 */

/** @type {Record<string, Block>} */
export const BLOCKS = {
	near: {
		name: '@le-space/chains/near',
		chain: 'near',
		networks: ['mainnet', 'testnet'],
		assets: ['NEAR', 'NEP-141 tokens (USDC, USDT, …)'],
		kinds: ['fee', 'storage', 'transfer', 'call'],
		source: 'NearBlocks API v3; balances from the FastNEAR archival RPC',
		version: CHAINS_VERSION,
		read: near.readNear,
		statement: near.statementNear,
		probe: near.probe,
		isAddress: near.isAccountId
	},
	akash: {
		name: '@le-space/chains/cosmos',
		chain: 'akash',
		networks: ['mainnet'],
		assets: ['AKT'],
		kinds: ['fee', 'transfer'],
		source: 'Akash RPC (PublicNode) + Akash Console indexer',
		version: CHAINS_VERSION,
		read: akash.readAkash,
		statement: akash.statementAkash,
		probe: akash.probe,
		isAddress: akash.isAddress
	},
	filecoin: {
		name: '@le-space/chains/filecoin',
		chain: 'filecoin',
		networks: ['mainnet'],
		assets: ['FIL', 'USDFC'],
		kinds: ['fee', 'transfer'],
		source: 'Filfox API',
		version: CHAINS_VERSION,
		read: filecoin.readFilecoin,
		statement: filecoin.statementFilecoin,
		probe: filecoin.probe,
		isAddress: filecoin.isFilecoinAddress
	},
	'filecoin-pay': {
		name: '@le-space/chains/filecoin-pay',
		chain: 'filecoin-pay',
		networks: ['mainnet'],
		assets: ["USDFC (the balance in the Filecoin Pay contract of Filecoin Onchain Cloud, by the payer's address)"],
		// A settlement is consumption from a prepaid balance, no payment of its own: no Eigenbeleg.
		kinds: [],
		source: "Filecoin Pay index (Goldsky subgraph), Blockscout, Filfox; no key. EUR at the day's USDC rate",
		version: CHAINS_VERSION,
		// One whole finished month: the Verbrauchsauszug (VA-…) of what the contract settled with which provider.
		documents: ['kontoauszug'],
		period: 'month',
		statementPrefix: 'VA',
		read: filecoinPay.readFilecoinPay,
		statement: filecoinPay.statementFilecoinPay,
		probe: filecoinPay.probe,
		isAddress: filecoinPay.isAddress,
		canonical: filecoinPay.canonical
	},
	aleph: {
		name: '@le-space/chains/aleph',
		chain: 'aleph',
		networks: ['mainnet'],
		assets: ['ALEPH-CREDIT (Aleph Cloud credits, by the Ethereum address)', 'USD (what a credit purchase is worth)'],
		// The purchase of credits with a token: a payment of its own, so an Eigenbeleg (issue #23). Usage has none.
		kinds: ['swap'],
		defaultKinds: ['swap'],
		source: 'Aleph API, no key; EUR per USD from the ECB',
		version: CHAINS_VERSION,
		// One whole finished month: the Verbrauchsauszug (VA-…) first, an Eigenbeleg per credit purchase too.
		documents: ['kontoauszug', 'eigenbelege', 'beide'],
		period: 'month',
		statementPrefix: 'VA',
		read: aleph.readAleph,
		statement: aleph.statementAleph,
		probe: aleph.probe,
		isAddress: aleph.isAddress,
		canonical: aleph.canonical
	}
};

/**
 * Whether a chain's statement is a Verbrauchsauszug (consumption from a prepaid balance: Aleph credits,
 * Filecoin Pay) rather than a Kontoauszug – for the words of a mail or a page; the document itself says it.
 *
 * @param {string} chain
 * @param {Record<string, Block>} [blocks]
 */
export const isUsageStatement = (chain, blocks = BLOCKS) => Object.hasOwn(blocks, chain) && blocks[chain].statementPrefix === 'VA';

/**
 * What GET /blocks says about each block (no functions).
 *
 * @param {Record<string, Block>} [blocks] what this side serves: BLOCKS, or on the API `blocksFor(deps)` (keyed.js)
 */
export function describeBlocks(blocks = BLOCKS) {
	return Object.values(blocks).map((b) => Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v !== 'function')));
}

/** @type {Map<string, { at: number, ttl: number, result: Promise<Record<string, unknown>> }>} */
const checks = new Map();

/**
 * Runs a block's live check: a pass is kept ten minutes, a failure one
 * minute (a rate limit should not stop agents for long). Callers that come
 * while a check runs share it, so the data source is asked once.
 *
 * @param {string} chain
 * @param {{ fetch?: typeof fetch, nearblocksKey?: string, probeDay?: string, blocks?: Record<string, Block>, alchemyKey?: string }} [deps]
 *   blocks: what this side serves (BLOCKS when not given); alchemyKey: the server's, only for a block that needs it
 */
export function checkBlock(chain, deps = {}) {
	const blocks = deps.blocks ?? BLOCKS;
	const block = Object.hasOwn(blocks, chain) ? blocks[chain] : null;
	if (!block) return Promise.resolve({ ok: false, chain, error: 'no building block for this chain' });
	const cached = checks.get(chain);
	if (cached && Date.now() - cached.at < cached.ttl) return cached.result;
	const entry = { at: Date.now(), ttl: Infinity, result: Promise.resolve(/** @type {Record<string, unknown>} */ ({})) };
	entry.result = (async () => {
		try {
			const r = await block.probe({ fetch: deps.fetch, apiKey: deps.nearblocksKey, day: deps.probeDay, ...(block.needs === 'alchemyKey' ? { alchemyKey: deps.alchemyKey } : {}) });
			entry.at = Date.now();
			entry.ttl = 600_000;
			return { ok: true, chain, version: block.version, ...r, checkedAt: new Date().toISOString() };
		} catch (e) {
			entry.at = Date.now();
			entry.ttl = 60_000;
			return { ok: false, chain, version: block.version, error: String(/** @type {Error} */ (e).message).slice(0, 200), checkedAt: new Date().toISOString() };
		}
	})();
	checks.set(chain, entry);
	return entry.result;
}
