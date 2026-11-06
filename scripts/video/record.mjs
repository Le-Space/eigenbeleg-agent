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
//   4. voices each scene (voice.mjs: ElevenLabs "George" as in the Belege
//      videos, macOS `say` without a key) and puts it together with ffmpeg.
//
//   cd scripts/video && npm install --workspaces=false
//   node record.mjs --account eigenbeleg-agent.testnet --day 2026-11-06 --lang en
//   node record.mjs --day 2026-11-06 --lang de --skip-run   (same run, German)
//
// Output: out/video/eigenbeleg-demo-<lang>.mp4 (and the parts it was made from).
// Needs macOS (say), ffmpeg, a funded agent account and the API's relayer key.

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

import { provider, speak } from './voice.mjs';

const { values: v } = parseArgs({
	options: {
		account: { type: 'string', default: 'eigenbeleg-agent.testnet' },
		day: { type: 'string' },
		voice: { type: 'string' },
		rate: { type: 'string', default: '172' },
		lang: { type: 'string', default: 'en' },
		'skip-run': { type: 'boolean', default: false }
	}
});
if (!v.day || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) throw new Error('--day YYYY-MM-DD (a finished UTC day with the account\'s payments)');

if (!['en', 'de'].includes(v.lang)) throw new Error('--lang en | de');
const REPO = resolve(import.meta.dirname, '../..');
const OUT = join(REPO, 'out', 'video');
const RUN = join(OUT, 'run');
const PARTS = join(OUT, `parts-${v.lang}`);
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
		const agentArgs = ['--document', 'beide', '--network', 'testnet', '--address', v.account, '--from', v.day, '--to', v.day, '--name', PAYER.name, '--postal', PAYER.postal, '--out', 'out/video/run'];
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


/** The payment transaction as the NEAR RPC returns it, as rows for the scene. @param {string} hash */
async function txRows(hash, lang) {
	const de = lang === 'de';
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
			[de ? 'Signiert von (zahlt das Gas)' : 'Signed by (pays the gas)', tx.signer_id],
			[de ? 'Aktion' : 'Action', de ? `Delegate (NEP-366-Meta-Transaktion) für ${delegate?.sender_id ?? tx.receiver_id}` : `Delegate (NEP-366 meta transaction) for ${delegate?.sender_id ?? tx.receiver_id}`],
			[de ? 'Innerer Aufruf' : 'Inner call', `${delegate?.actions?.[0]?.FunctionCall?.method_name ?? 'ft_transfer'} ${de ? 'am USDC-Contract' : 'on the USDC contract'}`],
			[de ? 'USDC bewegt' : 'USDC moved', t ? `${(Number(t.amount) / 1e6).toLocaleString(de ? 'de-DE' : 'en-US', { minimumFractionDigits: 2 })} USDC  ${t.old_owner_id} → ${t.new_owner_id}` : '—'],
			['Status', ok ? (de ? 'alle Receipts erfolgreich' : 'all receipts succeeded') : de ? 'FEHLGESCHLAGEN' : 'FAILED']
		]
	};
}

