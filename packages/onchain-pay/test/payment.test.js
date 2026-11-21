// SPDX-License-Identifier: AGPL-3.0-or-later
// A plain payment, against a chain in memory: the URI, a signed transaction
// from a key's coins, sending it, and recognising it at the recipient.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	BITCOIN,
	DOICHAIN,
	MAX_INPUTS,
	PaymentError,
	addressOfKey,
	broadcast,
	buildPayment,
	checkPayment,
	coinsOf,
	estimateVsize,
	explorerTx,
	fromUnits,
	inspectPayment,
	isAddress,
	paymentUri,
	scriptOf,
	toUnits,
	verifyChain
} from '../src/index.js';
import { fakeChain, fakeKey } from './support/fake-electrum.js';

const PAYER = fakeKey('an agent');
const SHOP = fakeKey('the service that is paid');
const doi = (/** @type {string} */ amount) => toUnits(DOICHAIN, amount);

/** A chain on which the payer holds two coins and a name. */
function setUp(network = DOICHAIN) {
	const chain = fakeChain(network);
	const payer = addressOfKey(chain.network, PAYER);
	const shop = addressOfKey(chain.network, SHOP);
	chain.fund(payer, toUnits(network, '3'));
	chain.fund(payer, toUnits(network, '1.5'));
	return { chain, payer, shop, network: chain.network, server: chain.server };
}

test('amounts are integers of the smallest unit, to and from the coin', () => {
	assert.equal(doi('2.5'), 250_000_000n);
	assert.equal(doi('0.00000001'), 1n);
	assert.equal(fromUnits(DOICHAIN, 250_000_000n), '2.5');
	assert.equal(fromUnits(DOICHAIN, 1n), '0.00000001');
	assert.equal(fromUnits(DOICHAIN, 300_000_000n), '3');
	for (const bad of ['2,5', '-1', '1e3', '0.000000001', '', ' 1'])
		assert.throws(() => toUnits(DOICHAIN, bad), (/** @type {any} */ e) => e.code === 'PAYMENT_AMOUNT', bad);
});

test('an address belongs to its network', () => {
	const doiAddress = addressOfKey(DOICHAIN, PAYER);
	const btcAddress = addressOfKey(BITCOIN, PAYER);
	assert.match(doiAddress, /^dc1q/);
	assert.match(btcAddress, /^bc1q/);
	assert.ok(isAddress(DOICHAIN, doiAddress));
	assert.equal(isAddress(DOICHAIN, btcAddress), false);
	assert.equal(isAddress(BITCOIN, doiAddress), false);
	assert.equal(isAddress(DOICHAIN, doiAddress.slice(0, -1) + (doiAddress.endsWith('q') ? 'p' : 'q')), false);
	assert.equal(scriptOf(DOICHAIN, doiAddress)?.length, 22);
});

test('the payment URI is what a wallet scans: scheme, address, amount, label', () => {
	const address = addressOfKey(DOICHAIN, SHOP);
	assert.equal(paymentUri(DOICHAIN, { address, amount: doi('2.5') }), `doichain:${address}?amount=2.5`);
	assert.equal(paymentUri(DOICHAIN, { address }), `doichain:${address}`);
	assert.equal(
		paymentUri(DOICHAIN, { address, amount: doi('0.1'), label: 'EB 2026/001 & more' }),
		`doichain:${address}?amount=0.1&label=EB%202026%2F001%20%26%20more`
	);
	assert.equal(
		paymentUri(BITCOIN, { address: addressOfKey(BITCOIN, SHOP), amount: 1500n }),
		`bitcoin:${addressOfKey(BITCOIN, SHOP)}?amount=0.000015`
	);
	assert.throws(() => paymentUri(DOICHAIN, { address: 'nobody' }), (/** @type {any} */ e) => e.code === 'PAYMENT_ADDRESS');
});

test('a payment: one output to the recipient, the change back, the fee at the floor', async () => {
	const { chain, network, server, payer, shop } = setUp();
	const built = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('2.25') });
	assert.equal(built.from, payer);
	assert.equal(built.inputs, 1, 'the largest coin covers it');
	assert.equal(built.fee, BigInt(estimateVsize(1, [scriptOf(network, shop), scriptOf(network, payer)].map((s) => /** @type {Uint8Array} */ (s))) * network.minFeeRate));
	assert.equal(built.change, doi('3') - doi('2.25') - built.fee);
	assert.ok(built.fee >= BigInt(built.vsize * network.minFeeRate), 'never below what a node relays');

	const seen = inspectPayment(network, built.hex);
	assert.equal(seen.txid, built.txid);
	assert.equal(seen.replaceable, false);
	assert.deepEqual(
		seen.outputs.map((o) => [o.address, o.amount]),
		[
			[shop, doi('2.25')],
			[payer, built.change]
		]
	);
	// nothing was sent yet
	assert.ok(!chain.requests.includes('blockchain.transaction.broadcast'));
});

