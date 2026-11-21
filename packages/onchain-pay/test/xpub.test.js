// SPDX-License-Identifier: AGPL-3.0-or-later
// Receiving addresses from an account's extended public key (src/xpub.js),
// against the published test vector of BIP84 (the all-"abandon" mnemonic).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BITCOIN, DOICHAIN, PaymentError, isAddress, receiveAddresses } from '../src/index.js';

const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

test('the addresses a wallet shows for the same account: BIP84\'s test vector', () => {
	const at = receiveAddresses(BITCOIN, ZPUB);
	assert.equal(at(0), 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
	assert.equal(at(1), 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
	// the same key on Doichain gives Doichain's addresses, one per index
	const doi = receiveAddresses(DOICHAIN, ZPUB);
	assert.match(doi(0), /^dc1q/);
	assert.ok(isAddress(DOICHAIN, doi(7)));
	assert.equal(new Set([0, 1, 2, 3].map(doi)).size, 4);
});

test('anything but an account\'s public key is refused, and never quoted', () => {
	const xprv = 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi';
	for (const bad of ['', 'zpub', 'not a key', xprv, `${ZPUB.slice(0, -1)}x`, 'ypub6QqdH2c5z7967BioGSfAWFHM1EHzHPBZK7wrND3ZpEWFtzmCqvsD1bgpaE6pSAPkiSKhkuWPCJV6mZTSNMd2tK8xYTcJ48585pZecmSUzWp']) {
		assert.throws(() => receiveAddresses(DOICHAIN, bad), (e) => {
			assert.ok(e instanceof PaymentError);
			assert.equal(e.code, 'PAYMENT_XPUB');
			assert.ok(!bad || bad.length < 10 || !e.message.includes(bad.slice(4, 20)));
			return true;
		});
	}
	assert.throws(() => receiveAddresses(DOICHAIN, ZPUB)(-1), /not an address index/);
});
