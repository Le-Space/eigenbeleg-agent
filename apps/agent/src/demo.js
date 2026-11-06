// SPDX-License-Identifier: AGPL-3.0-or-later
// A demo that runs anywhere, offline: the API (without paywall, said so on
// every response) in this process, NearBlocks answered from a recorded
// fixture of a public account (Aurora's relayer, 1 Nov 2026, network fees
// only), a fixed EUR rate. Then a job for a chain without a building block.
//
//   npm run demo
//
// The paid flow on testnet is in the README ("Pay with x402 on NEAR testnet").

import { readFile } from 'node:fs/promises';

import { fixedRates } from '@eigenbeleg/rates';
import { createApp } from '../../api/src/app.js';
import { runJob } from './agent.js';
import { recordedNear } from './recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/chain-near/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const recorded = recordedNear(raw);
const app = createApp({
	paywall: { middleware: null, info: { mode: 'none', note: 'demo: no payment' } },
	deps: { fetch: recorded, rates: fixedRates({ NEAR: '1.92' }), probeDay: '2026-11-01' },
	log: () => {}
});
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const api = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;

console.log('— Demo 1: a job the agent can do —\n');
await runJob({
	api,
	fetch,
	paidFetch: fetch,
	outDir: 'out/demo',
	job: {
		chain: 'near',
		network: 'mainnet',
		addresses: ['relay.aurora'],
		period: { from: '2026-11-01', to: '2026-11-01' },
		payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' },
		number: 'EB-2026-001',
		// both documents, asked for: the API delivers only what is asked
		document: 'beide'
	}
});

console.log('\n— Demo 2: a job on a chain without a building block (Solana) —\n');
await runJob({
	api,
	fetch,
	paidFetch: fetch,
	outDir: 'out/demo',
	job: { chain: 'solana', network: 'mainnet', addresses: ['ExampleSolanaAddress1111111111111111111111'], period: { month: '2026-10' }, payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' } }
});
server.close();