test('sent, it waits for a block; one block later it is paid', async () => {
	const { chain, network, server, shop } = setUp();
	const amount = doi('2.25');
	const built = await buildPayment({ network, server, key: PAYER, to: shop, amount });
	assert.equal((await checkPayment({ network, server, txid: built.txid, address: shop, amount })).reason, 'unknown');

	assert.equal(await broadcast(server, built.hex), built.txid);
	const waiting = await checkPayment({ network, server, txid: built.txid, address: shop, amount });
	assert.deepEqual(
		[waiting.ok, waiting.reason, waiting.confirmations, waiting.required, waiting.paid],
		[false, 'unconfirmed', 0, 1, amount]
	);
	assert.equal(waiting.explorerUrl, `https://doi-explorer.le-space.de/tx/${built.txid}`);
	assert.equal(explorerTx(network, built.txid), waiting.explorerUrl);
	// who asks for none takes it from the mempool
	assert.equal((await checkPayment({ network, server, txid: built.txid, address: shop, amount, minConfirmations: 0 })).ok, true);

	chain.mine();
	const paid = await checkPayment({ network, server, txid: built.txid, address: shop, amount });
	assert.deepEqual([paid.ok, paid.reason, paid.confirmations], [true, '', 1]);
	chain.mine(2);
	assert.equal((await checkPayment({ network, server, txid: built.txid, address: shop, amount, minConfirmations: 3 })).ok, true);
	assert.equal((await checkPayment({ network, server, txid: built.txid, address: shop, amount, minConfirmations: 4 })).reason, 'unconfirmed');

	// the change is spendable again, the spent coin is gone
	const coins = await coinsOf(network, server, built.from);
	assert.deepEqual(coins.map((c) => c.amount).sort(), [doi('1.5'), built.change].sort());
});

test('too little, or to someone else, is not this payment', async () => {
	const { chain, network, server, shop, payer } = setUp();
	const built = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1') });
	await broadcast(server, built.hex);
	chain.mine();
	const short = await checkPayment({ network, server, txid: built.txid, address: shop, amount: doi('2.25') });
	assert.deepEqual([short.ok, short.reason, short.paid], [false, 'amount', doi('1')]);
	const other = addressOfKey(network, fakeKey('somebody else'));
	assert.equal((await checkPayment({ network, server, txid: built.txid, address: other, amount: doi('1') })).reason, 'address');
	// the change is a payment to the payer, not to the shop
	assert.equal((await checkPayment({ network, server, txid: built.txid, address: payer, amount: built.change })).ok, true);
});

test('a name’s coin is never spent, and never counts as paid', async () => {
	const { chain, network, server, payer, shop } = setUp();
	const nameCoin = chain.fund(payer, doi('100'), { nameOp: { op: 'name_doi', name: 'e/wolkenfabrik-example' } });
	// ElectrumX lists it among the address's coins; the payment does not see it
	const coins = await coinsOf(network, server, payer);
	assert.deepEqual(coins.map((c) => c.amount).sort(), [doi('1.5'), doi('3')].sort());
	await assert.rejects(
		() => buildPayment({ network, server, key: PAYER, to: shop, amount: doi('50') }),
		(/** @type {any} */ e) => e.code === 'PAYMENT_FUNDS'
	);
	// and a name sent to the recipient is not a payment of its coin's value
	const toShop = chain.fund(shop, doi('100'), { nameOp: { op: 'name_update', name: 'e/wolkenfabrik-example' } });
	assert.equal((await checkPayment({ network, server, txid: toShop, address: shop, amount: doi('1') })).reason, 'address');
	assert.ok(nameCoin);
});

test('several coins when one is not enough; change too small for an output goes to the fee', async () => {
	const { network, server, shop, payer } = setUp();
	const both = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('4') });
	assert.equal(both.inputs, 2);
	assert.equal(both.change, doi('4.5') - doi('4') - both.fee);

	// leaves less than the dust limit: no change output, the rest is fee
	const fee1 = BigInt(estimateVsize(1, [/** @type {Uint8Array} */ (scriptOf(network, shop))]) * network.minFeeRate);
	const tight = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('3') - fee1 - 100n });
	assert.equal(tight.inputs, 1);
	assert.equal(tight.change, 0n);
	assert.equal(tight.fee, fee1 + 100n);
	assert.equal(inspectPayment(network, tight.hex).outputs.length, 1);

	await assert.rejects(
		() => buildPayment({ network, server, key: PAYER, to: shop, amount: doi('4.5') }),
		(/** @type {any} */ e) => e instanceof PaymentError && e.code === 'PAYMENT_FUNDS'
	);
	await assert.rejects(
		() => buildPayment({ network, server, key: PAYER, to: shop, amount: 10n }),
		(/** @type {any} */ e) => e.code === 'PAYMENT_AMOUNT'
	);
	await assert.rejects(
		() => buildPayment({ network, server, key: PAYER, to: 'nobody', amount: doi('1') }),
		(/** @type {any} */ e) => e.code === 'PAYMENT_ADDRESS'
	);
	assert.ok(payer);
});

