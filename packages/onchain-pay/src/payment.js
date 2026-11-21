// SPDX-License-Identifier: AGPL-3.0-or-later
// A plain payment on a Bitcoin-like chain, through an ElectrumX server
// (issue #57). Four things, and the network is a parameter of each:
//
//   paymentUri     `doichain:<address>?amount=2.5`, what a wallet scans
//   buildPayment   coins of a key → a signed transaction (not sent)
//   broadcast      hand a signed transaction to the network
//   checkPayment   does this transaction pay that address that amount, and
//                  how many blocks deep is it?
//
// The server is whatever answers ElectrumX requests: `{ request(method,
// params) }`, e.g. `connectElectrum()` of @le-space/chains. It sees the script
// hashes it is asked for and the caller's IP address.
//
// The key: a WIF string or 32 bytes, used to sign and nothing else. It is
// never part of a result or an error message. Payments are made from the
// key's native SegWit address (P2WPKH: `dc1q…`, `bc1q…`); that is where the
// payer keeps the coins to spend.
//
// Doichain: a name is a coin whose script carries the name in front of the
// address script, and ElectrumX lists it among the address's coins. Spending
// it in a payment would give the name away. So only coins whose script is
// exactly the address's own are spent, and only an output with exactly the
// recipient's script counts as paid.
//
// Amounts are integers of the smallest unit (bigint), or decimal strings of
// the coin where a person reads them. No floats, except the node's own JSON
// numbers, which are rounded to the unit on the way in.

import * as btc from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/** @typedef {import('./networks.js').Network} Network */
/** @typedef {{ request: (method: string, params?: unknown[]) => Promise<any> }} Server */

/** A transaction spends at most this many coins: each one makes it larger and links one more coin to the others. */
export const MAX_INPUTS = 20;
/** A transaction that can still be replaced has an input with a sequence below this (BIP125). */
const FINAL_SEQUENCE = 0xfffffffe;

export class PaymentError extends Error {
	/** @param {string} message @param {string} code */
	constructor(message, code) {
		super(message);
		this.name = 'PaymentError';
		this.code = code;
	}
}

/** What @scure/btc-signer needs of a network. @param {Network} network */
const params = (network) => ({
	bech32: network.bech32,
	pubKeyHash: network.pubKeyHash,
	scriptHash: network.scriptHash,
	wif: network.wif
});

/**
 * The output script of an address, or null where it is none of this network.
 *
 * @param {Network} network
 * @param {string} address
 * @returns {Uint8Array | null}
 */
export function scriptOf(network, address) {
	try {
		return btc.OutScript.encode(btc.Address(params(network)).decode(String(address)));
	} catch {
		return null;
	}
}

/** @param {Network} network @param {string} address */
export const isAddress = (network, address) => scriptOf(network, address) !== null;

/** What ElectrumX knows a script by: its SHA-256, byte-reversed. @param {Uint8Array} script */
export const scripthashOf = (script) => bytesToHex(sha256(script).reverse());

/** A block's hash from its header (the first 80 bytes; a merge-mined header carries more). @param {string} headerHex */
export function blockHash(headerHex) {
	return bytesToHex(sha256(sha256(hexToBytes(headerHex.slice(0, 160)))).reverse());
}

/**
 * Does this server follow the network's valid chain? True where the network
 * names no checkpoint.
 *
 * @param {Network} network
 * @param {Server} server
 */
export async function verifyChain(network, server) {
	if (!network.checkpoint) return true;
	const header = await server.request('blockchain.block.header', [network.checkpoint.height]);
	const hex = typeof header === 'string' ? header : String(header?.header ?? '');
	return /^[0-9a-f]{160,}$/i.test(hex) && blockHash(hex) === network.checkpoint.hash;
}

/**
 * `2.5` → 250000000n. Throws on anything that is no plain decimal of the coin.
 *
 * @param {Network} network
 * @param {string} amount
 */
export function toUnits(network, amount) {
	const m = /^(\d+)(?:\.(\d+))?$/.exec(String(amount));
	if (!m || (m[2]?.length ?? 0) > network.decimals)
		throw new PaymentError(`not an amount of ${network.symbol}`, 'PAYMENT_AMOUNT');
	return BigInt(m[1] + (m[2] ?? '').padEnd(network.decimals, '0'));
}

