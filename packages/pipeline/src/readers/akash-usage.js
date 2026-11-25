// SPDX-License-Identifier: AGPL-3.0-or-later
// Akash for the monthly consumption Eigenbeleg (#116): what the wallet's
// deployments paid their providers (lease payouts from each deployment's
// escrow) in a finished month. The escrow deposit was a prepayment, a
// movement of the wallet on its Kontoauszug; the payouts are the expense, and
// no provider invoices them.
//
// The reading is @le-space/chains' (akash-deployments.js, shared with Le
// Space Belege's Akash usage statement): every deployment of the owner from
// an Akash node's REST API, closed ones too, with its escrow's `transferred`
// (paid to the providers so far) and the times of its creation and last
// settlement from the Akash Console indexer. The chain keeps the payouts per
// deployment in all, not per month: `usageInMonth` spreads them evenly over
// the deployment's time up to its last settlement – the same figure Belege
// shows for the month. ACT is valued at 1 USD (burn-mint) and the ECB's rate
// of the month's last day.
//
// Limits (said on the Eigenbeleg): an active deployment's payouts since its
// last settlement are not counted yet, and a later settlement spreads its
// total anew, so a month's share read later can differ; payouts in AKT (the
// escrows before ACT) are not read.

import { AKASH_CHAIN } from '@le-space/chains/cosmos-chains';
import { akashUsageEntries, createAkashDeploymentsClient } from '@le-space/chains/akash-deployments';

/**
 * @param {object} p
 * @param {string} p.account akash1…
 * @param {string[]} p.months YYYY-MM, finished ones
 * @param {typeof fetch} [p.fetch]
 * @param {Record<string, string>} [p.endpoints] instead of the chain's own (`rest`, `indexer`)
 * @returns {Promise<import('@le-space/ledger').LedgerEntry[]>}
 */
export async function akashUsage({ account, months, fetch = globalThis.fetch, endpoints }) {
	if (!months.length) return [];
	const { rest, indexer } = { ...AKASH_CHAIN.endpoints, ...endpoints };
	const client = createAkashDeploymentsClient({ fetch });
	// The block times come from the indexer. Without it (a browser without the CORS proxy) or when it does not
	// answer, a deployment has no times and usageInMonth would leave it out: a month's consumption would be
	// missing without a word. No Eigenbeleg rather than one that leaves out what was paid.
	if (!indexer) {
		const paid = (await client.deployments({ address: account, rest, indexer: 'http://indexer.invalid' }).catch(() => [])).some((d) => Number(d.transferred) > 0);
		if (paid) throw new Error('Akash: the deployments’ times come from the Akash Console indexer, which is not set here (in a browser: its CORS proxy); ask the API instead');
		return [];
	}
	const deployments = await client.deployments({ address: account, rest, indexer });
	if (deployments.some((d) => Number(d.transferred) > 0 && (!d.createdAt || !d.settledAt))) throw new Error('Akash: the Akash Console indexer did not answer for every deployment’s time; try again in a few minutes');
	return months.flatMap((month) => akashUsageEntries({ address: account, month, deployments }));
}
