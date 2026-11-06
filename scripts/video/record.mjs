// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Records the demo video (docs/demo-video.md) from a REAL paid run:
//
//   1. starts the API (settings from .env: PAYWALL=near on testnet) and runs
//      the agent for an own testnet account and day; the agent pays 0.10 USDC
//      through x402. Its output is captured line by line with timestamps;
//   2. runs the agent for Solana (no building block: a PR draft);
//   3. records each scene in Chromium (Playwright): the captured terminal
//      output replayed at its own pace, the payment as the NEAR RPC returns
//      it, the PDF (pdf.js), the CSV and the agent's receipt;
//   4. voices each scene with macOS `say` and puts it together with ffmpeg.
//
//   cd scripts/video && npm install --workspaces=false
//   node record.mjs --account eigenbeleg-agent.testnet --day 2026-11-06 [--voice Samantha]
//
// Output: out/video/eigenbeleg-demo.mp4 (and the parts it was made from).
// Needs macOS (say), ffmpeg, a funded agent account and the API's relayer key.

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values: v } = parseArgs({
	options: {
		account: { type: 'string', default: 'eigenbeleg-agent.testnet' },
		day: { type: 'string' },
		voice: { type: 'string', default: 'Samantha' },
		rate: { type: 'string', default: '172' },
		'skip-run': { type: 'boolean', default: false }
	}
});
if (!v.day || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) throw new Error('--day YYYY-MM-DD (a finished UTC day with the account\'s payments)');