/** 250000000n → `2.5`. @param {Network} network @param {bigint} units */
export function fromUnits(network, units) {
	const s = units.toString().padStart(network.decimals + 1, '0');
	const frac = s.slice(-network.decimals).replace(/0+$/, '');
	return `${s.slice(0, -network.decimals)}${frac ? `.${frac}` : ''}`;
}

/** A node's amount (a JSON number of the coin) → units. @param {Network} network @param {unknown} value */
const unitsOfNode = (network, value) => BigInt(Math.round(Number(value ?? 0) * 10 ** network.decimals));

/**
 * The payment URI a wallet scans (BIP21 with the network's scheme).
 *
 * @param {Network} network
 * @param {object} p
 * @param {string} p.address
 * @param {bigint} [p.amount] units; left out, the wallet asks
 * @param {string} [p.label] shown by the wallet as the memo
 */
export function paymentUri(network, { address, amount, label }) {
	if (!isAddress(network, address))
		throw new PaymentError(`not a ${network.name} address`, 'PAYMENT_ADDRESS');
	const query = [
		amount !== undefined && amount > 0n ? `amount=${fromUnits(network, amount)}` : '',
		label ? `label=${encodeURIComponent(label)}` : ''
	].filter(Boolean);
	return `${network.uriScheme}:${address}${query.length ? `?${query.join('&')}` : ''}`;
}

/** @param {Network} network @param {string} txid */
export const explorerTx = (network, txid) => network.explorer.tx.replace('{tx}', encodeURIComponent(txid));

/**
 * The key as 32 bytes, from WIF or bytes. Its error never quotes the input.
 *
 * @param {Network} network
 * @param {string | Uint8Array} key
 */
function privateKey(network, key) {
	try {
		const bytes = typeof key === 'string' ? btc.WIF(params(network)).decode(key.trim()) : key;
		if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('length');
		secp256k1.getPublicKey(bytes, true);
		return bytes;
	} catch {
		throw new PaymentError(`not a private key of ${network.name}`, 'PAYMENT_KEY');
	}
}

/**
 * The address a key pays from (native SegWit).
 *
 * @param {Network} network
 * @param {string | Uint8Array} key WIF or 32 bytes
 */
export function addressOfKey(network, key) {
	const spend = btc.p2wpkh(secp256k1.getPublicKey(privateKey(network, key), true), params(network));
	return /** @type {string} */ (spend.address);
}

/** The size of a transaction with `inputs` P2WPKH inputs, signatures at their largest. @param {number} inputs @param {Uint8Array[]} outputScripts */
export function estimateVsize(inputs, outputScripts) {
	const varint = (/** @type {number} */ n) => (n < 0xfd ? 1 : 3);
	let base = 4 + varint(inputs) + varint(outputScripts.length) + 4 + inputs * (32 + 4 + 1 + 4);
	for (const script of outputScripts) base += 8 + varint(script.length) + script.length;
	const witness = 2 + inputs * (1 + 1 + 73 + 1 + 33);
	return Math.ceil((base * 4 + witness) / 4);
}

/**
 * The spendable coins of an address: confirmed, and with exactly the
 * address's script (never a name's coin).
 *
 * @param {Network} network
 * @param {Server} server
 * @param {string} address
 * @returns {Promise<{ txid: string, index: number, amount: bigint }[]>}
 */
export async function coinsOf(network, server, address) {
	const script = scriptOf(network, address);
	if (!script) throw new PaymentError(`not a ${network.name} address`, 'PAYMENT_ADDRESS');
	const own = bytesToHex(script);
	/** @type {{ tx_hash: string, tx_pos: number, height: number, value: number }[]} */
	const listed = (await server.request('blockchain.scripthash.listunspent', [scripthashOf(script)])) ?? [];
	const coins = [];
	for (const u of listed.filter((c) => Number(c.height) > 0)) {
		const tx = await server.request('blockchain.transaction.get', [u.tx_hash, true]);
		const out = tx?.vout?.[u.tx_pos];
		if (!out || String(out.scriptPubKey?.hex ?? '').toLowerCase() !== own || out.scriptPubKey?.nameOp)
			continue;
		coins.push({ txid: String(u.tx_hash), index: Number(u.tx_pos), amount: unitsOfNode(network, out.value) });
	}
	return coins;
}

