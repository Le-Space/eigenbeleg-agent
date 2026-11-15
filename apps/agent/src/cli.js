// SPDX-License-Identifier: AGPL-3.0-or-later
// The agent on the command line.
//
//   npm run agent -- --chain near --network testnet --address me.testnet --month 2026-10 \
//     --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt"
//   npm run agent -- --job job.json
//
// Settings from the environment (.env): API_URL, AGENT_ACCOUNT_ID, AGENT_SECRET_KEY
// (or the near-cli keychain), AGENT_BUDGET (per payment, default $0.25), OUT_DIR.

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { runJob, subscribe } from './agent.js';
import { createPayer } from './payer.js';
import { marketPass } from './market.js';

try {
	for (const line of readFileSync(new URL('../../../.env', import.meta.url), 'utf8').split('\n')) {
		const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
	}
} catch {
	// no .env
}

const HELP = `The Eigenbeleg agent: buys Eigenbelege and Kontoauszüge from the API, paying with x402.

  npm run agent -- --chain near --network testnet --address me.testnet --month 2026-10 \\
    --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt"
  npm run agent -- --job job.json          the request body from a file
  npm run agent -- --market                one pass over the NEAR AI Agent Market (MARKET_TOKEN)
  npm run agent -- --subscribe --chain near --address me.near --name … --postal … --email belege@example.org
                                           a subscription: twelve monthly Kontoauszüge by mail, paid once (no period);
                                           --months 3 buys 1 to 12 months in advance at months × the price

Options: --chain, --network, --address (repeatable), --month YYYY-MM or --from/--to YYYY-MM-DD,
  --name and --postal (the payer, printed on the documents), --number, --statement,
  --include fee,storage,transfer,call, --document eigenbelege|kontoauszug|beide,
  --email belege@example.org (the API also mails the files, e.g. to a document management system),
  --language de (the mail's language, default en; the documents are German),
  --api URL (else API_URL), --out DIR (else OUT_DIR, default ./out).
A subscription costs twelve times the price (1.20 USDC at $0.10): raise AGENT_BUDGET for it.
Environment (.env): API_URL, AGENT_ACCOUNT_ID and AGENT_SECRET_KEY (or the near-cli keychain),
  PAY_NETWORK (near:testnet), AGENT_EVM_KEY (USDC on Base and Ethereum), PAY_PREFER (the network to
  pay on when the API offers several), AGENT_BUDGET per payment (default $0.25).`;

const { values: v } = parseArgs({
	options: {
		help: { type: 'boolean', short: 'h', default: false },
		job: { type: 'string' },
		market: { type: 'boolean', default: false },
		subscribe: { type: 'boolean', default: false },
		months: { type: 'string' },
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
		email: { type: 'string' },
		language: { type: 'string' },
		api: { type: 'string' },
		out: { type: 'string' }
	}
});

if (v.help) {
	console.log(HELP);
	process.exit(0);
}

const job = v.market ? null : v.job
	? JSON.parse(await readFile(v.job, 'utf8'))
	: {
			chain: v.chain,
			network: v.network,
			addresses: v.address ?? [],
			...(v.subscribe ? {} : { period: v.month ? { month: v.month } : { from: v.from, to: v.to } }),
			payer: { name: v.name ?? '', address: (v.postal ?? '').replace(/,\s*/g, '\n') },
			...(v.number ? { number: v.number } : {}),
			...(v.statement ? { statementNumber: v.statement } : {}),
			...(v.include ? { includeKinds: v.include.split(',') } : {}),
			...(v.document ? { document: v.document } : {}),
			...(v.email ? { email: v.email } : {}),
			...(v.language ? { language: v.language } : {})
		};

const env = process.env;
const api = (v.api ?? env.API_URL ?? 'http://127.0.0.1:4402').replace(/\/$/, '');
let paidFetch = fetch;
let lastPayment = () => ({});
if (env.AGENT_ACCOUNT_ID || env.AGENT_EVM_KEY) {
	const payer = await createPayer({
		accountId: env.AGENT_ACCOUNT_ID,
		secretKey: env.AGENT_SECRET_KEY,
		network: /** @type {any} */ (env.PAY_NETWORK ?? 'near:testnet'),
		evmKey: env.AGENT_EVM_KEY,
		prefer: env.PAY_PREFER,
		budget: env.AGENT_BUDGET ?? '$0.25'
	});
	paidFetch = payer.paidFetch;
	lastPayment = payer.last;
	const wallets = [...(env.AGENT_ACCOUNT_ID ? [`${env.AGENT_ACCOUNT_ID} (${env.PAY_NETWORK ?? 'near:testnet'})`] : []), ...(env.AGENT_EVM_KEY ? ['an EVM key (Base, Ethereum)'] : [])];
	console.log(`Wallet: ${wallets.join(' and ')}, budget ${env.AGENT_BUDGET ?? '$0.25'} per payment${env.PAY_PREFER ? `, pays on ${env.PAY_PREFER} when offered` : ''}`);
} else {
	console.log('Wallet: none (neither AGENT_ACCOUNT_ID nor AGENT_EVM_KEY set) – works only against an API without paywall.');
}

const outDir = v.out ?? env.OUT_DIR ?? 'out';
if (v.market) {
	if (!env.MARKET_TOKEN) throw new Error('--market needs MARKET_TOKEN (the agent token from market.near.ai)');
	const done = await marketPass({ token: env.MARKET_TOKEN, api, fetch, paidFetch, lastPayment, outDir });
	console.log(`Market pass done: ${JSON.stringify(done)}`);
} else if (v.subscribe) {
	const result = await subscribe({ job: /** @type {any} */ (job), api, paidFetch, lastPayment, outDir, months: v.months ? Number(v.months) : undefined });
	process.exitCode = result.status === 'subscribed' ? 0 : 1;
} else {
	// An API that is not there (a wrong --api, a route that is off) is one line, not a stack trace.
	const result = await runJob({ job: /** @type {any} */ (job), api, fetch, paidFetch, lastPayment, outDir }).catch((/** @type {Error} */ e) => {
		console.error(`Agent stopped: ${e.message}`);
		return { status: 'failed' };
	});
	process.exitCode = result.status === 'delivered' || result.status === 'proposed' ? 0 : 1;
}
