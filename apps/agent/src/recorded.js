// SPDX-License-Identifier: AGPL-3.0-or-later
//
// NEAR, answered from a recorded fixture, for the offline demo and the
// tests: NearBlocks' lists from the fixture, and an archival RPC whose blocks
// are one second apart and whose balance is an opening balance before the
// fixture's day and that balance plus the day's movements after it – what a
// real archival node would say for an account that did only this.

import { sum, toUnits, utf8 } from '@le-space/ledger';
import { mapRaw } from '@le-space/chains/near';

const T0 = Date.parse('2026-01-01T00:00:00Z');

/**
 * @param {{ account: string, network: 'mainnet' | 'testnet', txns: any[], ftTxns: any[] }} raw
 * @param {{ opening?: string, now?: number }} [o] NEAR before the day; now: the chain's head time in ms (default: the clock)
 * @returns {typeof fetch}
 */
export function recordedNear(raw, { opening = '25', now = Date.now() } = {}) {
	const entries = mapRaw(raw).filter((e) => e.asset === 'NEAR');
	const firstMs = Math.min(...entries.map((e) => Date.parse(e.time)));
	const closing = sum([opening, ...entries.map((e) => e.amount)]);
	const time = (/** @type {number} */ h) => (BigInt(T0) + BigInt(h) * 1000n) * 1_000_000n;
	const head = Math.floor((now - T0) / 1000) - 10;
	return /** @type {any} */ (
		async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
			const u = new URL(url);
			if (u.hostname.includes('nearblocks')) {
				const body = u.pathname.endsWith('/ft-txns') ? { data: raw.ftTxns ?? [], meta: {} } : { data: raw.txns, meta: {} };
				return new Response(JSON.stringify(body));
			}
			const { method, params } = JSON.parse(init.body ?? '{}');
			const ok = (/** @type {any} */ result) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
			if (method === 'block') {
				const h = params.finality ? head : Number(params.block_id);
				return ok({ header: { height: h, timestamp: String(time(h)) } });
			}
			if (method === 'query' && params.request_type === 'view_account') {
				const at = Number(time(Number(params.block_id)) / 1_000_000n);
				const amount = at < firstMs ? opening : closing;
				return ok({ amount: toUnits(amount, 24).toString(), locked: '0' });
			}
			if (method === 'query' && params.request_type === 'call_function') return ok({ result: [...utf8('"0"')] });
			return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { cause: { name: 'UNKNOWN' } } }));
		}
	);
}

