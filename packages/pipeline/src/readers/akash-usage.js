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
	const deployments = await createAkashDeploymentsClient({ fetch }).deployments({ address: account, rest, indexer });
	return months.flatMap((month) => akashUsageEntries({ address: account, month, deployments }));
}