/**
 * A signed payment from a key's coins: one output to the recipient, the
 * change back to the key's address, the fee at the network's floor unless a
 * higher rate is handed in. Nothing is sent; `broadcast` does that.
 *
 * @param {object} p
 * @param {Network} p.network
 * @param {Server} p.server
 * @param {string | Uint8Array} p.key WIF or 32 bytes
 * @param {string} p.to the recipient's address
 * @param {bigint} p.amount units
 * @param {number} [p.feeRate] units per vbyte; raised to the floor, capped at the network's maximum
 * @returns {Promise<{ hex: string, txid: string, from: string, fee: bigint, change: bigint, vsize: number, inputs: number }>}
 */
export async function buildPayment({ network, server, key, to, amount, feeRate }) {
	const priv = privateKey(network, key);
	const net = params(network);
	const spend = btc.p2wpkh(secp256k1.getPublicKey(priv, true), net);
	const from = /** @type {string} */ (spend.address);
	const toScript = scriptOf(network, to);
	if (!toScript) throw new PaymentError(`not a ${network.name} address`, 'PAYMENT_ADDRESS');
	if (typeof amount !== 'bigint' || amount < BigInt(network.dust))
		throw new PaymentError(`the amount is below what the network relays`, 'PAYMENT_AMOUNT');
	const rate = BigInt(
		Math.min(network.maxFeeRate, Math.max(network.minFeeRate, Math.ceil(Number(feeRate ?? 0) || 0)))
	);

	// Largest coins first: the fewest inputs, the smallest transaction.
	const coins = (await coinsOf(network, server, from)).sort((a, b) => (a.amount < b.amount ? 1 : -1));
	const picked = [];
	let total = 0n;
	let fee = 0n;
	let change = 0n;
	let enough = false;
	for (const coin of coins.slice(0, MAX_INPUTS)) {
		picked.push(coin);
		total += coin.amount;
		// with change if it is worth an output, else without and the rest goes to the fee
		const withChange = BigInt(estimateVsize(picked.length, [toScript, spend.script])) * rate;
		const without = BigInt(estimateVsize(picked.length, [toScript])) * rate;
		if (total >= amount + withChange + BigInt(network.dust)) {
			fee = withChange;
			change = total - amount - fee;
			enough = true;
			break;
		}
		if (total >= amount + without) {
			fee = total - amount;
			change = 0n;
			enough = true;
			break;
		}
	}
	if (!enough)
		throw new PaymentError(
			coins.length > MAX_INPUTS
				? `the ${MAX_INPUTS} largest coins of the paying address do not cover the amount and the fee`
				: 'the paying address does not hold enough for the amount and the fee',
			'PAYMENT_FUNDS'
		);

	const tx = new btc.Transaction({ version: 2 });
	for (const coin of picked)
		tx.addInput({
			txid: coin.txid,
			index: coin.index,
			sequence: 0xffffffff, // final: cannot be replaced after it is sent
			witnessUtxo: { script: spend.script, amount: coin.amount }
		});
	tx.addOutput({ script: toScript, amount });
	if (change > 0n) tx.addOutput({ script: spend.script, amount: change });
	tx.sign(priv);
	tx.finalize();
	return { hex: tx.hex, txid: tx.id, from, fee, change, vsize: tx.vsize, inputs: picked.length };
}

/**
 * What a signed transaction pays, read from its bytes: for whoever is handed
 * one and must know what it does before sending it on.
 *
 * @param {Network} network
 * @param {string} hex
 * @returns {{ txid: string, vsize: number, replaceable: boolean, outputs: { script: string, address: string, amount: bigint }[] }}
 */
