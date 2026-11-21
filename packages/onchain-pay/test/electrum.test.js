// SPDX-License-Identifier: AGPL-3.0-or-later
// The ElectrumX connection (src/electrum.js) against a WebSocket in memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOICHAIN, PaymentError, connectElectrum, withServer } from '../src/index.js';
import { fakeChain } from './support/fake-electrum.js';

/**
 * A WebSocket constructor whose server answers with `answer(method, params)`.
 * @param {(method: string, params: unknown[]) => unknown} answer throws for a server error
 */
function fakeSocket(answer) {
	return /** @type {any} */ (
		class {
			/** @param {string} url */
			constructor(url) {
				this.url = url;
				if (url.includes('down.')) queueMicrotask(() => this.onerror?.({}));
				else queueMicrotask(() => this.onopen?.({}));
			}
			/** @param {string} text */
			send(text) {
				const { id, method, params } = JSON.parse(text);
				queueMicrotask(() => {
					let message;
					try {
						message = { jsonrpc: '2.0', id, result: answer(method, params) };
					} catch (e) {
						message = { jsonrpc: '2.0', id, error: { code: 2, message: `daemon error quoting ${JSON.stringify(params)}: ${/** @type {Error} */ (e).message}` } };
					}
					this.onmessage?.({ data: JSON.stringify(message) });
				});
			}
			close() {}
		}
	);
}

test('requests and answers by id; a server error keeps its code and none of what was sent', async () => {
	const asked = /** @type {string[]} */ ([]);
	const WebSocket = fakeSocket((method) => {
		asked.push(method);
		if (method === 'blockchain.transaction.get') throw new Error('No such transaction');
		return method === 'server.version' ? ['ElectrumX 1.15.0', '1.4'] : { height: 500000 };
	});
	const server = await connectElectrum('wss://electrum.example.org:50004', { WebSocket });
	assert.equal(server.host, 'electrum.example.org:50004');
	assert.deepEqual(await server.request('blockchain.headers.subscribe'), { height: 500000 });
	await assert.rejects(server.request('blockchain.transaction.get', ['ab'.repeat(32), true]), (e) => {
		assert.ok(e instanceof PaymentError);
		assert.equal(e.code, 'ELECTRUM_REFUSED');
		assert.equal(e.message, 'electrum.example.org:50004 refused a request (2)');
		return true;
	});
	assert.deepEqual(asked, ['server.version', 'blockchain.headers.subscribe', 'blockchain.transaction.get']);
	server.close();
	await assert.rejects(server.request('blockchain.headers.subscribe'), /closed the connection/);
	await assert.rejects(connectElectrum('https://electrum.example.org', { WebSocket }), /not a WebSocket URL/);
	await assert.rejects(connectElectrum('wss://down.example.org:50004', { WebSocket }), /cannot reach down\.example\.org:50004/);
});

test('withServer: the first server that answers on the valid chain; what the work throws is not tried again elsewhere', async () => {
	const good = fakeChain(DOICHAIN);
	const other = fakeChain(DOICHAIN, { wrongChain: true });
	const tried = /** @type {string[]} */ ([]);
	const closed = /** @type {string[]} */ ([]);
	const connect = async (/** @type {string} */ url) => {
		tried.push(url);
		if (url.includes('down')) throw new PaymentError('cannot reach it', 'ELECTRUM_UNREACHABLE');
		const chain = url.includes('old') ? other : good;
		return { host: url, request: chain.server.request, close: () => closed.push(url) };
	};
	const servers = ['wss://down.example.org:50004', 'wss://old.example.org:50004', 'wss://good.example.org:50004', 'wss://spare.example.org:50004'];
	assert.equal(await withServer(good.network, async (s) => s.host, { servers, connect }), 'wss://good.example.org:50004');
	assert.deepEqual(tried, servers.slice(0, 3));
	assert.deepEqual(closed, ['wss://old.example.org:50004', 'wss://good.example.org:50004']);

	tried.length = 0;
	await assert.rejects(withServer(good.network, async () => { throw new Error('the work failed'); }, { servers: servers.slice(2), connect }), /the work failed/);
	assert.deepEqual(tried, ['wss://good.example.org:50004'], 'not run again on the spare');
	await assert.rejects(withServer(good.network, async () => 1, { servers: servers.slice(0, 2), connect }), (e) => /** @type {any} */ (e).code === 'PAYMENT_SERVER');
});
