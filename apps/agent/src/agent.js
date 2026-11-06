// SPDX-License-Identifier: AGPL-3.0-or-later
// A minimal agent that delivers Eigenbelege.
//
// It takes a job (chain, own addresses, period, payer), and
//   1. asks the API which building blocks exist (GET /blocks) and checks the
//      one for the job's chain against live data (GET /blocks/<chain>/check);
//   2. if there is none, or it fails its check, it does not buy anything: it
//      drafts the missing block as a pull request with tests (propose.js) and
//      stops – a person reviews and merges it;
//   3. otherwise it pays the API through x402 – never above its budget – and
//      gets the Eigenbeleg as PDF and CSV;
//   4. checks what it got (a PDF/A, a CSV whose positions match the summary)
//      and writes a receipt: what was bought, from whom, at what price, the
//      payment's transaction, and whether the work passed the check.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { proposeBlock } from './propose.js';

/**
 * @typedef {object} Job
 * @property {string} chain
 * @property {'mainnet' | 'testnet'} network
 * @property {string[]} addresses
 * @property {{ month?: string, from?: string, to?: string }} period
 * @property {{ name: string, address: string }} payer
 * @property {string} [number]
 * @property {string[]} [includeKinds]
 */

/**
 * @param {object} o
 * @param {Job} o.job
 * @param {string} o.api base URL of the Eigenbeleg API
 * @param {typeof fetch} o.fetch plain fetch, for the free endpoints
 * @param {typeof fetch} o.paidFetch fetch that pays x402 challenges within the budget
 * @param {string} o.outDir where the files and the receipt go
 * @param {(line: string) => void} [o.say]
 * @param {() => { payment?: any, settlement?: any }} [o.lastPayment] what the payer saw last
 */
export async function runJob({ job, api, fetch, paidFetch, outDir, say = console.log, lastPayment = () => ({}) }) {
	await mkdir(outDir, { recursive: true });
	say(`Job: Eigenbeleg for ${job.addresses.join(', ')} on ${job.chain} (${job.network}), ${job.period.month ?? `${job.period.from} – ${job.period.to}`}`);

	// 1. the building block
	const { blocks } = await (await fetch(`${api}/blocks`)).json();
	const block = blocks.find((/** @type {any} */ b) => b.chain === job.chain);
	if (!block) {
		say(`No building block for "${job.chain}". Nothing is bought; drafting one as a pull request instead.`);
		const proposal = await proposeBlock({ chain: job.chain, outDir, say });
		return { status: 'proposed', proposal };
	}
	say(`Building block: ${block.name} ${block.version} (${block.source}); checking it (GET /blocks/${job.chain}/check) …`);
	const check = await (await fetch(`${api}/blocks/${encodeURIComponent(job.chain)}/check`)).json();
	if (!check.ok) {
		say(`The block failed its check (${check.error ?? 'unknown'}). Nothing is bought; drafting a fix.`);
		const proposal = await proposeBlock({ chain: job.chain, outDir, say, reason: check.error });
		return { status: 'proposed', proposal };
	}
	say(`Block is current: read ${check.entries} entries from ${check.sample} at ${check.checkedAt}.`);

	// 2. pay and get it
	say('Asking the API (x402) …');
	const res = await paidFetch(`${api}/eigenbeleg`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...job, format: 'json' })
	});
	if (!res.ok) {
		const text = await res.text();
		say(`The API answered ${res.status}: ${text.slice(0, 300)}`);
		return { status: 'failed', http: res.status };
	}
	const body = await res.json();
	const settlement = decodeHeader(res.headers.get('payment-response')) ?? lastPayment().settlement ?? null;
	const paywall = res.headers.get('x-eigenbeleg-paywall');

	// 3. check the work
	const pdf = Buffer.from(body.pdf, 'base64');
	const csvLines = String(body.csv).trim().split('\r\n');
	const positionLines = csvLines.filter((l) => /^[^;]+;\d+;/.test(l)).length;
	const checks = {
		pdfIsPdfA: pdf.subarray(0, 8).toString() === '%PDF-1.7' && pdf.includes('<pdfaid:part>2</pdfaid:part>'),
		csvHasEveryPosition: positionLines === body.positions,
		numberMatches: String(body.csv).includes(body.number)
	};
	const passed = Object.values(checks).every(Boolean);
	const file = body.number.replace(/[^A-Za-z0-9._-]/g, '_');
	await writeFile(join(outDir, `${file}.pdf`), pdf);
	await writeFile(join(outDir, `${file}.csv`), body.csv);

	// 4. the receipt
	const payment = lastPayment().payment;
	const receipt = {
		task: `Eigenbeleg ${body.number}`,
		boughtFrom: api,
		what: 'Eigenbeleg (PDF/A-2b + CSV)',
		price: payment ? { amount: payment.amount, asset: payment.asset, network: payment.network, payTo: payment.payTo } : paywall ? { note: paywall } : null,
		transaction: settlement?.transaction ?? null,
		explorer: settlement?.transaction && settlement.network ? explorerUrl(settlement.network, settlement.transaction) : null,
		checks,
		passed,
		files: [`${file}.pdf`, `${file}.csv`],
		summary: { positions: body.positions, notOnIt: body.notOnIt, totalEur: body.totalEur, quantities: body.quantities },
		at: new Date().toISOString()
	};
	await writeFile(join(outDir, `${file}.receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
	say(`Got ${body.number}: ${body.positions} positions, ${body.totalEur} EUR; check ${passed ? 'passed' : 'FAILED'}.`);
	if (receipt.transaction) say(`Paid: ${receipt.explorer ?? receipt.transaction}`);
	say(`Files: ${receipt.files.map((f) => join(outDir, f)).join(', ')} (+ receipt)`);
	return { status: passed ? 'delivered' : 'check-failed', receipt };
}

/** @param {string | null} h */
function decodeHeader(h) {
	if (!h) return null;
	try {
		return JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
	} catch {
		return null;
	}
}

/** @param {string} network @param {string} tx */
function explorerUrl(network, tx) {
	if (network === 'near:testnet') return `https://testnet.nearblocks.io/txns/${tx}`;
	if (network === 'near:mainnet') return `https://nearblocks.io/txns/${tx}`;
	return null;
}
