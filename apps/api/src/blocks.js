// The building blocks this service has, by chain: what the agent checks
// before it takes a job (GET /blocks).

import { block as near } from '@eigenbeleg/chain-near';

/** @type {Record<string, typeof near>} */
export const BLOCKS = { near };

/** What GET /blocks says about each block (no functions). */
export function describeBlocks() {
	return Object.values(BLOCKS).map(({ read: _read, isAddress: _is, ...rest }) => rest);
}
