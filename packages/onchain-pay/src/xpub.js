// SPDX-License-Identifier: AGPL-3.0-or-later
// Receiving addresses from an extended public key, so that every order can be
// paid to an address of its own and nobody but the wallet's owner can spend
// from it: the key here only derives addresses.
//
//   const addressAt = receiveAddresses(DOICHAIN, 'zpub…');
//   addressAt(0); addressAt(1); …            // m/…/0/0, m/…/0/1 as dc1q…
//
// The key is the account's (BIP84, m/84'/0'/0', as DoiWallet and other wallets
// export it), written as xpub or zpub: the same key under two prefixes. Who
// knows it sees every address and payment of the account, so it is kept like
// a secret: never in a result, an error or a log.

import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';

import { PaymentError } from './payment.js';

const VERSIONS = /** @type {Record<string, { public: number, private: number }>} */ ({
	xpub: { public: 0x0488b21e, private: 0x0488ade4 },
	zpub: { public: 0x04b24746, private: 0x04b2430c }
});

/**
 * @param {import('./networks.js').Network} network
 * @param {string} key the account's extended public key (xpub… or zpub…)
 * @returns {(index: number) => string} the native SegWit receiving address at an index
 */
export function receiveAddresses(network, key) {
	const no = () => new PaymentError('not an extended public key of an account (xpub… or zpub…)', 'PAYMENT_XPUB');
	const text = String(key ?? '').trim();
	const versions = VERSIONS[text.slice(0, 4)];
	if (!versions) throw no();
	/** @type {HDKey} */
	let receive;
	try {
		const account = HDKey.fromExtendedKey(text, versions);
		if (account.privateKey) throw new Error('private');
		receive = account.deriveChild(0);
	} catch {
		throw no();
	}
	const net = { bech32: network.bech32, pubKeyHash: network.pubKeyHash, scriptHash: network.scriptHash, wif: network.wif };
	return (index) => {
		if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) throw new PaymentError('not an address index', 'PAYMENT_XPUB');
		return /** @type {string} */ (btc.p2wpkh(/** @type {Uint8Array} */ (receive.deriveChild(index).publicKey), net).address);
	};
}
