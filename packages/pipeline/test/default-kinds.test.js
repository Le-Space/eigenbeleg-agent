// SPDX-License-Identifier: AGPL-3.0-or-later
// What goes on an Eigenbeleg by default (#116): only value consumed where
// nobody invoices. Network fees (like a bank's fees), rewards (like interest),
// own transfers, swaps and refundable deposits are documented by the account
// statement. No chain has a kind of payment by default; Aleph, Filecoin Pay and
// Akash have the month's consumption (step 3). Where there is nothing, a request
// for Eigenbelege alone is refused before anything is paid, one for both gets the
// statement alone. Every address here is made up.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FAKE_ALCHEMY_KEY } from '@le-space/chains/testing/alchemy';
import { NO_EIGENBELEG, NoEigenbelegNeeded, RequestError, blocksFor, parseRequest } from '../src/index.js';
import { statementReason, withStatementReasons } from '../src/reasons.js';

const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const today = '2026-11-25';
// Every block of the API with a key, the address check left out: the kinds are what is tested here.
const blocks = Object.fromEntries(Object.entries(blocksFor({ alchemyKey: FAKE_ALCHEMY_KEY })).map(([k, b]) => [k, { ...b, isAddress: () => true, canonical: undefined }]));
/** @param {string} chain @param {Record<string, unknown>} [over] */
const request = (chain, over = {}) => parseRequest({ chain, addresses: ['wolkenfabrik-example'], period: { month: '2026-10' }, payer, ...over }, { today, blocks });

test('every chain: no kind on an Eigenbeleg by default; the statement unchanged', () => {
	assert.deepEqual(Object.keys(blocks), ['near', 'akash', 'filecoin', 'doichain', 'bitcoin', 'filecoin-pay', 'aleph', 'ethereum', 'base']);
	for (const chain of Object.keys(blocks)) {
		const req = request(chain, { document: 'kontoauszug' });
		assert.deepEqual(req.includeKinds, [], chain);
		assert.equal(req.document, 'kontoauszug', chain);
		assert.equal('noEigenbeleg' in req, false, `${chain}: asked for the statement, nothing to say`);
	}
});

/** The chains without consumption of their own. */
const PAYMENTS_ONLY = ['near', 'filecoin', 'doichain', 'bitcoin', 'ethereum', 'base'];

test('every chain without consumption: a request for Eigenbelege alone is refused before payment, with the sentence', () => {
	assert.deepEqual(Object.keys(blocks).filter((c) => !blocks[c].consumption), PAYMENTS_ONLY);
	for (const chain of PAYMENTS_ONLY) {
		assert.throws(
			() => request(chain, { document: 'eigenbelege' }),
			(/** @type {any} */ e) =>
				e instanceof NoEigenbelegNeeded &&
				e instanceof RequestError &&
				e.code === 'no-eigenbeleg-needed' &&
				e.message.startsWith('Für diesen Zeitraum ist kein Eigenbeleg nötig: Gebühren, Erträge, Depots und Tausch belegt der Kontoauszug.') &&
				e.message.includes('"document": "kontoauszug"') &&
				e.message.includes(`includeKinds (${chain}: ${blocks[chain].kinds.join(', ')})`),
			chain
		);
		// The free preview says the same.
		assert.throws(() => parseRequest({ chain, addresses: ['x'], period: { month: '2026-10' }, document: 'eigenbelege' }, { today, blocks, preview: true }), NoEigenbelegNeeded, chain);
		// An empty list asked for on purpose is no different.
		assert.throws(() => request(chain, { document: 'eigenbelege', includeKinds: [] }), NoEigenbelegNeeded, chain);
	}
});

test('both documents with no kind: the statement alone, and why, in the request\'s language', () => {
	for (const chain of PAYMENTS_ONLY) {
		const en = request(chain, { document: 'beide', format: 'json' });
		assert.equal(en.document, 'kontoauszug', chain);
		assert.equal(en.noEigenbeleg, NO_EIGENBELEG.en, chain);
		assert.equal(request(chain, { document: 'beide', format: 'json', language: 'de' }).noEigenbeleg, NO_EIGENBELEG.de, chain);
	}
	// A PDF is one document: still refused for both, as before.
	assert.throws(() => request('near', { document: 'beide' }), /a PDF is one document/);
});

test('includeKinds still puts fees, storage deposits, swaps and transfers on an Eigenbeleg', () => {
	assert.deepEqual(request('near', { includeKinds: ['fee', 'storage', 'swap', 'transfer'] }).includeKinds, ['fee', 'storage', 'swap', 'transfer']);
	assert.equal(request('near', { includeKinds: ['fee'] }).document, 'eigenbelege');
	for (const chain of ['akash', 'filecoin', 'doichain', 'bitcoin', 'ethereum', 'base']) assert.deepEqual(request(chain, { includeKinds: ['fee', 'transfer'] }).includeKinds, ['fee', 'transfer'], chain);
	assert.deepEqual(request('aleph', { includeKinds: ['swap'] }).includeKinds, ['swap']);
	const both = request('near', { document: 'beide', format: 'json', includeKinds: ['storage'] });
	assert.equal(both.document, 'beide');
	assert.equal('noEigenbeleg' in both, false);
	// Still only the chain's own kinds.
	assert.throws(() => request('akash', { includeKinds: ['storage'] }), /akash has fee, transfer, not storage/);
	assert.throws(() => request('filecoin-pay', { document: 'kontoauszug', includeKinds: ['fee'] }), /a statement only/);
});