const REPO = resolve(import.meta.dirname, '../..');
const OUT = join(REPO, 'out', 'video');
const RUN = join(OUT, 'run');
const PARTS = join(OUT, 'parts');
const W = 1920;
const H = 1080;
const PAYER = { name: 'Wolkenfabrik Hosting GmbH', postal: 'Musterstraße 1, 12345 Beispielstadt' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs a command, returns its stdout lines with ms since start. */
function capture(cmd, args, opts = {}) {
	return new Promise((res, rej) => {
		const t0 = Date.now();
		const lines = [];
		const p = spawn(cmd, args, { cwd: REPO, env: process.env, ...opts });
		let buf = '';
		p.stdout.on('data', (d) => {
			buf += d;
			let i;
			while ((i = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, i);
				buf = buf.slice(i + 1);
				if (!/ed25519:|secp256k1:/.test(line)) lines.push({ t: Date.now() - t0, line });
			}
		});
		p.stderr.on('data', (d) => process.stderr.write(d));
		p.on('exit', (code) => (code === 0 ? res(lines) : rej(new Error(`${cmd} exited ${code}`))));
	});
}

async function realRun() {
	await rm(RUN, { recursive: true, force: true });
	await mkdir(RUN, { recursive: true });
	const api = spawn('node', ['apps/api/src/server.js'], { cwd: REPO, env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
	let apiLine = '';
	api.stdout.on('data', (d) => (apiLine ||= String(d).split('\n')[0]));
	try {
		for (let i = 0; i < 40 && !(await fetch('http://127.0.0.1:4402/health').then((r) => r.ok, () => false)); i++) await sleep(250);
		const agentArgs = ['--network', 'testnet', '--address', v.account, '--from', v.day, '--to', v.day, '--name', PAYER.name, '--postal', PAYER.postal, '--out', 'out/video/run'];
		const paid = await capture('node', ['apps/agent/src/cli.js', ...agentArgs]);
		const solana = await capture('node', ['apps/agent/src/cli.js', '--chain', 'solana', '--address', 'ExampleSolanaAddress1111111111111111111111', '--month', v.day.slice(0, 7), '--name', PAYER.name, '--postal', PAYER.postal, '--out', 'out/video/run']);
		await writeFile(join(RUN, 'transcript.json'), JSON.stringify({ apiLine: apiLine.replace(/^> .*$/, ''), paid, solana, agentArgs }, null, 2));
	} finally {
		api.kill();
	}
}

/** A tiny static server for the scenes, pdf.js and the run's files. */
function serve() {
	const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.pdf': 'application/pdf', '.json': 'application/json' };
	const server = createServer(async (req, res) => {
		const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		const base = path.startsWith('/run/') ? OUT : import.meta.dirname;
		const file = resolve(base, '.' + path);
		if (!file.startsWith(base) || !existsSync(file)) return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
	});
	return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

/** Voice for a scene; returns its length in ms. */
function voice(text, file) {
	execFileSync('say', ['-v', v.voice, '-r', v.rate, '-o', file, text]);
	const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
	return Math.ceil(Number(s) * 1000);
}

/** The payment transaction as the NEAR RPC returns it, as rows for the scene. @param {string} hash */
async function txRows(hash) {
	const body = await fetch('https://archival-rpc.testnet.fastnear.com', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: { tx_hash: hash, sender_account_id: 'eigenbeleg-api.testnet', wait_until: 'FINAL' } })
	}).then((r) => r.json());
	const r = body.result;
	const tx = r.transaction;
	const delegate = tx.actions.find((a) => a.Delegate)?.Delegate?.delegate_action;
	const event = r.receipts_outcome.flatMap((o) => o.outcome.logs).map((l) => /^EVENT_JSON:(.*)$/.exec(l)?.[1]).filter(Boolean).map((j) => JSON.parse(j)).find((e) => e.event === 'ft_transfer');
	const t = event?.data?.[0];
	const ok = r.receipts_outcome.every((o) => !('Failure' in o.outcome.status));
	return {
		hash,
		rows: [
			['Signed by (pays the gas)', tx.signer_id],
			['Action', `Delegate (NEP-366 meta transaction) for ${delegate?.sender_id ?? tx.receiver_id}`],
			['Inner call', `${delegate?.actions?.[0]?.FunctionCall?.method_name ?? 'ft_transfer'} on the USDC contract`],
			['USDC moved', t ? `${Number(t.amount) / 1e6} USDC  ${t.old_owner_id} → ${t.new_owner_id}` : '—'],
			['Status', ok ? 'all receipts succeeded' : 'FAILED']
		]
	};
}

async function main() {
	if (!v['skip-run']) await realRun();
	const tr = JSON.parse(await readFile(join(RUN, 'transcript.json'), 'utf8'));
	const files = await readdir(RUN);
	const pdfName = files.find((f) => /^EB-.*\.pdf$/.test(f));
	const csvName = files.find((f) => /^EB-.*\.csv$/.test(f));
	const receipt = JSON.parse(await readFile(join(RUN, files.find((f) => f.endsWith('.receipt.json'))), 'utf8'));
	if (!receipt.transaction) throw new Error('the run has no payment transaction: is PAYWALL=near set in .env?');
	const cmd = (args) => `$ npm run agent -- ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;

	const scenes = [
		{
			kind: 'card', tag: 'NEAR HACKATHON · Real-World Money · Agent Economy', title: 'Paid gas on a blockchain?\nNobody sends you a receipt.',
			lines: ['eigenbeleg-agent writes the Eigenbeleg – and pays for it itself.'],
			say: 'A company paid these fees on NEAR. Its bookkeeper wants a receipt for every booking. Nobody will send one: the recipient is a peer-to-peer network.'
		},
		{
			kind: 'terminal', caption: 'A real run on NEAR testnet: the agent pays the API 0.10 USDC through x402',
			lines: [{ t: 0, line: '$ npm run api' }, { t: 1, line: tr.apiLine.trim() }, { t: 2, line: '' }, { t: 3, line: cmd(tr.agentArgs) }, ...tr.paid.map((l) => ({ t: 4 + l.t, line: l.line }))],
			say: 'So the payer issues its own receipt: an Eigenbeleg. Our agent gets the job: this account, this day, this company. It checks that the NEAR building block is current, sees the price of ten cents, compares it to its budget, and signs exactly one USDC transfer. It holds no NEAR: the API\'s relayer pays the gas.'
		},
		{ kind: 'tx', data: await txRows(receipt.transaction), caption: receipt.explorer, say: 'The payment settles to a NEAR account in one transaction. The API\'s relayer signed it and paid the gas; inside, the USDC contract moved exactly ten cents from the agent to the API.' },
		{ kind: 'pdf', url: `/run/${pdfName}`, caption: 'The Eigenbeleg: PDF/A-2b, every transaction hash, the EUR rate of the day', say: 'The Eigenbeleg: every fee and storage deposit with its transaction hash, the euro rate of the day and its source, the reason there is no other receipt, and a line to sign. PDF A, for the archive.' },
		{ kind: 'csv', text: await readFile(join(RUN, csvName), 'utf8'), caption: 'The CSV: every movement, and why it is or is not on the Eigenbeleg', say: 'And the same as CSV, which a German spreadsheet opens as it is. Incoming money, and the payment for the API itself, stay off the Eigenbeleg, with the reason.' },
		{ kind: 'json', data: receipt, caption: "The agent's own receipt", say: 'The agent keeps a receipt of what it bought, from whom, for how much, and whether the work passed its checks.' },
		{
			kind: 'terminal', caption: 'A chain without a building block: nothing bought, a PR drafted',
			lines: [{ t: 0, line: '$ npm run agent -- --chain solana …' }, ...tr.solana.filter((l) => !/^Wallet:/.test(l.line)).map((l) => ({ t: 1 + l.t, line: l.line }))],
			say: 'For a chain it can\'t serve, it buys nothing. It drafts the missing building block as a pull request with tests, and a person merges it.'
		},
		{
			kind: 'card', tag: '#NEARHackathon', title: 'github.com/Le-Space/eigenbeleg-agent',
			lines: ['x402 on NEAR · gasless USDC · PDF/A + CSV · open source (AGPL)', 'Bookkeepers: what would you need on it?'],
			say: 'Open source, built at NEAR Hackathon. Bookkeepers: what would you need on it?'
		}
	];

	await rm(PARTS, { recursive: true, force: true });
	await mkdir(PARTS, { recursive: true });
	const srv = await serve();
	const browser = await chromium.launch();
	const list = [];
	try {
		for (const [i, s] of scenes.entries()) {
			const audio = join(PARTS, `${i}.aiff`);
			const duration = voice(s.say, audio) + 900;
			const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: PARTS, size: { width: W, height: H } }, colorScheme: 'dark' });
			const page = await ctx.newPage();
			await page.addInitScript((scene) => (window.SCENE = scene), { ...s, duration });
			await page.goto(`${srv.url}/scene.html`);
			await page.waitForFunction(() => window.READY === true, null, { timeout: 30_000 });
			await sleep(duration);
			const video = page.video();
			await ctx.close();
			const webm = await video.path();
			// The recording starts while the page loads: keep its last `duration` ms.
			const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString());
			const start = Math.max(0, total - duration / 1000);
			const part = join(PARTS, `${i}.mp4`);
			execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-i', webm, '-i', audio, '-filter_complex', '[1:a]apad[a]', '-map', '0:v', '-map', '[a]', '-t', String(duration / 1000), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', part]);
			list.push(`file '${part}'`);
			console.log(`scene ${i + 1}/${scenes.length} (${s.kind}) ${(duration / 1000).toFixed(1)}s`);
		}
	} finally {
		await browser.close();
		srv.close();
	}
	await writeFile(join(PARTS, 'list.txt'), list.join('\n') + '\n');
	const mp4 = join(OUT, 'eigenbeleg-demo.mp4');
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(PARTS, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', mp4]);
	console.log(`→ ${mp4}`);
}

await main();
