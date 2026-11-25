// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moduleAddress } from '@le-space/chains/bech32';

import { sampleJpeg, samplePng } from '@le-space/pdf/testing/sample-images';

import { ISSUER_LOGO_MAX_BYTES, RequestError, issuerLogoImage, parseRequest } from '../src/request.js';

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
	// The diagram on a statement: on unless switched off.
	assert.equal(parseRequest(ok).chart, true);
	assert.equal(parseRequest({ ...ok, chart: false }).chart, false);
	refused({ chart: 'no' });
	// The mail's language: en unless asked for de; the documents are German either way.
	assert.equal(parseRequest(ok).language, 'en');
	assert.equal(parseRequest({ ...ok, language: 'de' }).language, 'de');
	refused({ language: 'fr' });
});

test('a chain offers only its own kinds; the default is what it has of fee and storage, on NEAR its swaps too', () => {
	assert.deepEqual(parseRequest(ok).includeKinds, ['fee', 'storage', 'swap']);
	const akash = { ...ok, chain: 'akash', addresses: [moduleAddress('akash', 'wolkenfabrik-example')] };
	assert.deepEqual(parseRequest(akash).includeKinds, ['fee']);
	refused({ ...akash, includeKinds: ['fee', 'storage'] });
	assert.deepEqual(parseRequest({ ...ok, chain: 'aleph', addresses: ['0x4EA28E630990a9e7A5De367107C2b804498238E2'], period: { month: '2026-09' }, document: 'kontoauszug' }).includeKinds, [], 'a purchase of Aleph credits is a prepayment: its Eigenbeleg only when asked for (#116)');
	assert.deepEqual(parseRequest({ ...ok, chain: 'aleph', addresses: ['0x4EA28E630990a9e7A5De367107C2b804498238E2'], period: { month: '2026-09' }, document: 'beide', format: 'json', includeKinds: ['swap'] }).includeKinds, ['swap']);
});

test('email: one mailbox, optional, never in the preview', () => {
	assert.equal(parseRequest(ok).email, null);
	assert.equal(parseRequest({ ...ok, email: 'belege@example.org' }).email, 'belege@example.org');
	refused({ email: 'Belege <belege@example.org>' });
	refused({ email: 'belege@localhost' });
	refused({ email: ['belege@example.org'] });
	assert.throws(() => parseRequest({ ...ok, payer: undefined, email: 'belege@example.org' }, { preview: true }), /preview takes no email/);
});

test('the issuer’s own logo: a PNG or JPEG file as base64 or as bytes, checked before anything is paid', () => {
	const base64 = (/** @type {Uint8Array} */ b) => Buffer.from(b).toString('base64');
	assert.equal(parseRequest(ok).issuerLogo, null);
	assert.equal(parseRequest({ ...ok, issuerLogo: null }).issuerLogo, null);
	for (const file of [samplePng(), sampleJpeg()]) {
		// The API's JSON carries base64; the page and the command line hand the bytes in.
		assert.deepEqual(parseRequest({ ...ok, issuerLogo: base64(file) }).issuerLogo, file);
		assert.deepEqual(parseRequest({ ...ok, issuerLogo: file }).issuerLogo, file);
	}
	const why = (/** @type {unknown} */ issuerLogo) => {
		try {
			parseRequest({ ...ok, issuerLogo });
		} catch (e) {
			assert.ok(e instanceof RequestError, String(e));
			return e.message;
		}
		return assert.fail('not refused');
	};
	assert.match(why(true), /^issuerLogo: a PNG or JPEG file as base64 text/);
	assert.match(why(''), /^issuerLogo: a PNG or JPEG file as base64 text/);
	assert.match(why(`data:image/png;base64,${base64(samplePng())}`), /^issuerLogo: plain base64 text/);
	assert.match(why(`${base64(samplePng())}\n`), /^issuerLogo: plain base64 text/);
	assert.match(why(base64(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))), /^issuerLogo: the picture must be a PNG or a JPEG file/);
	assert.match(why(base64(samplePng().subarray(0, 60))), /^issuerLogo: the PNG file/);
	// Too large is said before the text is unpacked, and for bytes as well.
	assert.match(why('A'.repeat(Math.ceil(ISSUER_LOGO_MAX_BYTES / 3) * 4 + 4)), /^issuerLogo: the file has more than 512 kB/);
	assert.match(why(new Uint8Array(ISSUER_LOGO_MAX_BYTES + 1)), /^issuerLogo: the file has 513 kB; at most 512 kB/);
	// The preview draws nothing, and checks the picture all the same: a bad one is known before the payment.
	const preview = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: ok.period };
	assert.deepEqual(parseRequest({ ...preview, issuerLogo: base64(samplePng()) }, { preview: true }).issuerLogo, samplePng());
	assert.throws(() => parseRequest({ ...preview, issuerLogo: base64(samplePng().subarray(0, 60)) }, { preview: true }), /issuerLogo: the PNG file/);
	// What the page shows and keeps: the picture as the documents carry it.
	const shown = issuerLogoImage(sampleJpeg());
	assert.deepEqual([shown.type, shown.width, shown.height], ['jpeg', 240, 80]);
	assert.throws(() => issuerLogoImage(new Uint8Array(40)), RequestError);
});
