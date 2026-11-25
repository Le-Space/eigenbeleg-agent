// SPDX-License-Identifier: AGPL-3.0-or-later
// The agent pays in DOI (apps/agent/src/doi-payer.js, #59): the real API with
// the real x402 middleware, a Doichain in memory. Keys, addresses and amounts
// are made up; the extended key is BIP84's published test vector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KeyPair } from '@near-js/crypto';
import { fixedRates } from '@le-space/eigenbeleg';
import { DOICHAIN, addressOfKey, receiveAddresses } from '@eigenbeleg/onchain-pay';
import { fakeChain, fakeKey } from '@eigenbeleg/onchain-pay/testing';

import { createApp } from '../../api/src/app.js';
import { memoryOrders, memoryPaymentStore } from '../../api/src/onchain.js';
import { createPaywall } from '../../api/src/paywall.js';
import { runJob } from '../src/agent.js';
import { createDoiPayer } from '../src/doi-payer.js';
import { doiKey } from '../src/keys.js';
import { recordedNear } from '../src/recorded.js';

const raw = JSON.parse(await readFile(new URL('../../../packages/pipeline/test/fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const job = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-11-01', to: '2026-11-01' }, payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' }, number: 'EB-2026-009', includeKinds: ['fee', 'storage'] };

/** The API taking 2.5 DOI (an address per order) beside testnet USDC, and what a payer needs to reach it. */
async function setup() {
	const chain = fakeChain(DOICHAIN);
	const open = async (/** @type {any} */ fn) => fn(chain.server);
	const paywall = await createPaywall({
		mode: 'x402',
		networks: ['near:testnet'],
		allowTestnet: true,
		payTo: 'wolkenfabrik.testnet',
		relayerId: 'relayer.testnet',
		relayerKey: KeyPair.fromRandom('ed25519').toString(),
		onchain: { offered: true, network: chain.network, xpub: ZPUB, orders: memoryOrders(), price: '2.5', store: memoryPaymentStore(), open }
	});
	const server = createApp({ paywall, deps: { fetch: recordedNear(raw), rates: fixedRates({ NEAR: '2' }), probeDay: '2026-11-01', now: () => new Date('2026-11-06T10:00:00Z') }, log: () => {}, web: null }).listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	const key = fakeKey('agent');
	chain.fund(addressOfKey(chain.network, key), 900_000_000n);
	const lines = /** @type {string[]} */ ([]);
	/** A payer whose waiting is a mined block (or whatever the test does meanwhile). */
	const payer = (/** @type {any} */ o, /** @type {() => void} */ meanwhile = () => chain.mine()) =>
		createDoiPayer({ budget: '5', network: chain.network, open, say: (l) => lines.push(l), sleep: async () => meanwhile(), qr: (uri) => `[QR ${uri}]`, ...o });
	return { chain, key, lines, payer, open, api: `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`, at: receiveAddresses(chain.network, ZPUB), close: () => server.close() };
}

test('--pay doi: the agent signs, the API broadcasts, the agent waits for the block and gets the files', async () => {
	const t = await setup();
	try {
		const outDir = await mkdtemp(join(tmpdir(), 'eb-agent-doi-'));
		const p = t.payer({ mode: 'key', key: t.key });
		const r = await runJob({ api: t.api, fetch, paidFetch: p.paidFetch, lastPayment: p.last, outDir, say: (l) => t.lines.push(l), job });
		assert.equal(r.status, 'delivered');
		const receipt = JSON.parse(await readFile(join(outDir, 'EB-2026-009.receipt.json'), 'utf8'));
		assert.deepEqual(receipt.price, { amount: '250000000', asset: 'DOI', network: DOICHAIN.caip2, payTo: t.at(0) });
		assert.match(receipt.transaction, /^[0-9a-f]{64}$/);
		assert.equal(receipt.explorer, `https://doi-explorer.le-space.de/tx/${receipt.transaction}`);
		const said = t.lines.join('\n');
		assert.match(said, /the API asks 2\.5 DOI to dc1q/);
		assert.match(said, /Keep the txid: --resume [0-9a-f]{64}/);
		assert.match(said, /Payment seen: https:\/\/doi-explorer\.le-space\.de\/tx\/[0-9a-f]{64} – 0 of 1 confirmation\(s\); the documents come after that, about 10 minutes/);
		// the key is in nothing the agent says or writes
		assert.ok(!said.includes(Buffer.from(t.key).toString('hex')) && !JSON.stringify(receipt).includes(Buffer.from(t.key).toString('hex')));

		// stopped and run again: the same job with the txid, and nothing is paid twice
		const before = t.chain.requests.filter((m) => m === 'blockchain.transaction.broadcast').length;
		const again = t.payer({ mode: 'key', resume: receipt.transaction });
		const r2 = await runJob({ api: t.api, fetch, paidFetch: again.paidFetch, lastPayment: again.last, outDir, say: (l) => t.lines.push(l), job });
		assert.equal(r2.status, 'delivered');
		assert.equal(t.chain.requests.filter((m) => m === 'blockchain.transaction.broadcast').length, before);
		assert.match(t.lines.join('\n'), /Resuming with the payment [0-9a-f]{64}: nothing is paid again/);
	} finally {
		t.close();
	}
});

test('--pay qr: no key; the QR code of an address of this request, a wallet pays, the agent waits', async () => {
	const t = await setup();
	try {
		const outDir = await mkdtemp(join(tmpdir(), 'eb-agent-qr-'));
		// while the agent waits: first nothing, then the person pays from a wallet, then a block
		const steps = [() => {}, () => void t.chain.fund(t.at(1), 250_000_000n, { confirmed: false, sequence: 0xfffffffd }), () => t.chain.mine()];
		const p = t.payer({ mode: 'qr' }, () => (steps.shift() ?? (() => {}))());
		const r = await runJob({ api: t.api, fetch, paidFetch: p.paidFetch, lastPayment: p.last, outDir, say: (l) => t.lines.push(l), job });
		assert.equal(r.status, 'delivered');
		const said = t.lines.join('\n');
		assert.ok(said.includes(`[QR doichain:${t.at(1)}?amount=2.5]`));
		assert.match(said, /DoiWallet: scan from the send screen/);
		assert.match(said, /Waiting for the payment to arrive/);
		assert.match(said, /Payment seen: /);
		assert.equal(JSON.parse(await readFile(join(outDir, 'EB-2026-009.receipt.json'), 'utf8')).price.payTo, t.at(1));
	} finally {
		t.close();
	}
});

test('the budget holds, an API without DOI is said plainly, and waiting ends', async () => {
	const t = await setup();
	try {
		const body = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...job, format: 'json' }) };
		await assert.rejects(t.payer({ mode: 'key', key: t.key, budget: '2' }).paidFetch(`${t.api}/eigenbeleg`, body), /the API asks 2\.5 DOI; the budget per payment is 2 DOI/);
		assert.equal(t.chain.requests.includes('blockchain.transaction.broadcast'), false, 'nothing was signed or sent');
		const noDoi = /** @type {any} */ (async () => new Response('{}', { status: 402, headers: { 'payment-required': Buffer.from(JSON.stringify({ accepts: [{ scheme: 'exact', network: 'near:mainnet' }] })).toString('base64') } }));
		await assert.rejects(t.payer({ mode: 'key', key: t.key, fetch: noDoi }).paidFetch('http://api.example.com/eigenbeleg', body), /does not take DOI for this \(its 402 offers near:mainnet\)/);
		// no block ever comes: after two hours the agent stops and says how to go on
		let now = 0;
		const stuck = t.payer({ mode: 'key', key: t.key, clock: () => now }, () => void (now += 1_800_000));
		await assert.rejects(stuck.paidFetch(`${t.api}/eigenbeleg`, body), /still no documents after 2 hours; the payment stays valid: run the same job again with --resume [0-9a-f]{64}/);
		assert.throws(() => t.payer({ mode: 'key' }), /needs a key: AGENT_DOI_KEY/);
		assert.throws(() => t.payer({ mode: 'key', resume: 'abc' }), /--resume takes the txid/);
	} finally {
		t.close();
	}
});

test('the DOI key: environment, a file only its owner reads, or the keychain; never quoted', async () => {
	assert.equal(await doiKey({}), undefined);
	assert.equal(await doiKey({ AGENT_DOI_KEY: ' made-up-key \n' }), 'made-up-key');
	const dir = await mkdtemp(join(tmpdir(), 'eb-agent-key-'));
	const file = join(dir, 'doi.key');
	await writeFile(file, 'made-up-key-in-a-file\n', { mode: 0o644 });
	await assert.rejects(doiKey({ AGENT_DOI_KEY_FILE: file }), /can be read by others: chmod 600/);
	await chmod(file, 0o600);
	assert.equal(await doiKey({ AGENT_DOI_KEY_FILE: file }), 'made-up-key-in-a-file');
	await assert.rejects(doiKey({ AGENT_DOI_KEY_FILE: join(dir, 'none') }), /no such file/);
	assert.equal(await doiKey({ AGENT_DOI_KEYCHAIN: 'eigenbeleg-agent-doi' }, async (service) => `key-of-${service}\n`), 'key-of-eigenbeleg-agent-doi');
	await assert.rejects(doiKey({ AGENT_DOI_KEYCHAIN: 'x; rm -rf' }, async () => ''), /the name of a keychain item/);
});
