// SPDX-License-Identifier: AGPL-3.0-or-later
// The building blocks this service has, by chain: what the agent checks
// before it takes a job (GET /blocks).

import { block as near } from '@eigenbeleg/chain-near';
import { block as akash } from '@eigenbeleg/chain-cosmos';
import { block as filecoin } from '@eigenbeleg/chain-filecoin';

/** @type {Record<string, typeof near>} */
export const BLOCKS = { near, akash, filecoin };

/** What GET /blocks says about each block (no functions). */
export function describeBlocks() {
	return Object.values(BLOCKS).map(({ read: _read, isAddress: _is, probe: _probe, ...rest }) => rest);
}

/** @type {Map<string, { at: number, ttl: number, result: Promise<Record<string, unknown>> }>} */
const checks = new Map();

/**
 * Runs a block's live check: a pass is kept ten minutes, a failure one
 * minute (a rate limit should not stop agents for long). Callers that come
 * while a check runs share it, so the data source is asked once.
 *
 * @param {string} chain
 * @param {{ fetch?: typeof fetch, nearblocksKey?: string, probeDay?: string }} [deps]
 */
export function checkBlock(chain, deps = {}) {
	const block = Object.hasOwn(BLOCKS, chain) ? BLOCKS[chain] : null;
	if (!block) return Promise.resolve({ ok: false, chain, error: 'no building block for this chain' });
	const cached = checks.get(chain);
	if (cached && Date.now() - cached.at < cached.ttl) return cached.result;
	const entry = { at: Date.now(), ttl: Infinity, result: Promise.resolve(/** @type {Record<string, unknown>} */ ({})) };
	entry.result = (async () => {
		try {
			const r = await block.probe({ fetch: deps.fetch, apiKey: deps.nearblocksKey, day: deps.probeDay });
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