test('Aleph, Filecoin Pay, Akash: the month\'s consumption is an Eigenbeleg, so a whole month is never refused; a part of one is', () => {
	for (const chain of ['akash', 'filecoin-pay', 'aleph']) {
		const req = request(chain, { document: 'eigenbelege' });
		assert.deepEqual([req.includeKinds, req.document], [[], 'eigenbelege'], chain);
		const both = request(chain, { document: 'beide', format: 'json' });
		assert.deepEqual([both.document, 'noEigenbeleg' in both], ['beide', false], chain);
	}
	// Akash reads any period: one with no whole month has no consumption Eigenbeleg, and nothing else by default.
	const part = { period: { from: '2026-10-02', to: '2026-10-31' } };
	assert.throws(() => request('akash', { ...part, document: 'eigenbelege' }), NoEigenbelegNeeded);
	assert.equal(request('akash', { ...part, document: 'beide', format: 'json' }).document, 'kontoauszug');
	assert.equal(request('akash', { ...part, document: 'eigenbelege', includeKinds: ['fee'] }).document, 'eigenbelege');
});

/** A made-up valued entry. @param {Record<string, unknown>} over */
const entry = (over) => ({ type: 'sent', success: true, kind: 'fee', counterparty: 'network', account: 'wolkenfabrik.near', ...over });

test('the reason of every movement the statement documents (the CSV\'s "Hinweis")', () => {
	const c = { chain: 'near', own: new Set(['wolkenfabrik.near', 'kasse.near']), kinds: new Set(), language: /** @type {const} */ ('de') };
	const why = (/** @type {Record<string, unknown>} */ over, more = {}) => statementReason(/** @type {any} */ (entry(over)), { ...c, ...more });
	assert.equal(why({ kind: 'fee', type: 'fee' }), 'Netzwerkgebühr – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'storage', counterparty: 'social.near' }), 'Speicherhinterlegung (erstattbar) – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'swap', counterparty: 'tauschboerse.near' }), 'Tausch – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'escrow' }, { chain: 'akash' }), 'Hinterlegung (Escrow, Vorauszahlung) – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'stake' }, { chain: 'akash' }), 'Staking, keine Ausgabe – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'reward', type: 'received' }, { chain: 'akash' }), 'Staking-Ertrag (wie Zinsen) – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'reward', type: 'received' }, { chain: 'doichain' }), 'Mining-Ertrag (wie Zinsen) – belegt durch den Kontoauszug');
	assert.equal(why({ kind: 'swap', counterparty: 'aleph' }, { chain: 'aleph' }), 'Kauf von Credits (Vorauszahlung) – belegt durch den Kontoauszug, der Verbrauch durch den Verbrauchsauszug');
	assert.equal(why({ kind: 'fee', type: 'fee' }, { language: 'en' }), 'network fee – documented by the account statement');
	// The package's own reasons stand: a payment to an account, an own transfer, a failure, an incoming payment, usage.
	assert.equal(why({ kind: 'transfer', counterparty: 'someone.near' }), null);
	assert.equal(why({ kind: 'transfer', counterparty: 'kasse.near' }), null);
	assert.equal(why({ kind: 'storage', success: false }), null);
	assert.equal(why({ kind: 'transfer', type: 'received' }), null);
	assert.equal(why({ kind: 'usage' }, { chain: 'aleph' }), null);
	// A kind asked for has no reason: it is on the Eigenbeleg.
	assert.equal(why({ kind: 'fee', type: 'fee' }, { kinds: new Set(['fee']) }), null);
});

test('the reasons go into the lines not on an Eigenbeleg and into the movements beside its positions', () => {
	const fee = entry({ type: 'fee' });
	const paid = entry({ kind: 'storage', counterparty: 'social.near' });
	const doc = {
		chain: 'near',
		language: 'de',
		payer: { addresses: ['wolkenfabrik.near'] },
		excluded: [{ entry: fee, why: 'keine Zahlung an das Netzwerk' }],
		transactions: [{ movements: [{ entry: paid, onIt: true, why: '' }, { entry: fee, onIt: false, why: 'keine Zahlung an das Netzwerk' }] }]
	};
	withStatementReasons(doc, ['storage']);
	assert.equal(doc.excluded[0].why, 'Netzwerkgebühr – belegt durch den Kontoauszug');
	assert.deepEqual(doc.transactions[0].movements.map((m) => m.why), ['', 'Netzwerkgebühr – belegt durch den Kontoauszug']);
});
