// SPDX-License-Identifier: AGPL-3.0-or-later
// Production takes mainnet payments only.
//
// A production build is marked by a file the image writes (Dockerfile, final
// stage: apps/api/production). The container's root filesystem is read-only
// and the file belongs to root, so nothing in .env can take it away. Outside
// the image, EIGENBELEG_PRODUCTION=1 also marks production; an environment
// variable can only switch production on, never off.
//
// In production the server refuses to start with
//   - a testnet payment network in PAY_NETWORKS (near:testnet),
//   - PAYWALL=none (free),
//   - no PAY_NETWORKS at all (the development default is near:testnet),
//   - a payment RPC (NEAR_RPC_URL, EVM_RPC_*) that names a test network,
//   - the development flag EIGENBELEG_DEV_TESTNET,
//   - a payment in a chain's own coin (PAY_DOI=on with DOI_XPUB or DOI_PAY_TO, onchain.js) at another price than the
//     published one, with no confirmation, or through a server on this machine.
// Outside production a testnet payment network needs EIGENBELEG_DEV_TESTNET=1.
//
// The one place testnet USDC is taken in production is the test route,
// POST /testnet/eigenbeleg (paywall.js, createTestnetPaywall; TESTNET_PAY_TO):
// its own paywall with near:testnet only, its own recipient and relayer, and
// it sells testnet data only, every PDF marked TESTNET. It never shares a 402
// with the main route, so testnet USDC never buys a mainnet document.
// (Which chain and network a request *reads* is a different matter: the body's
// `network`; this file is about where customers pay.)

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_MARKER = fileURLToPath(new URL('../production', import.meta.url));
export const DEV_TESTNET_FLAG = 'EIGENBELEG_DEV_TESTNET';
export const PRODUCTION_FLAG = 'EIGENBELEG_PRODUCTION';

/** Payment networks that move no real money. */
export const TESTNET_NETWORKS = new Set(['near:testnet']);
const TEST_RPC = /testnet|sepolia|goerli|holesky|hoodi|devnet|localhost|127\.0\.0\.1/i;

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} [marker] the marker file; the default is the image's
 */
export function isProduction(env, marker = PRODUCTION_MARKER) {
	return existsSync(marker) || env[PRODUCTION_FLAG] === '1';
}

/**
 * Throws when the payment settings are not allowed. Called before anything listens.
 *
 * @param {object} c
 * @param {boolean} c.production
 * @param {boolean} c.allowTestnet EIGENBELEG_DEV_TESTNET=1
 * @param {string} c.mode PAYWALL
 * @param {string[]} c.networks PAY_NETWORKS, as given (empty: not set)
 * @param {string[]} [c.rpcUrls] NEAR_RPC_URL and the EVM_RPC_* values
 */
export function checkPayments({ production, allowTestnet, mode, networks, rpcUrls = [] }) {
	if (production) {
		const no = (/** @type {string} */ why) => {
			throw new Error(`production build: ${why}. Production takes mainnet payments only (apps/api/src/release.js).`);
		};
		if (allowTestnet) no(`${DEV_TESTNET_FLAG} is set; it is for development and tests only`);
		if (mode === 'none') no('PAYWALL=none would hand out documents for free');
		if ((mode === 'x402' || mode === 'near') && !networks.length) no('PAY_NETWORKS is not set; name the mainnet networks, e.g. near:mainnet,eip155:8453');
		const test = networks.filter((n) => TESTNET_NETWORKS.has(n));
		if (test.length) no(`PAY_NETWORKS has the testnet network ${test.join(', ')}`);
		const rpc = rpcUrls.filter((u) => TEST_RPC.test(u));
		if (rpc.length) no(`a payment RPC points at a test network or this machine (${rpc.length} of NEAR_RPC_URL, EVM_RPC_*)`);
		return;
	}
	const test = networks.filter((n) => TESTNET_NETWORKS.has(n));
	if (test.length && !allowTestnet) throw new Error(`PAY_NETWORKS has the testnet network ${test.join(', ')}: set ${DEV_TESTNET_FLAG}=1 to take test payments (development only; a production build refuses it)`);
}

/**
 * The settings of a payment in a chain's own coin (onchain.js). Throws when they are not allowed.
 *
 * @param {object} c
 * @param {boolean} c.production
 * @param {string} c.mode PAYWALL
 * @param {string} c.symbol the coin, for the messages
 * @param {string} c.price the price asked, a decimal of the coin
 * @param {string | undefined} c.published the published price (@eigenbeleg/pipeline/prices), if any
 * @param {number} c.confirmations
 * @param {string[]} c.servers the ElectrumX servers asked
 */
export function checkOnchain({ production, mode, symbol, price, published, confirmations, servers }) {
	if (mode !== 'x402' && mode !== 'near') throw new Error(`a payment in ${symbol} needs PAYWALL=x402: the ${symbol} offer stands in the same 402`);
	for (const u of servers) if (!/^wss?:\/\/[^\s/]+$/.test(u)) throw new Error(`${symbol}_ELECTRUM: ElectrumX servers as wss://host:port, comma-separated`);
	if (!production) return;
	const no = (/** @type {string} */ why) => {
		throw new Error(`production build: ${why} (apps/api/src/release.js).`);
	};
	if (published === undefined) no(`no price in ${symbol} is published yet; it is set in packages/pipeline/src/prices.js (COIN_PRICES), not in the environment`);
	if (price !== published) no(`the price is ${price} ${symbol}, the published one ${published} ${symbol}. Leave PRICE_${symbol} unset`);
	if (confirmations < 1) no(`${symbol}_CONFIRMATIONS is ${confirmations}; a payment counts after at least one block`);
	const bad = servers.filter((u) => !u.startsWith('wss://') || TEST_RPC.test(u));
	if (bad.length) no(`${bad.length} of the ${symbol}_ELECTRUM servers are unencrypted, on this machine or of a test network`);
}