/** What each scene shows and says, per language. The German version is for the German market. */
const TEXTS = {
	en: [
		{ tag: 'NEAR HACKATHON · Real-World Money · Agent Economy', title: 'Paid gas on a blockchain?\nNobody sends you a receipt.', lines: ['eigenbeleg-agent writes the Eigenbeleg – and pays for it itself.'], say: 'A company paid these fees on NEAR. Its bookkeeper wants a receipt for every booking, and a statement for every account. Nobody will send one: the recipient is a peer-to-peer network.' },
		{ caption: 'A real run on NEAR testnet: the agent pays the API 0.10 USDC through x402', say: "So the payer issues its own receipt: an Eigenbeleg. Our agent gets the job: this account, this day, this company. It checks that the NEAR building block is current, sees the price of ten cents, compares it to its budget, and signs exactly one USDC transfer. It holds no NEAR: the API's relayer pays the gas." },
		{ tag: 'NEAR testnet · the transaction, as the NEAR RPC returns it', say: "The payment settles to a NEAR account in one transaction. The API's relayer signed it and paid the gas; inside, the USDC contract moved exactly ten cents from the agent to the API." },
		{ caption: 'One Eigenbeleg per transaction: hash, from and to, every movement, QR code', say: 'One Eigenbeleg per transaction, numbered from your own range: the full hash, who paid whom with full addresses, every movement including the gas, the euro rate of the day, a QR code to check it from paper, and a line to sign. PDF A, for the archive.' },
		{ caption: 'The Kontoauszug: every booking, running balance, checked against the chain', say: 'And the Kontoauszug, like a bank statement: opening balance, every booking with debit, credit and running balance, and the closing balance, checked against the balance the NEAR archive node reports. It matches to the last yocto.' },
		{ caption: 'The CSV: every movement, and why it is or is not on the Eigenbeleg', say: 'And the same as CSV, which a German spreadsheet opens as it is. Incoming money, and the payment for the API itself, stay off the Eigenbeleg, with the reason.' },
		{ caption: "The agent's own receipt", say: 'The agent keeps a receipt of what it bought, from whom, for how much, and whether the work passed its checks.' },
		{ caption: 'A chain without a building block: nothing bought, a PR drafted', say: "For a chain it can't serve, it buys nothing. It drafts the missing building block as a pull request with tests, and a person merges it." },
		{ tag: '#NEARHackathon', title: 'github.com/Le-Space/eigenbeleg-agent', lines: ['x402 on NEAR · gasless USDC · Eigenbelege + Kontoauszug, PDF/A · open source (AGPL)', 'Bookkeepers: what would you need on it?'], say: 'Open source, built at NEAR Hackathon. Bookkeepers: what would you need on it?' }
	],
	de: [
		{ tag: 'NEAR HACKATHON · Real-World Money · Agent Economy', title: 'Gas auf der Blockchain bezahlt?\nEine Rechnung bekommen Sie dafür nie.', lines: ['eigenbeleg-agent schreibt den Eigenbeleg – und bezahlt ihn selbst.'], say: 'Ein Unternehmen hat diese Gebühren auf NEAR bezahlt. Die Buchhaltung braucht für jede Buchung einen Beleg und für jedes Konto einen Auszug. Eine Rechnung schickt aber niemand: Der Empfänger ist ein Peer-to-Peer-Netzwerk.' },
		{ caption: 'Ein echter Lauf auf NEAR-Testnet: Der Agent zahlt der API 0,10 USDC über x402', say: 'Also stellt der Zahlende den Beleg selbst aus: einen Eigenbeleg. Unser Agent bekommt den Auftrag: dieses Konto, dieser Tag, diese Firma. Er prüft, ob der NEAR-Baustein aktuell ist, sieht den Preis von zehn Cent, vergleicht ihn mit seinem Budget und signiert genau eine USDC-Überweisung. NEAR braucht er dafür nicht: Die Gasgebühr zahlt der Relayer der API.' },
		{ tag: 'NEAR-Testnet · die Transaktion, wie der NEAR-RPC sie liefert', say: 'Die Zahlung landet in einer einzigen Transaktion auf einem NEAR-Konto. Der Relayer der API hat sie signiert und das Gas bezahlt; darin hat der USDC-Contract genau zehn Cent vom Agenten an die API überwiesen.' },
		{ caption: 'Ein Eigenbeleg je Transaktion: Hash, Von und An, alle Bewegungen, QR-Code', say: 'Für jede Transaktion ein eigener Eigenbeleg, nummeriert aus Ihrem Nummernkreis: der vollständige Hash, wer an wen gezahlt hat, mit vollen Adressen, jede Bewegung einschließlich der Gasgebühr, der Euro-Tageskurs, ein QR-Code zum Nachprüfen vom Papier, und eine Zeile für die Unterschrift. Als PDF/A, fürs Archiv.' },
		{ caption: 'Der Kontoauszug: jede Buchung, laufender Saldo, abgestimmt mit der Chain', say: 'Dazu der Kontoauszug, wie von der Bank: Anfangssaldo, jede Buchung mit Soll, Haben und laufendem Saldo, und der Endsaldo, abgestimmt mit dem Kontostand, den der NEAR-Archivknoten meldet. Er stimmt bis auf das letzte Yocto.' },
		{ caption: 'Die CSV: jede Bewegung – und warum sie auf dem Eigenbeleg steht oder nicht', say: 'Dasselbe als CSV, die Excel ohne Umwege öffnet. Eingänge und die Zahlung an die API selbst stehen nicht auf dem Eigenbeleg – jeweils mit Begründung.' },
		{ caption: 'Die Quittung des Agenten', say: 'Der Agent führt Buch über seinen Einkauf: was er bei wem gekauft hat, zu welchem Preis, und ob das Ergebnis seine Prüfung bestanden hat.' },
		{ caption: 'Eine Chain ohne Baustein: nichts gekauft, ein Pull Request entworfen', say: 'Für eine Chain, die er noch nicht kann, kauft er nichts. Er entwirft den fehlenden Baustein als Pull Request mit Tests, und ein Mensch prüft und übernimmt ihn.' },
		{ tag: '#NEARHackathon', title: 'github.com/Le-Space/eigenbeleg-agent', lines: ['x402 auf NEAR · USDC ohne Gasgebühr · Eigenbelege + Kontoauszug, PDF/A · Open Source (AGPL)', 'Steuerberater und Buchhalter: Was brauchen Sie auf dem Eigenbeleg?'], say: 'Open Source, entstanden beim NEAR Hackathon. Steuerberater und Buchhalter: Was brauchen Sie auf dem Eigenbeleg?' }
	]
};