export function inspectPayment(network, hex) {
	let tx;
	try {
		if (!/^([0-9a-f]{2})+$/i.test(String(hex)) || hex.length > 200_000) throw new Error('hex');
		tx = btc.Transaction.fromRaw(hexToBytes(hex.toLowerCase()), {
			allowUnknownOutputs: true,
			allowUnknownInputs: true
		});
	} catch {
		throw new PaymentError('not a transaction', 'PAYMENT_TRANSACTION');
	}
	const address = btc.Address(params(network));
	const outputs = [];
	for (let i = 0; i < tx.outputsLength; i++) {
		const out = tx.getOutput(i);
		const script = /** @type {Uint8Array} */ (out.script);
		let to = '';
		try {
			to = address.encode(btc.OutScript.decode(script));
		} catch {
			// a script that is no address (a name's coin, a data output)
		}
		outputs.push({ script: bytesToHex(script), address: to, amount: BigInt(out.amount ?? 0n) });
	}
	let replaceable = false;
	for (let i = 0; i < tx.inputsLength; i++)
		if (Number(tx.getInput(i).sequence ?? 0xffffffff) < FINAL_SEQUENCE) replaceable = true;
	return { txid: tx.id, vsize: tx.vsize, replaceable, outputs };
}

/**
 * Hands a signed transaction to the network; the server's node checks it.
 *
 * @param {Server} server
 * @param {string} hex
 * @returns {Promise<string>} the txid
 */
export async function broadcast(server, hex) {
	let txid;
	try {
		txid = await server.request('blockchain.transaction.broadcast', [hex]);
	} catch {
		throw new PaymentError('the network refused the transaction', 'PAYMENT_REFUSED');
	}
	if (!/^[0-9a-f]{64}$/.test(String(txid)))
		throw new PaymentError('the server answered without a transaction id', 'PAYMENT_REFUSED');
	return String(txid);
}

/**
 * @typedef {object} PaymentState
 * @property {boolean} ok paid in full, to the address, final, and deep enough
 * @property {'' | 'unknown' | 'address' | 'amount' | 'replaceable' | 'unconfirmed'} reason why not, '' when ok
 * @property {string} txid
 * @property {bigint} paid what the transaction pays the address, in units
 * @property {number} confirmations 0 while it waits for a block
 * @property {number} required
 * @property {boolean} replaceable it could still be replaced by another (only while unconfirmed)
 * @property {string} explorerUrl
 */

/**
 * Does a transaction pay an address an amount, and how deep is it?
 *
 * The answer is `ok` only with `confirmations >= minConfirmations`; with 0
 * asked for, a transaction in the mempool counts, unless it can be replaced.
 * `unconfirmed` is the one reason worth asking again for.
 *
 * @param {object} p
 * @param {Network} p.network
 * @param {Server} p.server
 * @param {string} p.txid
 * @param {string} p.address the recipient
 * @param {bigint} p.amount units, at least
 * @param {number} [p.minConfirmations] default 1
 * @returns {Promise<PaymentState>}
 */
export async function checkPayment({ network, server, txid, address, amount, minConfirmations = 1 }) {
	const script = scriptOf(network, address);
	if (!script) throw new PaymentError(`not a ${network.name} address`, 'PAYMENT_ADDRESS');
	if (!/^[0-9a-f]{64}$/.test(String(txid)))
		throw new PaymentError('not a transaction id', 'PAYMENT_TRANSACTION');
	/** @type {PaymentState} */
	const state = {
		ok: false,
		reason: 'unknown',
		txid,
		paid: 0n,
		confirmations: 0,
		required: minConfirmations,
		replaceable: false,
		explorerUrl: explorerTx(network, txid)
	};
	let tx;
	try {
		tx = await server.request('blockchain.transaction.get', [txid, true]);
	} catch {
		return state; // the server does not know it (yet)
	}
	if (!tx || !Array.isArray(tx.vout) || !Array.isArray(tx.vin)) return state;

	const own = bytesToHex(script);
	for (const out of tx.vout)
		if (String(out.scriptPubKey?.hex ?? '').toLowerCase() === own && !out.scriptPubKey?.nameOp)
			state.paid += unitsOfNode(network, out.value);
	state.confirmations = Math.max(0, Number(tx.confirmations ?? 0) || 0);
	state.replaceable =
		state.confirmations === 0 &&
		tx.vin.some((/** @type {any} */ i) => Number(i.sequence ?? 0xffffffff) < FINAL_SEQUENCE);

	if (state.paid === 0n) state.reason = 'address';
	else if (state.paid < amount) state.reason = 'amount';
	else if (state.replaceable) state.reason = 'replaceable';
	else if (state.confirmations < minConfirmations) state.reason = 'unconfirmed';
	else {
		state.ok = true;
		state.reason = '';
	}
	return state;
}
