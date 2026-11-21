// SPDX-License-Identifier: AGPL-3.0-or-later
// An ElectrumX server over WebSocket, as Node 22 and a browser both reach it:
// JSON-RPC 2.0, one text frame per message, answers matched by id.
//
//   const server = await connectElectrum('wss://host:50004');
//   await server.request('blockchain.headers.subscribe');
//   server.close();
//
//   await withServer(DOICHAIN, (server) => checkPayment({ network: DOICHAIN, server, … }));
//
// Only requests and their answers; a server's notifications are dropped. The
// server sees what it is asked and the caller's IP address. Error messages
// name the host at most: a request's parameters carry script hashes and
// transactions of the caller.

import { PaymentError, verifyChain } from './payment.js';

/**
 * @typedef {object} ElectrumServer
 * @property {string} host
 * @property {(method: string, params?: unknown[]) => Promise<any>} request
 * @property {() => void} close
 */

/** Codes of errors that say the server could not be asked, not what it answered. */
export const UNREACHABLE = Object.freeze(['ELECTRUM_URL', 'ELECTRUM_NO_WEBSOCKET', 'ELECTRUM_TIMEOUT', 'ELECTRUM_UNREACHABLE', 'ELECTRUM_CLOSED', 'PAYMENT_SERVER']);

/** @param {string} url */
const hostOf = (url) => {
	try {
		return new URL(url).host;
	} catch {
		return 'the server';
	}
};

/**
 * @param {string} url `wss://host:port`
 * @param {object} [options]
 * @param {typeof WebSocket} [options.WebSocket] the constructor to use (a test's fake)
 * @param {number} [options.timeoutMs] for the connection and for each request
 * @param {string} [options.client] the name given in `server.version`
 * @returns {Promise<ElectrumServer>}
 */
export async function connectElectrum(url, { WebSocket: Socket = globalThis.WebSocket, timeoutMs = 20_000, client = 'eigenbeleg' } = {}) {
	const host = hostOf(url);
	if (!/^wss?:\/\//.test(String(url))) throw new PaymentError(`not a WebSocket URL: ${host}`, 'ELECTRUM_URL');
	if (typeof Socket !== 'function') throw new PaymentError('no WebSocket in this runtime', 'ELECTRUM_NO_WEBSOCKET');

	/** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
	const waiting = new Map();
	let next = 0;
	let closed = false;
	const socket = new Socket(url);

	const failAll = (/** @type {Error} */ error) => {
		for (const w of waiting.values()) {
			clearTimeout(w.timer);
			w.reject(error);
		}
		waiting.clear();
	};

	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.close();
			reject(new PaymentError(`${host} did not answer`, 'ELECTRUM_TIMEOUT'));
		}, timeoutMs);
		socket.onopen = () => {
			clearTimeout(timer);
			resolve(undefined);
		};
		socket.onerror = () => {
			clearTimeout(timer);
			reject(new PaymentError(`cannot reach ${host}`, 'ELECTRUM_UNREACHABLE'));
		};
	});

	socket.onerror = () => failAll(new PaymentError(`the connection to ${host} failed`, 'ELECTRUM_UNREACHABLE'));
	socket.onclose = () => {
		closed = true;
		failAll(new PaymentError(`${host} closed the connection`, 'ELECTRUM_CLOSED'));
	};
	socket.onmessage = (/** @type {{ data: unknown }} */ event) => {
		let message;
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}
		const w = waiting.get(message?.id);
		if (!w) return;
		waiting.delete(message.id);
		clearTimeout(w.timer);
		if (message.error) {
			// The server's own text can quote what it was sent; only its code is kept.
			const code = Number.isInteger(message.error?.code) ? ` (${message.error.code})` : '';
			w.reject(new PaymentError(`${host} refused a request${code}`, 'ELECTRUM_REFUSED'));
		} else w.resolve(message.result);
	};

	/** @type {ElectrumServer} */
	const server = {
		host,
		request(method, params = []) {
			if (closed) return Promise.reject(new PaymentError(`${host} closed the connection`, 'ELECTRUM_CLOSED'));
			const id = ++next;
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					waiting.delete(id);
					reject(new PaymentError(`${host} did not answer`, 'ELECTRUM_TIMEOUT'));
				}, timeoutMs);
				waiting.set(id, { resolve, reject, timer });
				socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
			});
		},
		close() {
			closed = true;
			socket.onclose = null;
			socket.close();
			failAll(new PaymentError(`the connection to ${host} was closed`, 'ELECTRUM_CLOSED'));
		}
	};
	try {
		await server.request('server.version', [client, '1.4']);
	} catch (error) {
		server.close();
		throw error;
	}
	return server;
}

/**
 * Runs `fn` with the first of the network's servers that answers and follows
 * the valid chain, and closes the connection. Only reaching a server is tried
 * again on the next one: what `fn` throws is thrown on, so a transaction is
 * never sent twice.
 *
 * @template T
 * @param {import('./networks.js').Network} network
 * @param {(server: ElectrumServer) => Promise<T>} fn
 * @param {object} [options]
 * @param {string[]} [options.servers] instead of the network's
 * @param {(url: string) => Promise<ElectrumServer>} [options.connect]
 * @returns {Promise<T>}
 */
export async function withServer(network, fn, { servers = network.electrum, connect = connectElectrum } = {}) {
	for (const url of servers) {
		let server;
		try {
			server = await connect(url);
			if (!(await verifyChain(network, server))) {
				server.close();
				continue;
			}
		} catch {
			server?.close();
			continue;
		}
		try {
			return await fn(server);
		} finally {
			server.close();
		}
	}
	throw new PaymentError(`no ElectrumX server of ${network.name} answers on the valid chain`, 'PAYMENT_SERVER');
}
