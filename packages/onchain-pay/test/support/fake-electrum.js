// SPDX-License-Identifier: AGPL-3.0-or-later
// An ElectrumX server and the chain behind it, in memory, for tests: coins
// that can be funded, a mempool that takes a signed transaction, and blocks
// that are mined on request. It answers in the form a node decodes
// transactions (amounts as JSON numbers of the coin). Keys, addresses,
// transaction ids and amounts are made up.
//
//   const chain = fakeChain(DOICHAIN);
//   chain.fund(address, 500_000_000n);          // a confirmed coin
//   await broadcast(chain.server, hex);          // into the mempool
//   chain.mine();                                // one block deeper

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { blockHash, inspectPayment, scriptOf, scripthashOf } from '../../src/payment.js';

const utf8 = (/** @type {string} */ s) => new TextEncoder().encode(s);

/** A made-up private key. @param {string} seed */
export const fakeKey = (seed) => sha256(utf8(`onchain-pay key:${seed}`));

/** A made-up 80-byte block header. @param {string} seed */
export const fakeHeader = (seed) =>
	bytesToHex(Uint8Array.of(...sha256(utf8(`header a:${seed}`)), ...sha256(utf8(`header b:${seed}`)), ...new Uint8Array(16)));

/**
 * @param {import('../../src/networks.js').Network} base
 * @param {{ wrongChain?: boolean }} [options] wrongChain: the server follows another chain
 */
export function fakeChain(base, { wrongChain = false } = {}) {
	const header = fakeHeader('the valid chain');
	/** The network as the tests use it: with a checkpoint this fake can answer. */
	const network = Object.freeze({
		...base,
		checkpoint: base.checkpoint ? { height: 10, hash: blockHash(header) } : null
	});
	/**
	 * @typedef {{ script: string, units: bigint, nameOp?: { op: string, name: string } }} Out
	 * @type {Map<string, { height: number, vin: { txid: string, vout: number, sequence: number }[], vout: Out[] }>}
	 */
	const txs = new Map();
	/** @type {Set<string>} `txid:index` */
	const spent = new Set();
	let tip = 1000;
	let funded = 0;
	const requests = /** @type {string[]} */ ([]);

	const plain = (/** @type {string} */ address) => {
		const script = scriptOf(network, address);
		if (!script) throw new Error('the fake needs a valid address');
		return script;
	};

	/** @type {{ request: (method: string, params?: unknown[]) => Promise<any> }} */
	const server = {
		async request(method, params = []) {
			requests.push(method);
			const [first] = /** @type {any[]} */ (params);
			switch (method) {
				case 'blockchain.block.header':
					return wrongChain ? fakeHeader('another chain') : header;
				case 'blockchain.scripthash.listunspent': {
					const list = [];
					for (const [txid, tx] of txs)
						tx.vout.forEach((o, n) => {
							// A name's coin is filed under its address, as ElectrumX does.
							const address = o.nameOp ? o.script.slice(o.script.indexOf('|') + 1) : o.script;
							if (scripthashOf(Uint8Array.from(Buffer.from(address, 'hex'))) === first && !spent.has(`${txid}:${n}`))
								list.push({ tx_hash: txid, tx_pos: n, height: tx.height, value: Number(o.units) });
						});
					return list;
				}
				case 'blockchain.scripthash.get_history': {
					const list = [];
					for (const [txid, tx] of txs)
						if (tx.vout.some((o) => !o.nameOp && scripthashOf(Uint8Array.from(Buffer.from(o.script, 'hex'))) === first)) list.push({ tx_hash: txid, height: tx.height });
					return list;
				}
				case 'blockchain.transaction.get': {
					const tx = txs.get(first);
					if (!tx) throw new Error('No such mempool or blockchain transaction');
					return {
						txid: first,
						vin: tx.vin,
						vout: tx.vout.map((o, n) => ({
							value: Number(o.units) / 10 ** network.decimals,
							n,
							scriptPubKey: {
								// a name's script: the name in front (here: a marker), then the address script
								hex: o.nameOp ? `53${o.script.replace('|', '')}` : o.script,
								...(o.nameOp ? { nameOp: o.nameOp } : {})
							}
						})),
						...(tx.height > 0 ? { confirmations: tip - tx.height + 1 } : {})
					};
				}
				case 'blockchain.transaction.broadcast': {
					const seen = inspectPayment(network, first);
					const raw = (await import('@scure/btc-signer')).Transaction.fromRaw(
						Uint8Array.from(Buffer.from(first, 'hex')),
						{ allowUnknownOutputs: true, allowUnknownInputs: true }
					);
					const vin = [];
					let paid = 0n;
					for (let i = 0; i < raw.inputsLength; i++) {
						const input = raw.getInput(i);
						const id = bytesToHex(/** @type {Uint8Array} */ (input.txid));
						const coin = txs.get(id)?.vout[Number(input.index)];
						if (!coin || spent.has(`${id}:${input.index}`)) throw new Error('bad-txns-inputs-missingorspent');
						paid += coin.units;
						vin.push({ txid: id, vout: Number(input.index), sequence: Number(input.sequence) });
					}
					const out = seen.outputs.reduce((s, o) => s + o.amount, 0n);
					if (paid - out < BigInt(seen.vsize * network.minFeeRate)) throw new Error('min relay fee not met');
					for (const i of vin) spent.add(`${i.txid}:${i.vout}`);
					txs.set(seen.txid, { height: 0, vin, vout: seen.outputs.map((o) => ({ script: o.script, units: o.amount })) });
					return seen.txid;
				}
				default:
					throw new Error(`the fake does not answer ${method}`);
			}
		}
	};

	return {
		network,
		server,
		requests,
		/** The chain's height. */
		get tip() {
			return tip;
		},
		/**
		 * A coin for an address, from nowhere.
		 *
		 * @param {string} address
		 * @param {bigint} units
		 * @param {{ confirmed?: boolean, nameOp?: { op: string, name: string }, sequence?: number }} [o]
		 * @returns {string} its txid
		 */
		fund(address, units, { confirmed = true, nameOp, sequence = 0xffffffff } = {}) {
			const txid = bytesToHex(sha256(utf8(`funding:${++funded}`)));
			const script = bytesToHex(plain(address));
			txs.set(txid, {
				height: confirmed ? tip : 0,
				vin: [{ txid: bytesToHex(sha256(utf8(`earlier:${funded}`))), vout: 0, sequence }],
				vout: [{ script: nameOp ? `${bytesToHex(utf8(nameOp.name))}|${script}` : script, units, nameOp }]
			});
			return txid;
		},
		/** One more block: what waits in the mempool is in it. @param {number} [blocks] */
		mine(blocks = 1) {
			for (let i = 0; i < blocks; i++) {
				tip++;
				for (const tx of txs.values()) if (tx.height === 0) tx.height = tip;
			}
		},
		/** The outputs of a transaction the chain knows. @param {string} txid */
		outputsOf: (txid) => txs.get(txid)?.vout ?? []
	};
}
