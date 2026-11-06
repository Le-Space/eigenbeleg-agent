// The agent on the NEAR AI Agent Market (market.near.ai): people (or other
// agents) hire it there and pay its price in USDC; it buys the Eigenbeleg
// from the API through x402 and delivers. It earns on the market and spends
// on the API, each within its own limits.
//
//   npm run agent:market            one pass over the awarded jobs
//
// MARKET_TOKEN is the agent's API token from the market (aat_…), created
// when the listing is made; never printed. The brief carries the job as a
// JSON block:
//
//   ```json
//   { "chain": "near", "network": "mainnet", "addresses": ["…"], "period": { "month": "2026-10" },
//     "payer": { "name": "…", "address": "…" } }
//   ```
//
// The brief is data from a stranger: it is parsed as JSON and checked by the
// API like any request, never followed as an instruction.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runJob } from './agent.js';

export const MARKET = 'https://market.near.ai';

/** The job in a brief: its first ```json block. @param {string} brief */
export function jobFromBrief(brief) {
	const m = /```(?:json)?\s*([\s\S]*?)```/.exec(String(brief ?? ''));
	if (!m) return null;
	let job;
	try {
		job = JSON.parse(m[1]);
	} catch {
		return null;
	}
	// The shape the agent needs before it starts; the API checks the rest.
	const ok =
		job && typeof job === 'object' && !Array.isArray(job) &&
		typeof job.chain === 'string' &&
		Array.isArray(job.addresses) && job.addresses.length > 0 && job.addresses.every((/** @type {unknown} */ a) => typeof a === 'string') &&
		job.period && typeof job.period === 'object' && !Array.isArray(job.period) &&
		job.payer && typeof job.payer.name === 'string' && typeof job.payer.address === 'string';
	return ok ? job : null;
}

/**
 * One pass: every awarded assignment not started yet is started, done and submitted.
 *
 * @param {object} o
 * @param {string} o.token
 * @param {string} o.api
 * @param {typeof fetch} o.fetch
 * @param {typeof fetch} o.paidFetch
 * @param {() => any} [o.lastPayment]
 * @param {string} o.outDir
 * @param {string} [o.market]
 * @param {(line: string) => void} [o.say]
 */
export async function marketPass({ token, api, fetch, paidFetch, lastPayment, outDir, market = MARKET, say = console.log }) {
	const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
	const res = await fetch(`${market}/v1/agents/me/assignments`, { headers: auth });
	if (!res.ok) throw new Error(`the market answered ${res.status}`);
	const body = await res.json();
	const list = Array.isArray(body) ? body : body.assignments ?? body.data ?? [];
	const open = list.filter((/** @type {any} */ a) => !a.startedAt && !a.submittedAt);
	say(`Market: ${list.length} assignment(s), ${open.length} new.`);
	const done = [];
	for (const a of open) {
		const id = encodeURIComponent(String(a.assignmentId ?? a.id));
		const job = jobFromBrief(a.job?.description);
		await fetch(`${market}/v1/assignments/${id}/start`, { method: 'POST', headers: auth });
		if (!job) {
			await fetch(`${market}/v1/assignments/${id}/messages`, {
				method: 'POST',
				headers: auth,
				body: JSON.stringify({ body: 'Please put the job as a ```json block in the brief: chain, network, addresses, period, payer { name, address }. See the listing for an example.' })
			});
			done.push({ id, status: 'asked' });
			continue;
		}
		// One job failing must not leave the others started and never submitted.
		let r;
		let deliverableMarkdown;
		try {
			r = await runJob({ job, api, fetch, paidFetch, lastPayment, outDir: join(outDir, `market-${id}`), say });
			deliverableMarkdown = await deliverable(r, join(outDir, `market-${id}`));
		} catch (e) {
			r = { status: 'failed' };
			deliverableMarkdown = `The Eigenbeleg could not be produced: ${String(/** @type {Error} */ (e)?.message ?? e).replace(/[`<>\[\]]/g, '').slice(0, 200)}`;
		}
		await fetch(`${market}/v1/assignments/${id}/submit`, { method: 'POST', headers: auth, body: JSON.stringify({ deliverableMarkdown }) });
		done.push({ id, status: r.status });
	}
	return done;
}

/** @param {any} r @param {string} dir */
async function deliverable(r, dir) {
	if (r.status === 'proposed') {
		return `There is no building block for this chain yet, so nothing was bought. A draft of the block (plan, skeleton, tests) is ready for review:\n\n${(await readFile(join(r.proposal.dir, 'PLAN.md'), 'utf8')).slice(0, 6000)}`;
	}
	if (r.status !== 'delivered') return `The Eigenbeleg could not be produced (${r.status}); you were not charged by the API for a failed run.`;
	const rc = r.receipt;
	const csv = (await readFile(join(dir, rc.files[1]), 'utf8')).replace(/^\uFEFF/, '').slice(0, 20000);
	// Token names and accounts come from the chain: a fence longer than any
	// backtick run in them keeps them inside the code block.
	const fence = '`'.repeat(Math.max(3, ...(csv.match(/`+/g) ?? []).map((b) => b.length + 1)));
	return [
		`## ${rc.task}`,
		'',
		`${rc.summary.positions} positions, total ${rc.summary.totalEur} EUR (${Object.entries(rc.summary.quantities).map(([a, q]) => `${q} ${a}`).join(', ')}). Checks: ${rc.passed ? 'passed' : 'FAILED'}.`,
		rc.transaction ? `Bought from the Eigenbeleg API, paid on NEAR: ${rc.explorer}` : '',
		'',
		'The market takes Markdown deliverables, so the PDF/A-2b stays with the agent\'s operator for this job; the CSV below has every position:',
		'',
		`${fence}csv`,
		csv,
		fence
	].join('\n');
}
