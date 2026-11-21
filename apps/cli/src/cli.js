#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Eigenbelege and Kontoauszüge on your own machine, from the command line.
//
//   npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 \
//     --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt"
//
// Nothing is paid and nothing goes to a server of ours: the chain is read
// from the public data sources (they see your IP address and the blockchain
// addresses), the EUR rates come from CoinGecko, Kraken and the ECB (for RUB
// documents the Bank of Russia too), and the
// PDFs are drawn here. Name and postal address never leave this machine.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { runLocal } from './local.js';

const HELP = `Eigenbelege and Kontoauszüge on your own machine: no payment, nothing sent to us.

  npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 \\
    --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt"
  npm run local -- --job job.json          the request body from a file (as the API takes it)
  npm run local -- … --preview             counts and totals only, no files

Options: --chain near|akash|filecoin|filecoin-pay|aleph (ethereum, base with --alchemy-key), --network mainnet|testnet,
  --address (repeatable, up to ten), --month YYYY-MM or --from/--to YYYY-MM-DD (finished days, at most 92),
  --name and --postal (the issuer, printed on the documents; they stay on this machine),
  --document eigenbelege|kontoauszug|beide, --include fee,storage,transfer,call,swap, --number EB-2026-001,
  --statement KA-2026-10, --logo (the chain's mark), --issuer-logo FILE (your own logo, a PNG or JPEG file, top right on
  every document; it stays on this machine), --no-chart (a statement without its diagram),
  --currency EUR|USD|CHF|GBP|SEK|NOK|DKK|PLN|CZK|HUF|RON|ISK|TRY|RUB (the documents' currency, default EUR), --out DIR (default ./out), --preview.
Keys, all optional and yours: --alchemy-key or ALCHEMY_KEY (Ethereum and Base; goes to Alchemy only),
  --nearblocks-key or NEARBLOCKS_API_KEY (a month with many NEAR transactions), --akash-indexer URL.
The data sources your machine asks: see the web UI's privacy note (eigenbeleg.le-space.de/#datenschutz).`;

const { values: v } = parseArgs({
	options: {
		help: { type: 'boolean', short: 'h', default: false },
		job: { type: 'string' },
		preview: { type: 'boolean', default: false },
		chain: { type: 'string', default: 'near' },
		network: { type: 'string', default: 'mainnet' },
		address: { type: 'string', multiple: true },
		month: { type: 'string' },
		from: { type: 'string' },
		to: { type: 'string' },
		name: { type: 'string' },
		postal: { type: 'string' },
		number: { type: 'string' },
		statement: { type: 'string' },
		include: { type: 'string' },
		document: { type: 'string' },
		logo: { type: 'boolean', default: false },
		'issuer-logo': { type: 'string' },
		'no-chart': { type: 'boolean', default: false },
		currency: { type: 'string' },
		out: { type: 'string' },
		'alchemy-key': { type: 'string' },
		'nearblocks-key': { type: 'string' },
		'akash-indexer': { type: 'string' }
	}
});

if (v.help) {
	console.log(HELP);
	process.exit(0);
}

const body = v.job
	? JSON.parse(await readFile(v.job, 'utf8'))
	: {
			chain: v.chain,
			network: v.network,
			addresses: v.address ?? [],
			period: v.month ? { month: v.month } : { from: v.from, to: v.to },
			...(v.preview ? {} : { payer: { name: v.name ?? '', address: (v.postal ?? '').replace(/,\s*/g, '\n') } }),
			...(v.number ? { number: v.number } : {}),
			...(v.statement ? { statementNumber: v.statement } : {}),
			...(v.include ? { includeKinds: v.include.split(',') } : {}),
			...(v.document ? { document: v.document } : {}),
			...(v.logo ? { logo: true } : {}),
			...(v['issuer-logo'] && !v.preview ? { issuerLogo: new Uint8Array(await readFile(v['issuer-logo'])) } : {}),
			...(v['no-chart'] ? { chart: false } : {}),
			...(v.currency ? { currency: v.currency.toUpperCase() } : {})
		};

try {
	const { summary, files } = await runLocal({
		body,
		outDir: v.out ?? process.env.OUT_DIR ?? 'out',
		preview: v.preview,
		alchemyKey: v['alchemy-key'] ?? process.env.ALCHEMY_KEY,
		nearblocksKey: v['nearblocks-key'] ?? process.env.NEARBLOCKS_API_KEY,
		akashIndexer: v['akash-indexer']
	});
	const s = summary;
	console.log(`${s.chain} ${s.network}, ${s.period.from} to ${s.period.to}: ${s.transactions} transaction(s), ${s.positions} position(s), ${s.totalEur} ${s.currency ?? 'EUR'}${s.eigenbelege.length ? `, Eigenbelege ${s.eigenbelege[0]}…${s.eigenbelege.at(-1)}` : ''}`);
	for (const k of s.kontoauszuege) for (const a of k.assets) console.log(`${k.number} ${k.account} ${a.asset}: ${a.opening} → ${a.closing}${a.reconciled === true ? ' ✓' : a.reconciled === false ? ' (difference)' : ''}`);
	if (files.length) console.log(`Files: ${files.join(', ')}`);
	else if (!v.preview) console.log('No files: nothing in this period.');
} catch (e) {
	console.error(`Error: ${String(/** @type {Error} */ (e)?.message ?? e)}`);
	process.exitCode = 1;
}
