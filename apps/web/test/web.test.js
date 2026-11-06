// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KeyPair } from '@near-js/crypto';
import { KeyPairSigner } from '@near-js/signers';
import { actionCreators, buildDelegateAction, encodeSignedDelegate } from '@near-js/transactions';
import { ExactNearScheme } from '@x402/near/exact/client';

import { checkSignedDelegate, transferDelegate, walletSigner } from '../src/delegate.js';
import { cliCommand, decodeHeader, explorerUrl, paidBody, previewBody, previewKey, splitAddresses, usdc } from '../src/request.js';

/** @type {import('../src/request.js').FormValues} */
const form = {
	chain: 'near',
	network: 'testnet',
	addresses: 'wolkenfabrik.testnet\n wolkenfabrik.testnet, lager.testnet',
	periodMode: 'month',
	month: '2026-10',
	from: '',
	to: '',
	name: ' Wolkenfabrik Hosting GmbH ',
	postal: 'Musterstraße 1\n12345 Beispielstadt',
	number: 'EB-2026-007',
	statementNumber: 'KA-2026-10',
	includeKinds: ['fee', 'storage']
};

test('the preview body never carries the payer; the paid body does, with both files', () => {
	assert.deepEqual(splitAddresses(form.addresses), ['wolkenfabrik.testnet', 'lager.testnet']);
	const p = previewBody(form);
	assert.equal('payer' in p, false);
	assert.doesNotMatch(JSON.stringify(p), /Wolkenfabrik Hosting|Musterstraße/);
	assert.deepEqual(p.period, { month: '2026-10' });
	const paid = paidBody(form);
	assert.equal(paid.format, 'json');
	assert.deepEqual(paid.payer, { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' });
	assert.deepEqual(previewBody({ ...form, periodMode: 'range', from: '2026-10-01', to: '2026-10-15' }).period, { from: '2026-10-01', to: '2026-10-15' });
	// The payer's data does not change what was previewed; the addresses do.
	assert.equal(previewKey({ ...form, name: 'Other' }), previewKey(form));
	assert.notEqual(previewKey({ ...form, addresses: 'x.testnet' }), previewKey(form));
});

test('the CLI command is the same request, quoted, with placeholders for the payer', () => {
	const c = cliCommand({ ...form, number: "EB'1" }, 'http://127.0.0.1:4402');
	assert.match(c, /^npm run agent -- --api http:\/\/127\.0\.0\.1:4402 --chain near --network testnet --address wolkenfabrik\.testnet --address lager\.testnet --month 2026-10 /);
	assert.match(c, /--number 'EB'\\''1'/);
	assert.match(c, /--include fee,storage/);
	assert.match(c, /--statement KA-2026-10/);
	assert.equal(previewBody(form).statementNumber, 'KA-2026-10');
	assert.equal('statementNumber' in previewBody({ ...form, statementNumber: ' ' }), false);
	assert.doesNotMatch(c, /Wolkenfabrik Hosting|Musterstraße/);
	assert.match(c, /--name '<Name des Zahlers>'/);
});

test('headers, explorer links and amounts', () => {
	const h = Buffer.from(JSON.stringify({ transaction: 'Aqxuj1QQ6zBRyjhxhF24ocb46Dwtag63cjd5TKD8ynUX', network: 'near:testnet', note: 'ä' })).toString('base64');
	const s = decodeHeader(h);
	assert.equal(s.note, 'ä');
	assert.equal(explorerUrl(s.network, s.transaction), 'https://testnet.nearblocks.io/txns/Aqxuj1QQ6zBRyjhxhF24ocb46Dwtag63cjd5TKD8ynUX');
	assert.equal(explorerUrl('near:testnet', 'javascript:alert(1)'), null);
	assert.equal(decodeHeader('%%%'), null);
	assert.equal(usdc('100000'), '0,10 USDC');
	assert.equal(usdc('1234567'), '1,234567 USDC');
});

// A wallet as NEAR Connect presents it, backed by a throwaway key.
const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
const req = { scheme: 'exact', network: 'near:testnet', asset: USDC, payTo: 'eigenbeleg-api.testnet', amount: '100000', maxTimeoutSeconds: 300, extra: {} };
/** @param {(d: any) => any} [tamper] @param {string} [sender] */
function fakeWallet(tamper = (d) => d, sender) {
	const key = KeyPair.fromRandom('ed25519');
	const signer = new KeyPairSigner(key);
	const calls = [];
	return {
		calls,
		wallet: {
			/** @param {any} p */
			async signDelegateActions(p) {
				calls.push(p);
				const d = tamper(p.delegateActions[0]);
				const a = d.actions[0].params;
				const da = buildDelegateAction({
					senderId: sender ?? p.signerId,
					receiverId: d.receiverId,
					actions: [actionCreators.functionCall(a.methodName, a.args, BigInt(a.gas), BigInt(a.deposit))],
					nonce: 1n,
					maxBlockHeight: 200n,
					publicKey: key.getPublicKey()
				});
				const [, signed] = await signer.signDelegateAction(da);
				return { signedDelegateActions: [Buffer.from(encodeSignedDelegate(signed)).toString('base64')] };
			}
		}
	};
}

test('the wallet signer asks for exactly one ft_transfer and returns what x402 sends', async () => {
	const { wallet, calls } = fakeWallet();
	const lines = [];
	const signer = walletSigner({ wallet: /** @type {any} */ (wallet), accountId: 'zahler.testnet', network: 'testnet', confirmed: () => req, say: (l) => lines.push(l) });
	const out = await new ExactNearScheme(signer).createPaymentPayload(2, /** @type {any} */ (req));
	const b64 = /** @type {any} */ (out.payload).signedDelegateAction;
	const da = checkSignedDelegate(b64, req, 'zahler.testnet');
	assert.equal(da.receiverId, USDC);
	assert.deepEqual(calls[0].delegateActions, [transferDelegate(req)]);
	assert.equal(calls[0].network, 'testnet');
	assert.equal(lines.length, 2);
});

test('a wallet that signs something else, or a changed price, is refused before sending', async () => {
	const other = fakeWallet((d) => ({ ...d, actions: [{ ...d.actions[0], params: { ...d.actions[0].params, args: { receiver_id: 'dieb.testnet', amount: '100000' } } }] }));
	const s1 = walletSigner({ wallet: /** @type {any} */ (other.wallet), accountId: 'zahler.testnet', network: 'testnet', confirmed: () => req });
	await assert.rejects(s1.createSignedDelegateAction({ paymentRequirements: req }), /anderer Empfänger/);

	const more = fakeWallet((d) => ({ ...d, actions: [{ ...d.actions[0], params: { ...d.actions[0].params, args: { receiver_id: req.payTo, amount: '999999' } } }] }));
	const s2 = walletSigner({ wallet: /** @type {any} */ (more.wallet), accountId: 'zahler.testnet', network: 'testnet', confirmed: () => req });
	await assert.rejects(s2.createSignedDelegateAction({ paymentRequirements: req }), /anderer Betrag/);

	const honest = fakeWallet();
	const s3 = walletSigner({ wallet: /** @type {any} */ (honest.wallet), accountId: 'zahler.testnet', network: 'testnet', confirmed: () => req });
	await assert.rejects(s3.createSignedDelegateAction({ paymentRequirements: { ...req, amount: '200000' } }), /andere Zahlung/);
	assert.equal(honest.calls.length, 0, 'the wallet is not even asked');

	const elsewhere = fakeWallet(undefined, 'jemand-anderes.testnet');
	const s4 = walletSigner({ wallet: /** @type {any} */ (elsewhere.wallet), accountId: 'zahler.testnet', network: 'testnet', confirmed: () => req });
	await assert.rejects(s4.createSignedDelegateAction({ paymentRequirements: req }), /Absender/);
});
