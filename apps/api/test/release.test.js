// SPDX-License-Identifier: AGPL-3.0-or-later
// Production takes mainnet payments only (apps/api/src/release.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePrivateKey } from 'viem/accounts';

import { createPaywall, NETWORKS } from '../src/paywall.js';
import { checkPayments, isProduction, PRODUCTION_MARKER, TESTNET_NETWORKS } from '../src/release.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const server = join(root, 'apps/api/src/server.js');
const payToEvm = '0x1111111111111111111111111111111111111111';

/**
 * Starts the API as a child process and waits until it listens or exits.
 * @param {Record<string, string>} extra
 * @returns {Promise<{ code: number | null, out: string }>}
 */
function start(extra) {
	// Only what the test sets: nothing from the developer's shell or .env decides the outcome
	// (the .env loader fills only variables that are undefined, so each one is set here).
	const env = {
		PATH: process.env.PATH ?? '',
		HOME: process.env.HOME ?? '',
		HOST: '127.0.0.1',
		PORT: '0',
		PAYWALL: 'x402',
		PAY_NETWORKS: '',
		PAY_NETWORK: '',
		PAY_TO: '',
		RELAYER_ACCOUNT_ID: '',
		RELAYER_SECRET_KEY: '',
		PAY_TO_EVM: '',
		DOI_PAY_TO: '',
		DOI_XPUB: '',
		PRICE_DOI: '',
		EVM_RELAYER_KEY: '',
		NEAR_RPC_URL: '',
		ALCHEMY_KEY: '',
		SMTP_URL: '',
		SUBSCRIPTION_KEY: '',
		EIGENBELEG_PRODUCTION: '',
		EIGENBELEG_DEV_TESTNET: '',
		TESTNET_PAY_TO: '',
		TESTNET_RELAYER_ACCOUNT_ID: '',
		TESTNET_RELAYER_SECRET_KEY: '',
		TESTNET_NEAR_RPC_URL: '',
		...extra
	};
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [server], { env, stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		const timer = setTimeout(() => (child.kill(), reject(new Error(`no answer from server.js: ${out}`))), 20_000);
		const onData = (/** @type {Buffer} */ d) => {
			out += d;
			if (out.includes('eigenbeleg API on')) child.kill();
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.on('exit', (code) => (clearTimeout(timer), resolve({ code, out })));
	});
}

test('a production build refuses to start with a testnet payment network, even with the development flag', async () => {
	const r = await start({ EIGENBELEG_PRODUCTION: '1', PAY_NETWORKS: 'near:testnet', PAY_TO: 'eigenbeleg.testnet', RELAYER_ACCOUNT_ID: 'eigenbeleg.testnet', EIGENBELEG_DEV_TESTNET: '1' });
	assert.equal(r.code, 1, r.out);
	assert.match(r.out, /eigenbeleg API not started: production build: .*mainnet payments only/);
	assert.doesNotMatch(r.out, /eigenbeleg API on/);
});

test('a production build refuses to start with a testnet network next to mainnet ones', async () => {
	const r = await start({ EIGENBELEG_PRODUCTION: '1', PAY_NETWORKS: 'eip155:8453,near:testnet', PAY_TO_EVM: payToEvm, EVM_RELAYER_KEY: generatePrivateKey(), PAY_TO: 'eigenbeleg.testnet', RELAYER_ACCOUNT_ID: 'eigenbeleg.testnet' });
	assert.equal(r.code, 1, r.out);
	assert.match(r.out, /testnet network near:testnet/);
});

test('a production build refuses PAYWALL=none and a missing PAY_NETWORKS', async () => {
	const free = await start({ EIGENBELEG_PRODUCTION: '1', PAYWALL: 'none' });
	assert.equal(free.code, 1, free.out);
	assert.match(free.out, /PAYWALL=none/);
	const unset = await start({ EIGENBELEG_PRODUCTION: '1' });
	assert.equal(unset.code, 1, unset.out);
	assert.match(unset.out, /PAY_NETWORKS is not set/);
});

test('a production build starts with mainnet networks only', async () => {
	const r = await start({ EIGENBELEG_PRODUCTION: '1', PAY_NETWORKS: 'eip155:8453', PAY_TO_EVM: payToEvm, EVM_RELAYER_KEY: generatePrivateKey() });
	assert.match(r.out, /eigenbeleg API on .* production \(mainnet payments only\)/, r.out);
});

test('outside production, testnet payments need the development flag', async () => {
	const without = await start({ PAY_NETWORKS: 'near:testnet', PAY_TO: 'eigenbeleg.testnet', RELAYER_ACCOUNT_ID: 'eigenbeleg.testnet' });
	assert.equal(without.code, 1, without.out);
	assert.match(without.out, /set EIGENBELEG_DEV_TESTNET=1/);
});

