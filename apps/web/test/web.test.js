// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseRequest } from '@eigenbeleg/pipeline';
import { fileName, rememberAccounts, rememberedAccounts, requestBody, splitAddresses } from '../src/request.js';

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
	includeKinds: ['fee', 'storage'],
	document: 'beide'
};

test('the form becomes the request the pipeline checks, as the API would', () => {
	assert.deepEqual(splitAddresses(form.addresses), ['wolkenfabrik.testnet', 'lager.testnet']);
	const body = requestBody(form);
	assert.deepEqual(body.period, { month: '2026-10' });
	assert.equal(body.format, 'json');
	assert.deepEqual(body.payer, { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' });
	assert.deepEqual(requestBody({ ...form, periodMode: 'range', from: '2026-10-01', to: '2026-10-15' }).period, { from: '2026-10-01', to: '2026-10-15' });
	const req = parseRequest(body, { today: '2026-11-06' });
	assert.equal(req.document, 'beide');
	assert.deepEqual(req.addresses, ['wolkenfabrik.testnet', 'lager.testnet']);
	assert.equal(req.number, 'EB-2026-007');
	assert.equal(fileName('EB-2026/007 ä'), 'EB-2026_007__');
});

test('chain, network and addresses are kept only while their "remember" is ticked', () => {
	const store = new Map();
	globalThis.localStorage = /** @type {any} */ ({ getItem: (/** @type {string} */ k) => store.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v), removeItem: (/** @type {string} */ k) => store.delete(k) });
	try {
		assert.equal(rememberedAccounts(), null);
		rememberAccounts({ chain: 'near', network: 'testnet', addresses: 'wolkenfabrik.testnet' });
		assert.deepEqual(rememberedAccounts(), { chain: 'near', network: 'testnet', addresses: 'wolkenfabrik.testnet' });
		assert.deepEqual([...store.keys()], ['accounts']);
		rememberAccounts(null);
		assert.equal(rememberedAccounts(), null);
		assert.equal(store.size, 0);
	} finally {
		delete (/** @type {any} */ (globalThis)).localStorage;
	}
});

test('the page has no wallet, no payment and no call to an API of ours', async () => {
	const src = (await Promise.all(['../src/main.js', '../src/request.js', '../src/pwa.js', '../index.html'].map((f) => readFile(new URL(f, import.meta.url), 'utf8')))).join('\n');
	assert.doesNotMatch(src, /near-connect|@x402|PAYMENT-|\/eigenbeleg\/preview|fetch\(['"`]\//);
	const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
	assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@eigenbeleg/pipeline', '@fontsource-variable/sora', '@fontsource/ibm-plex-mono']);
});

test('German and English have the same texts and placeholders; German is the default', async () => {
	const { TEXTS, t, setLang, lang, detectLang } = await import('../src/i18n.js');
	const vars = (/** @type {string} */ s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
	assert.deepEqual(Object.keys(TEXTS.en).sort(), Object.keys(TEXTS.de).sort());
	for (const k of Object.keys(TEXTS.de)) assert.equal(vars(TEXTS.en[/** @type {keyof typeof TEXTS.en} */ (k)]), vars(TEXTS.de[/** @type {keyof typeof TEXTS.de} */ (k)]), k);
	assert.equal(lang(), 'de');
	assert.equal(t('sumPeriodValue', { from: '2026-10-01', to: '2026-10-31' }), '2026-10-01 bis 2026-10-31');
	setLang('en');
	try {
		assert.equal(t('btnCreate'), 'Read and create');
	} finally {
		setLang('de');
	}
	assert.match(detectLang(), /^(de|en)$/);
	// Every data-i18n key in the page has a text.
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	for (const m of html.matchAll(/data-i18n="(\w+)"/g)) assert.ok(m[1] in TEXTS.de, m[1]);
	// The privacy policy is in the markup in both languages; the Impressum is le-space.de's.
	assert.deepEqual([...html.matchAll(/data-lang="(\w+)"/g)].map((m) => m[1]), ['de', 'en']);
	assert.match(html, /href="https:\/\/le-space\.de\/#impressum"/);
});

test('the service worker keeps the placeholders the build fills with every file to precache', async () => {
	const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
	const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
	for (const marker of ['const PRECACHE = /** @type {string[]} */ ([]);', "const CACHE = 'eigenbeleg-dev';"]) {
		assert.ok(sw.includes(marker), `sw.js: ${marker}`);
		assert.ok(config.includes(marker.replace(/'/g, '"')) || config.includes(marker), `vite.config.js replaces ${marker}`);
	}
	// Never a data source's answer in the cache: only requests to the worker's own scope are handled.
	assert.match(sw, /url\.origin !== scope\.origin/);
});
