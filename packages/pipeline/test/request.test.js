// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RequestError, parseRequest } from '../src/request.js';

const ok = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: '2026-10-01', to: '2026-10-31' }, payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' } };
const refused = (over) => assert.throws(() => parseRequest({ ...ok, ...over }), RequestError);

test('chains are looked up as own keys only', () => {
	for (const chain of ['constructor', '__proto__', 'toString', ['near']]) refused({ chain });
});

test('dates must be real days, strings, and finished', () => {
	refused({ period: { from: '2026-02-01', to: '2026-02-31' } });
	refused({ period: { from: ['2026-10-01'], to: '2026-10-31' } });
	refused({ period: { from: '2099-01-01', to: '2099-01-31' } });
	const today = new Date().toISOString().slice(0, 10);
	const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
	if (today.endsWith('-01')) refused({ period: { month: today.slice(0, 7) } });
	else assert.equal(parseRequest({ ...ok, period: { month: today.slice(0, 7) } }).period.to, yesterday);
});

test('addresses are trimmed and read once', () => {
	const r = parseRequest({ ...ok, addresses: ['relay.aurora', ' relay.aurora '] });
	assert.deepEqual(r.addresses, ['relay.aurora']);
	assert.deepEqual(r.payer.addresses, ['relay.aurora']);
	refused({ addresses: [{ toString: () => 'relay.aurora' }] });
});

test('the preview mode takes no payer and needs none', () => {
	const body = { chain: 'near', network: 'testnet', addresses: ['own.testnet'], period: { from: '2026-10-01', to: '2026-10-31' } };
	const job = parseRequest(body, { preview: true });
	assert.equal(job.format, 'json');
	assert.throws(() => parseRequest({ ...body, payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1' } }, { preview: true }), RequestError);
	assert.throws(() => parseRequest(body), RequestError, 'the paid route still needs the payer');
});

test('the logo is off unless asked for, and only true or false', () => {
	assert.equal(parseRequest(ok).logo, false);
	assert.equal(parseRequest({ ...ok, logo: true }).logo, true);
	refused({ logo: 'yes' });
});