test('the rules, one by one', () => {
	const ok = { production: true, allowTestnet: false, mode: 'x402', networks: ['near:mainnet', 'eip155:8453', 'eip155:1'] };
	assert.doesNotThrow(() => checkPayments(ok));
	assert.doesNotThrow(() => checkPayments({ ...ok, mode: 'ping', networks: [] }), 'PingPay is mainnet only');
	assert.throws(() => checkPayments({ ...ok, networks: ['near:mainnet', 'near:testnet'] }), /near:testnet/);
	assert.throws(() => checkPayments({ ...ok, allowTestnet: true }), /EIGENBELEG_DEV_TESTNET is set/);
	assert.throws(() => checkPayments({ ...ok, mode: 'none', networks: [] }), /PAYWALL=none/);
	assert.throws(() => checkPayments({ ...ok, networks: [] }), /PAY_NETWORKS is not set/);
	for (const url of ['https://rpc.testnet.fastnear.com', 'https://base-sepolia.g.alchemy.com/v2/k', 'http://127.0.0.1:8545']) {
		assert.throws(() => checkPayments({ ...ok, rpcUrls: [url] }), /payment RPC points at a test network/);
	}
	// The error names no URL: an RPC URL may carry an API key.
	assert.throws(() => checkPayments({ ...ok, rpcUrls: ['https://base-sepolia.g.alchemy.com/v2/SECRETKEY'] }), (e) => !String(e).includes('SECRETKEY'));
	assert.doesNotThrow(() => checkPayments({ ...ok, rpcUrls: ['https://rpc.mainnet.fastnear.com', 'https://base-mainnet.g.alchemy.com/v2/k'] }));

	const dev = { production: false, allowTestnet: false, mode: 'x402', networks: ['near:testnet'] };
	assert.throws(() => checkPayments(dev), /EIGENBELEG_DEV_TESTNET=1/);
	assert.doesNotThrow(() => checkPayments({ ...dev, allowTestnet: true }));
	assert.doesNotThrow(() => checkPayments({ ...dev, mode: 'none', networks: [] }));
});

test('every testnet network the paywall knows is on the list production refuses', () => {
	const marked = Object.entries(NETWORKS).filter(([, m]) => /** @type {any} */ (m).testnet).map(([n]) => n);
	assert.deepEqual(marked, [...TESTNET_NETWORKS]);
	for (const n of Object.keys(NETWORKS)) if (/test|sepolia|goerli|holesky/i.test(n)) assert.ok(TESTNET_NETWORKS.has(n), n);
});

test('createPaywall applies the rules', async () => {
	await assert.rejects(createPaywall({ mode: 'x402', networks: ['near:testnet'], production: true }), /production build/);
	await assert.rejects(createPaywall({ mode: 'x402', networks: ['near:testnet'] }), /EIGENBELEG_DEV_TESTNET=1/);
	await assert.rejects(createPaywall({ mode: 'none', production: true }), /PAYWALL=none/);
	await assert.rejects(createPaywall({ mode: 'x402' }), /PAY_NETWORKS/);
	const pw = await createPaywall({ mode: 'x402', production: true, networks: ['eip155:8453'], payToEvm, evmRelayerKey: generatePrivateKey() });
	assert.deepEqual(/** @type {any[]} */ (pw.info.accepts).map((a) => a.network), ['eip155:8453']);
});

test('the marker file or EIGENBELEG_PRODUCTION=1 makes production; the environment cannot switch it off', () => {
	const dir = mkdtempSync(join(tmpdir(), 'eigenbeleg-release-'));
	const marker = join(dir, 'production');
	assert.equal(isProduction({}, marker), false);
	assert.equal(isProduction({ EIGENBELEG_PRODUCTION: '1' }, marker), true);
	writeFileSync(marker, 'x');
	assert.equal(isProduction({}, marker), true);
	assert.equal(isProduction({ EIGENBELEG_PRODUCTION: '0' }, marker), true);
	assert.equal(isProduction({ EIGENBELEG_PRODUCTION: '' }, marker), true);
	// The marker is not in the repository: a checkout is a development build.
	assert.equal(isProduction({}), false, `${PRODUCTION_MARKER} exists in this checkout`);
});

test('the image is a production build: its final stage writes the marker', () => {
	const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
	const final = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
	assert.match(final, /> apps\/api\/production/, 'the final stage writes apps/api/production');
	assert.equal(join(root, 'apps/api/production'), PRODUCTION_MARKER);
	assert.ok(final.indexOf('apps/api/production') < final.indexOf('USER node'), 'written as root, before USER node');
	// Nothing in the image or the compose file sets the development flag.
	assert.doesNotMatch(dockerfile, /EIGENBELEG_DEV_TESTNET/);
	assert.doesNotMatch(readFileSync(join(root, 'deploy/compose.yaml'), 'utf8'), /EIGENBELEG_DEV_TESTNET/);
});

