// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import express from 'express';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { createPaywall, NETWORKS } from '../src/paywall.js';

test('x402 on Base and Ethereum: the 402 offers USDC on each, with its own price; this server is the facilitator', async () => {
	const key = generatePrivateKey();
	const payTo = '0x1111111111111111111111111111111111111111';
	const pw = await createPaywall({ mode: 'x402', networks: ['eip155:8453', 'eip155:1'], payToEvm: payTo, evmRelayerKey: key });
	assert.equal(pw.info.mode, 'x402');
	const accepts = /** @type {any[]} */ (pw.info.accepts);
	// The price follows the document; `price` is the default document's (eigenbelege), "beide" the sum.
	assert.deepEqual(
		accepts.map((a) => [a.network, a.name, a.price, a.prices, a.payTo, a.relayer, a.gasless]),
		[
			['eip155:8453', 'Base', '$0.005', { eigenbelege: '$0.005', kontoauszug: '$0.10', beide: '$0.105' }, payTo, privateKeyToAccount(key).address, true],
			['eip155:1', 'Ethereum', '$0.10', { eigenbelege: '$0.10', kontoauszug: '$1.00', beide: '$1.10' }, payTo, privateKeyToAccount(key).address, true]
		]
	);
	// A year on the plain route at twelve times the price (kontoauszug by default); 1 to 12 months on the route per months, at months × the price.
	assert.deepEqual(/** @type {any} */ (pw.info).subscription.accepts, [
		{ network: 'eip155:8453', price: '$1.20', prices: { eigenbelege: '$0.06', kontoauszug: '$1.20', beide: '$1.26' } },
		{ network: 'eip155:1', price: '$12.00', prices: { eigenbelege: '$1.20', kontoauszug: '$12.00', beide: '$13.20' } }
	]);
	assert.equal(/** @type {any} */ (pw.info).subscription.perMonths.months, '1 to 12');
	assert.ok(!JSON.stringify(pw.info).includes(key.slice(2, 20)), 'the relayer key is in no answer');

	const app = express();
	app.post(['/eigenbeleg', '/eigenbeleg/subscribe', '/eigenbeleg/subscribe/:months'], express.json(), /** @type {any} */ (pw.middleware), (_req, res) => res.json({ ok: true }));
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	try {
		const { port } = /** @type {any} */ (server.address());
		/** The amounts a 402 asks on Base and Ethereum. @param {string} path @param {object} body */
		const asked = async (path, body) => {
			const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			assert.equal(r.status, 402);
			const required = JSON.parse(Buffer.from(r.headers.get('payment-required') ?? '', 'base64').toString());
			return required.accepts.map((/** @type {any} */ a) => [a.scheme, a.network, a.asset, a.amount, a.payTo]);
		};
		assert.deepEqual(await asked('/eigenbeleg', {}), [
			['exact', 'eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '5000', payTo],
			['exact', 'eip155:1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '100000', payTo]
		]);
		const amounts = async (/** @type {string} */ path, /** @type {object} */ body) => (await asked(path, body)).map((/** @type {any[]} */ a) => a[3]);
		assert.deepEqual(await amounts('/eigenbeleg', { document: 'eigenbelege' }), ['5000', '100000']);
		assert.deepEqual(await amounts('/eigenbeleg', { document: 'kontoauszug' }), ['100000', '1000000']);
		assert.deepEqual(await amounts('/eigenbeleg', { document: 'beide' }), ['105000', '1100000']);
		// The subscription: kontoauszug unless the body says otherwise.
		assert.deepEqual(await amounts('/eigenbeleg/subscribe', {}), ['1200000', '12000000']);
		assert.deepEqual(await amounts('/eigenbeleg/subscribe', { document: 'eigenbelege' }), ['60000', '1200000']);
		assert.deepEqual(await amounts('/eigenbeleg/subscribe/3', { document: 'beide' }), ['315000', '3300000']);
	} finally {
		server.close();
	}
});

test('settings are checked before anything listens', async () => {
	await assert.rejects(createPaywall({ mode: 'x402', networks: ['eip155:10'] }), /unknown network eip155:10/);
	await assert.rejects(createPaywall({ mode: 'x402', networks: ['eip155:8453'] }), /PAY_TO_EVM/);
	await assert.rejects(createPaywall({ mode: 'x402', networks: ['eip155:8453'], payToEvm: '0x1111111111111111111111111111111111111111', evmRelayerKey: 'abc' }), /EVM_RELAYER_KEY/);
	await assert.rejects(createPaywall({ mode: 'near', networks: ['near:mainnet'] }), /PAY_TO/);
	await assert.rejects(createPaywall({ mode: /** @type {any} */ ('stripe') }), /unknown PAYWALL/);
	assert.deepEqual(Object.keys(NETWORKS), ['near:mainnet', 'near:testnet', 'eip155:8453', 'eip155:1']);
});

test('the test route\'s paywall: near:testnet only, testnet accounts only, off without TESTNET_PAY_TO', async () => {
	const { createTestnetPaywall, TESTNET_ROUTE } = await import('../src/paywall.js');
	const { KeyPair } = await import('@near-js/crypto');
	const relayerKey = KeyPair.fromRandom('ed25519').toString();
	assert.equal(await createTestnetPaywall({}), null, 'off');
	await assert.rejects(createTestnetPaywall({ payTo: 'wolkenfabrik.near', relayerId: 'relayer.testnet', relayerKey }), /TESTNET_PAY_TO must be a NEAR testnet account/);
	await assert.rejects(createTestnetPaywall({ payTo: 'wolkenfabrik.testnet', relayerId: 'relayer.near', relayerKey }), /TESTNET_RELAYER_ACCOUNT_ID/);
	await assert.rejects(createTestnetPaywall({ payTo: 'wolkenfabrik.testnet', relayerId: 'relayer.testnet', relayerKey, rpcUrl: 'https://rpc.mainnet.near.org' }), /testnet RPC/);
	const pw = await createTestnetPaywall({ payTo: 'wolkenfabrik.testnet', relayerId: 'relayer.testnet', relayerKey });
	assert.ok(pw?.middleware);
	assert.equal(TESTNET_ROUTE, 'POST /testnet/eigenbeleg');
	assert.deepEqual(pw?.info.accepts.map((/** @type {any} */ a) => [a.network, a.price, a.payTo, a.relayer]), [['near:testnet', '$0.005', 'wolkenfabrik.testnet', 'relayer.testnet']]);
	assert.ok(!JSON.stringify(pw?.info).includes(relayerKey.slice(8, 30)), 'the key is in no answer');
});
