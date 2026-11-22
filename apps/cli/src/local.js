// SPDX-License-Identifier: AGPL-3.0-or-later
// One local run of the pipeline (issue #5, #29): read the chain from the
// public data sources, value in EUR, draw the Eigenbelege, the Kontoauszug
// and the CSV, and write them to a directory. No payment and no API of ours:
// name and postal address stay on this machine. The same code the web UI
// runs in the browser and the API runs for agents.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { blocksFor, generate, parseRequest } from '@eigenbeleg/pipeline';

/**
 * @typedef {object} LocalOptions
 * @property {any} body the request body, as the API takes it (chain, network, addresses, period, payer, …)
 * @property {string} outDir where the files go
 * @property {boolean} [preview] the summary only, no files
 * @property {string} [alchemyKey] the user's own Alchemy key: offers Ethereum and Base, goes to their reads only
 * @property {string} [nearblocksKey] the user's own NearBlocks key, for a month with many transactions
 * @property {string} [akashIndexer] an Akash Console indexer URL instead of the default
 * @property {string} [esplora] an Esplora API URL instead of mempool.space for Bitcoin (an own node's, http on this machine allowed)
 * @property {typeof fetch} [fetch] tests: a recorded chain
 * @property {import('@le-space/eigenbeleg').Rates} [rates] tests: fixed rates
 * @property {() => Date} [now] tests: a fixed clock
 * @property {string} [today] tests: YYYY-MM-DD for the period check
 * @property {(line: string) => void} [say] progress, one line at a time (stderr by default)
 */

/** @param {string} n */
const safe = (n) => n.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * The --esplora URL, or null. The person names their own node, on this machine or at home
 * (http://127.0.0.1:3002, http://umbrel.local:3006), so a private address is fine here; what
 * it may not carry is a password, a query or a fragment, which would end up in requests.
 *
 * @param {string} value
 */
export function esploraUrl(value) {
	let url;
	try {
		url = new URL(String(value).trim());
	} catch {
		return null;
	}
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return null;
	return url.toString().replace(/\/+$/, '');
}

/**
 * @param {LocalOptions} o
 * @returns {Promise<{ summary: any, files: string[] }>} the summary (as the API's `summary`) and the files written
 */
export async function runLocal({ body, outDir, preview = false, alchemyKey, nearblocksKey, akashIndexer, esplora, fetch, rates, now, today, say = (l) => process.stderr.write(l + '\n') }) {
	const blocks = blocksFor({ alchemyKey });
	// A wallet's extended key is read here, on this machine (keys).
	const req = parseRequest({ format: 'json', ...body }, { preview, today, blocks, keys: true });
	/** @type {Record<string, Record<string, string>>} */
	const endpoints = {};
	if (akashIndexer) endpoints.akash = { indexer: akashIndexer };
	if (esplora) {
		const api = esploraUrl(esplora);
		if (!api) throw new Error('--esplora: an http:// or https:// URL of an Esplora API, without user, password, query or #');
		endpoints.bitcoin = { api };
	}
	const deps = {
		blocks,
		fetch,
		rates,
		now,
		alchemyKey,
		nearblocksKey,
		...(Object.keys(endpoints).length ? { endpoints } : {})
	};
	const out = await generate(req, deps, {
		preview,
		onProgress: (p) => say(p.step === 'read' ? `Reading ${p.account} (${p.index + 1}/${p.count}) …` : p.step === 'rates' ? 'Fetching the day rates …' : 'Drawing the PDFs …')
	});
	if (preview) return { summary: out.summary, files: [] };

	await mkdir(outDir, { recursive: true });
	const base = safe(out.summary.eigenbelege[0] ?? out.summary.number);
	/** @type {string[]} */
	const files = [];
	const write = async (/** @type {string} */ name, /** @type {Uint8Array | string} */ data) => {
		await writeFile(join(outDir, name), data);
		files.push(join(outDir, name));
	};
	if (out.pdf && out.summary.positions > 0) await write(`${base}.pdf`, out.pdf);
	for (const s of out.statements) await write(`${safe(s.number)}.pdf`, s.pdf);
	if (out.csv) await write(`${req.document === 'kontoauszug' ? safe(out.statements[0]?.number ?? base) : base}.csv`, out.csv);
	await write(`${base}.summary.json`, JSON.stringify(out.summary, null, 2) + '\n');
	return { summary: out.summary, files };
}