test('the image gives the data directory to the user the API runs as, so a new volume is writable', () => {
	const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
	const final = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
	const own = final.match(/RUN mkdir -p (\S+) && chown node:node \1/);
	assert.ok(own, 'the final stage creates the data directory and gives it to node');
	assert.equal(own[1], '/var/lib/eigenbeleg');
	assert.ok(final.indexOf(own[0]) < final.indexOf('USER node'), 'as root, before USER node');
	// The compose file mounts the volume there, and every store's default lies inside it.
	assert.match(readFileSync(join(root, 'deploy/compose.yaml'), 'utf8'), /- subscriptions:\/var\/lib\/eigenbeleg\n/);
	const server = readFileSync(join(root, 'apps/api/src/server.js'), 'utf8');
	const defaults = [...server.matchAll(/\?\? '(\/var\/lib\/[^']+)'/g)].map((m) => m[1]);
	assert.ok(defaults.length >= 2);
	for (const dir of defaults) assert.ok(dir === own[1] || dir.startsWith(`${own[1]}/`), `${dir} lies in the data directory`);
});

test('a production build charges the published prices only', async () => {
	const { PRICES, priceFor, timesMonths } = await import('@eigenbeleg/pipeline/prices');
	const { MONTHS } = await import('../src/subscriptions.js');
	const { SUBSCRIPTION_MONTHS } = await import('@eigenbeleg/pipeline/prices');
	assert.equal(SUBSCRIPTION_MONTHS, MONTHS);
	const base = { mode: /** @type {const} */ ('x402'), production: true, networks: ['eip155:8453', 'eip155:1'], payToEvm, evmRelayerKey: generatePrivateKey() };
	const pw = await createPaywall(base);
	const info = /** @type {any} */ (pw.info);
	assert.deepEqual(info.accepts.map((/** @type {any} */ a) => [a.network, a.price]), [['eip155:8453', priceFor('eip155:8453')], ['eip155:1', PRICES['eip155:1']]]);
	assert.deepEqual(info.subscription.accepts.map((/** @type {any} */ a) => a.price), [timesMonths(priceFor('eip155:8453')), timesMonths(PRICES['eip155:1'])]);
	await assert.rejects(createPaywall({ ...base, price: '$0.05' }), /the published one/);
	await assert.rejects(createPaywall({ ...base, prices: { 'eip155:1': '$2.00' } }), /eip155:1 is \$2\.00/);
	await assert.rejects(createPaywall({ ...base, subscriptionPrice: '$0.99' }), /PRICE_SUBSCRIPTION/);
	// The same values as the published ones are fine (an .env that still carries them).
	await createPaywall({ ...base, price: PRICES.default, prices: { 'eip155:1': PRICES['eip155:1'] } });
	// Development may set others.
	await createPaywall({ ...base, production: false, price: '$0.05' });
});

test('production takes testnet USDC on the test route only: it starts with it, the main paywall stays mainnet-only', async () => {
	const { KeyPair } = await import('@near-js/crypto');
	const key = () => KeyPair.fromRandom('ed25519').toString();
	const prod = { EIGENBELEG_PRODUCTION: '1', PAY_NETWORKS: 'eip155:8453', PAY_TO_EVM: payToEvm, EVM_RELAYER_KEY: generatePrivateKey() };
	const test = { TESTNET_PAY_TO: 'wolkenfabrik-test.testnet', TESTNET_RELAYER_ACCOUNT_ID: 'relayer-test.testnet', TESTNET_RELAYER_SECRET_KEY: key() };
	const on = await start({ ...prod, ...test });
	assert.match(on.out, /production \(mainnet payments only\)/);
	assert.match(on.out, /test route: \[\{"network":"near:testnet"/);
	assert.ok(!on.out.includes(test.TESTNET_RELAYER_SECRET_KEY.slice(8, 30)), 'the key is in no log line');
	// The test route never makes testnet a main payment network, and takes testnet accounts only.
	const mixed = await start({ ...prod, ...test, PAY_NETWORKS: 'eip155:8453,near:testnet' });
	assert.equal(mixed.code, 1);
	assert.match(mixed.out, /PAY_NETWORKS has the testnet network near:testnet/);
	const mainnetTo = await start({ ...prod, ...test, TESTNET_PAY_TO: 'le-space.near' });
	assert.equal(mainnetTo.code, 1);
	assert.match(mainnetTo.out, /TESTNET_PAY_TO must be a NEAR testnet account/);
	// Without TESTNET_PAY_TO it is off.
	assert.match((await start(prod)).out, /test route: off/);
});
