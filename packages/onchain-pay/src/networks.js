// SPDX-License-Identifier: AGPL-3.0-or-later
// The chains a plain payment can be made on. Everything that differs between
// them is here, so the payment code has no chain of its own: Doichain today,
// Bitcoin by the same code (issue #62).

/**
 * @typedef {object} Network
 * @property {string} id
 * @property {string} name
 * @property {string} caip2
 * @property {string} symbol the coin
 * @property {number} decimals
 * @property {string} unit the smallest unit's name
 * @property {string} bech32 SegWit address prefix
 * @property {number} pubKeyHash version byte of a P2PKH address
 * @property {number} scriptHash version byte of a P2SH address
 * @property {number} wif version byte of a private key in WIF
 * @property {string} uriScheme the scheme of a payment URI (BIP21)
 * @property {number} minFeeRate smallest units per vbyte, the least a node relays
 * @property {number} maxFeeRate never pay more than this per vbyte, whatever a server says
 * @property {number} dust an output below this many units is not relayed
 * @property {number} blockSeconds the usual time between blocks
 * @property {{ height: number, hash: string } | null} checkpoint a block that tells the valid chain from another, or null
 * @property {string[]} electrum ElectrumX servers, `wss://host:port`
 * @property {{ tx: string, address: string }} explorer URLs with `{tx}` and `{address}`
 */

/**
 * Doichain, the chain of Doichain Core v31: its rules took effect at block
 * 431,017, and at 431,018 the old nodes went their own way with the same
 * genesis block. The checkpoint is the first block only the valid chain has.
 * A node relays nothing below 0.001 DOI per 1,000 vbytes; what a server
 * reports as its relay fee is far below that and is not used. `dust` is a
 * cautious figure, not Core's exact threshold: change below it goes to the
 * fee instead of making an output a node might refuse.
 *
 * @type {Network}
 */
export const DOICHAIN = Object.freeze({
	id: 'doichain',
	name: 'Doichain',
	caip2: 'bip122:000006fdd8b4d786fd9bdde5bae9486c',
	symbol: 'DOI',
	decimals: 8,
	unit: 'swartz',
	bech32: 'dc',
	pubKeyHash: 52,
	scriptHash: 13,
	wif: 180,
	uriScheme: 'doichain',
	minFeeRate: 100,
	maxFeeRate: 1000,
	dust: 54600,
	blockSeconds: 600,
	checkpoint: { height: 431018, hash: '71d50ff12b090561cc918ddb560334b4350758c7eace3f058dd332fb112f4b67' },
	electrum: [
		'wss://big-parrot-60.doi.works:50004',
		'wss://ugly-bird-70.doi.works:50004',
		'wss://pink-deer-69.doi.works:50004',
		'wss://itchy-jellyfish-89.doi.works:50004'
	],
	explorer: {
		tx: 'https://doi-explorer.le-space.de/tx/{tx}',
		address: 'https://doi-explorer.le-space.de/address/{address}'
	}
});

/**
 * Bitcoin, for the same code (issue #62). No servers are named: who runs this
 * says which ElectrumX server to ask. The fee floor is the relay minimum; a
 * real payment needs the rate of the hour, handed to `buildPayment`.
 *
 * @type {Network}
 */
export const BITCOIN = Object.freeze({
	id: 'bitcoin',
	name: 'Bitcoin',
	caip2: 'bip122:000000000019d6689c085ae165831e93',
	symbol: 'BTC',
	decimals: 8,
	unit: 'satoshi',
	bech32: 'bc',
	pubKeyHash: 0,
	scriptHash: 5,
	wif: 128,
	uriScheme: 'bitcoin',
	minFeeRate: 1,
	maxFeeRate: 500,
	dust: 294,
	blockSeconds: 600,
	checkpoint: null,
	electrum: [],
	explorer: {
		tx: 'https://mempool.space/tx/{tx}',
		address: 'https://mempool.space/address/{address}'
	}
});

/** @type {Readonly<Record<string, Network>>} */
export const NETWORKS = Object.freeze({ doichain: DOICHAIN, bitcoin: BITCOIN });
