// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import express from 'express';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { createPaywall, NETWORKS } from '../src/paywall.js';

test('x402 on Base and Ethereum: the 402 offers USDC on each, with its own price; this server is the facilitator', async () => {
	const key = generatePrivateKey();
	const payTo = '0x1111111111111111111111111111111111111111';
	const pw = await createPaywall({ mode: 'x402', networks: ['eip155:8453', 'eip155:1'], payToEvm: payTo, evmRelayerKey: key, prices: { 'eip155:1': '$1.00' } });
	assert.equal(pw.info.mode, 'x402');
	const accepts = /** @type {any[]} */ (pw.info.accepts);
	// A year on the plain route at twelve times the price; 1 to 12 months on the route per months, at months × the price.
	assert.deepEqual(/** @type {any} */ (pw.info).subscription.accepts, [{ network: 'eip155:8453', price: '$1.20' }, { network: 'eip155:1', price: '$12.00' }]);
	assert.equal(/** @type {any} */ (pw.info).subscription.perMonths.months, '1 to 12');
	assert.deepEqual(
		accepts.map((a) => [a.network, a.name, a.price, a.payTo, a.relayer, a.gasless]),
		[
			['eip155:8453', 'Base', '$0.10', payTo, privateKeyToAccount(key).address, true],
			['eip155:1', 'Ethereum', '$1.00', payTo, privateKeyToAccount(key).address, true]
		]
	);
	assert.ok(!JSON.stringify(pw.info).includes(key.slice(2, 20)), 'the relayer key is in no answer');

	const app = express();
	app.post('/eigenbeleg', express.json(), /** @type {any} */ (pw.middleware), (_req, res) => res.json({ ok: true }));
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	try {
		const { port } = /** @type {any} */ (server.address());
		const r = await fetch(`http://127.0.0.1:${port}/eigenbeleg`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
		assert.equal(r.status, 402);
		const required = JSON.parse(Buffer.from(r.headers.get('payment-required') ?? '', 'base64').toString());
		assert.deepEqual(
			required.accepts.map((/** @type {any} */ a) => [a.scheme, a.network, a.asset, a.amount, a.payTo]),
			[
				['exact', 'eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '100000', payTo],
				['exact', 'eip155:1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '1000000', payTo]
			]
		);
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