async function main() {
	if (!v['skip-run']) await realRun();
	const tr = JSON.parse(await readFile(join(RUN, 'transcript.json'), 'utf8'));
	const files = await readdir(RUN);
	const pdfName = files.find((f) => /^EB-.*\.pdf$/.test(f));
	const kaName = files.find((f) => /^KA-.*\.pdf$/.test(f));
	const csvName = files.find((f) => /^EB-.*\.csv$/.test(f));
	const receipt = JSON.parse(await readFile(join(RUN, files.find((f) => f.endsWith('.receipt.json'))), 'utf8'));
	if (!receipt.transaction) throw new Error('the run has no payment transaction: is PAYWALL=near set in .env?');
	const cmd = (args) => `$ npm run agent -- ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;

	const T = structuredClone(TEXTS[v.lang]);
	// The narrator says the statement reconciled only when this run's did.
	const reconciled = (receipt.summary.kontoauszuege ?? []).every((k) => k.assets.every((a) => a.reconciled === true));
	if (!reconciled) T[4].say = T[4].say.replace(/ (It matches to the last yocto|Er stimmt bis auf das letzte Yocto)\./, v.lang === 'de' ? ' Eine Abweichung stünde offen darauf.' : ' A difference would be shown openly.');
	const scenes = [
		{ kind: 'card', ...T[0] },
		{
			kind: 'terminal', ...T[1],
			lines: [{ t: 0, line: '$ npm run api' }, { t: 1, line: tr.apiLine.trim() }, { t: 2, line: '' }, { t: 3, line: cmd(tr.agentArgs) }, ...tr.paid.map((l) => ({ t: 4 + l.t, line: l.line }))]
		},
		{ kind: 'tx', ...T[2], data: await txRows(receipt.transaction, v.lang), caption: receipt.explorer },
		{ kind: 'pdf', ...T[3], url: `/run/${pdfName}` },
		{ kind: 'pdf', ...T[4], url: `/run/${kaName}` },
		{ kind: 'csv', ...T[5], text: await readFile(join(RUN, csvName), 'utf8') },
		{ kind: 'json', ...T[6], data: receipt },
		{
			kind: 'terminal', ...T[7],
			lines: [{ t: 0, line: '$ npm run agent -- --chain solana …' }, ...tr.solana.filter((l) => !/^Wallet:/.test(l.line)).map((l) => ({ t: 1 + l.t, line: l.line }))]
		},
		{ kind: 'card', ...T[8] }
	];

	await rm(PARTS, { recursive: true, force: true });
	await mkdir(PARTS, { recursive: true });
	console.log(`narrator: ${provider()}`);
	const srv = await serve();
	const browser = await chromium.launch();
	const list = [];
	try {
		for (const [i, s] of scenes.entries()) {
			const spoken = await speak(s.say, { lang: v.lang, ...(v.voice ? { sayVoice: v.voice } : {}), sayRate: v.rate });
			const audio = spoken.file;
			const duration = spoken.durationMs + 900;
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
	const mp4 = join(OUT, `eigenbeleg-demo-${v.lang}.mp4`);
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(PARTS, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', mp4]);
	console.log(`→ ${mp4}`);
}

await main();
