// Ported from Le-Space/belege bridge/src/chains/evm.js (markSwaps only) at ed7f5f5 (AGPL-3.0 there).
// SPDX-License-Identifier: AGPL-3.0-or-later (as in Belege; rights holder: Le Space UG).
// Pre-hackathon code (baseline); see the README.

export function markSwaps(entries, unlisted, viaOf) {
	/** @type {Map<string, { gave: any[], got: any[], legs: any[] }>} */
	const byHash = new Map();
	const of = (/** @type {string} */ hash) => {
		let x = byHash.get(hash);
		if (!x) byHash.set(hash, (x = { gave: [], got: [], legs: [] }));
		return x;
	};
	/** @type {Map<string, any>} hash → its gas entry */
	const feeOf = new Map();
	for (const e of entries) {
		if (e.type === 'fee') feeOf.set(e.hash, e);
		if (e.type === 'fee' || e.kind !== 'transfer') continue;
		const x = of(e.hash);
		(e.amount.startsWith('-') ? x.gave : x.got).push({
			asset: e.asset,
			amount: e.amount.replace(/^-/, ''),
			listed: e.listed !== false
		});
		x.legs.push(e);
	}
	for (const u of unlisted) {
		const x = of(u.hash);
		(u.amount.startsWith('-') ? x.gave : x.got).push({
			asset: u.asset,
			amount: u.amount.replace(/^-/, ''),
			listed: false
		});
	}
	for (const [hash, x] of byHash) {
		if (!x.legs.length || !x.gave.length || !x.got.length) continue;
		const gaveAssets = new Set(x.gave.map((g) => g.asset));
		if (x.got.every((g) => gaveAssets.has(g.asset))) continue;
		// The gas belongs to the swap too: named in it, and its own entry says
		// which swap it paid for (it stays a fee of its own).
		const gas = feeOf.get(hash);
		const swap = {
			gave: x.gave,
			got: x.got,
			via: viaOf(hash),
			...(gas ? { fee: { asset: gas.asset, amount: gas.amount.replace(/^-/, '') } } : {})
		};
		for (const e of x.legs) {
			e.kind = 'swap';
			e.swap = swap;
		}
		if (gas) gas.swap = swap;
	}
}
