// The building blocks this service has, by chain: what the agent checks
// before it takes a job (GET /blocks).

import { block as near } from '@eigenbeleg/chain-near';

/** @type {Record<string, typeof near>} */
export const BLOCKS = { near };

/** What GET /blocks says about each block (no functions). */
export function describeBlocks() {
	return Object.values(BLOCKS).map(({ read: _read, isAddress: _is, probe: _probe, ...rest }) => rest);
}

/** @type {Map<string, { at: number, result: Record<string, unknown> }>} */
const checks = new Map();

/**
 * Runs a block's live check, at most every ten minutes per chain.
 *
 * @param {string} chain
 * @param {{ fetch?: typeof fetch, nearblocksKey?: string, probeDay?: string }} [deps]
 */
export async function checkBlock(chain, deps = {}) {
	const block = BLOCKS[chain];
	if (!block) return { ok: false, chain, error: 'no building block for this chain' };
	const cached = checks.get(chain);
	if (cached && Date.now() - cached.at < 600_000) return cached.result;
	let result;
	try {
		const r = await block.probe({ fetch: deps.fetch, apiKey: deps.nearblocksKey, day: deps.probeDay });
		result = { ok: true, chain, version: block.version, ...r, checkedAt: new Date().toISOString() };
	} catch (e) {
		result = { ok: false, chain, version: block.version, error: String(/** @type {Error} */ (e).message).slice(0, 200), checkedAt: new Date().toISOString() };
	}
	checks.set(chain, { at: Date.now(), result });
	return result;
}