test('unconfirmed coins are not spent; at most MAX_INPUTS coins', async () => {
	const chain = fakeChain(DOICHAIN);
	const payer = addressOfKey(chain.network, PAYER);
	const shop = addressOfKey(chain.network, SHOP);
	chain.fund(payer, doi('5'), { confirmed: false });
	await assert.rejects(
		() => buildPayment({ network: chain.network, server: chain.server, key: PAYER, to: shop, amount: doi('1') }),
		(/** @type {any} */ e) => e.code === 'PAYMENT_FUNDS'
	);
	for (let i = 0; i < MAX_INPUTS + 5; i++) chain.fund(payer, doi('0.1'));
	const many = await buildPayment({ network: chain.network, server: chain.server, key: PAYER, to: shop, amount: doi('1.9') });
	assert.equal(many.inputs, MAX_INPUTS);
	await assert.rejects(
		() => buildPayment({ network: chain.network, server: chain.server, key: PAYER, to: shop, amount: doi('2.2') }),
		/largest coins/
	);
});

test('a higher fee rate is taken, but never above the network’s maximum', async () => {
	const { network, server, shop } = setUp();
	const floor = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1') });
	const more = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1'), feeRate: 250 });
	const wild = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1'), feeRate: 1e9 });
	const low = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1'), feeRate: 1 });
	assert.equal(more.fee * 100n, floor.fee * 250n);
	assert.equal(wild.fee * BigInt(network.minFeeRate), floor.fee * BigInt(network.maxFeeRate));
	assert.equal(low.fee, floor.fee);
});

test('a transaction that can still be replaced is not final before its block', async () => {
	const { chain, network, server, shop } = setUp();
	const txid = chain.fund(shop, doi('2'), { confirmed: false, sequence: 0xfffffffd });
	const state = await checkPayment({ network, server, txid, address: shop, amount: doi('2'), minConfirmations: 0 });
	assert.deepEqual([state.ok, state.reason, state.replaceable], [false, 'replaceable', true]);
	chain.mine();
	assert.equal((await checkPayment({ network, server, txid, address: shop, amount: doi('2') })).ok, true);
});

test('what is handed over as a transaction is read before it is sent on', async () => {
	const { network, server, shop } = setUp();
	const built = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1') });
	for (const bad of ['', 'zz', '00', built.hex.slice(0, 40), 'a'.repeat(200_002)])
		assert.throws(() => inspectPayment(network, bad), (/** @type {any} */ e) => e.code === 'PAYMENT_TRANSACTION');
	await assert.rejects(() => broadcast(server, '00'), (/** @type {any} */ e) => e.code === 'PAYMENT_REFUSED');
	// the same coins cannot be spent twice
	await broadcast(server, built.hex);
	await assert.rejects(() => broadcast(server, built.hex), (/** @type {any} */ e) => e.code === 'PAYMENT_REFUSED');
	await assert.rejects(
		() => checkPayment({ network, server, txid: 'not-a-txid', address: shop, amount: 1n }),
		(/** @type {any} */ e) => e.code === 'PAYMENT_TRANSACTION'
	);
});

test('the key is never in an error or a result', async () => {
	const { network, server, shop } = setUp();
	const wif = 'TtestNotAKeyButLooksLikeOneTtestNotAKeyButLooksLikeO';
	for (const bad of [wif, new Uint8Array(31), new Uint8Array(32)]) {
		const error = await buildPayment({ network, server, key: bad, to: shop, amount: doi('1') }).catch((e) => e);
		assert.equal(error.code, 'PAYMENT_KEY');
		assert.ok(!error.message.includes('TtestNotAKey'));
	}
	const built = await buildPayment({ network, server, key: PAYER, to: shop, amount: doi('1') });
	const secret = Buffer.from(PAYER).toString('hex');
	assert.ok(!JSON.stringify(built, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).includes(secret));
});

test('the same code pays on Bitcoin: only the network differs', async () => {
	const { chain, network, server, shop } = setUp(BITCOIN);
	const amount = toUnits(BITCOIN, '0.5');
	const built = await buildPayment({ network, server, key: PAYER, to: shop, amount, feeRate: 12 });
	assert.match(built.from, /^bc1q/);
	const scripts = [scriptOf(network, shop), scriptOf(network, built.from)].map((s) => /** @type {Uint8Array} */ (s));
	assert.equal(built.fee, BigInt(estimateVsize(1, scripts) * 12));
	await broadcast(server, built.hex);
	chain.mine();
	const paid = await checkPayment({ network, server, txid: built.txid, address: shop, amount });
	assert.equal(paid.ok, true);
	assert.match(paid.explorerUrl, /^https:\/\/mempool\.space\/tx\//);
});

test('a server on another chain is told apart by the checkpoint; Bitcoin names none', async () => {
	const good = fakeChain(DOICHAIN);
	assert.equal(await verifyChain(good.network, good.server), true);
	const other = fakeChain(DOICHAIN, { wrongChain: true });
	assert.equal(await verifyChain(other.network, other.server), false);
	assert.equal(await verifyChain(BITCOIN, other.server), true);
	assert.equal(DOICHAIN.checkpoint?.height, 431018);
});
