// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseRequest } from '@eigenbeleg/pipeline';
import { fileName, isNearblocksKey, rememberAccounts, rememberKey, rememberNearblocksKey, rememberedAccounts, rememberedKey, rememberedNearblocksKey, requestBody, splitAddresses } from '../src/request.js';

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
		// The person's own Alchemy key (#25): kept only while ticked, and only when it looks like a key.
		rememberKey('not a key!');
		assert.equal(rememberedKey(), null);
		assert.equal(store.size, 0);
		rememberKey('abc123_-ABC');
		assert.equal(rememberedKey(), 'abc123_-ABC');
		assert.deepEqual([...store.keys()], ['alchemyKey']);
		rememberKey(null);
		assert.equal(rememberedKey(), null);
		assert.equal(store.size, 0);
		// The person's own NearBlocks key (#5): the same.
		assert.ok(!isNearblocksKey('has space') && !isNearblocksKey('short') && isNearblocksKey('nb_key-0123.4567'));
		rememberNearblocksKey('nb_key-0123.4567');
		assert.deepEqual([...store.keys()], ['nearblocksKey']);
		assert.equal(rememberedNearblocksKey(), 'nb_key-0123.4567');
		rememberNearblocksKey(null);
		assert.equal(store.size, 0);
	} finally {
		delete (/** @type {any} */ (globalThis)).localStorage;
	}
});

test('the page has no wallet, no payment and no call to an API of ours', async () => {
	const src = (await Promise.all(['../src/main.js', '../src/request.js', '../src/pwa.js', '../index.html'].map((f) => readFile(new URL(f, import.meta.url), 'utf8')))).join('\n');
	assert.doesNotMatch(src, /near-connect|@x402|PAYMENT-|\/eigenbeleg\/preview|fetch\(['"`]\//);
	// The only key on the page is the person's own Alchemy key (#25): never in the request body, kept
	// only under its own "remember", and the CSP lets the page reach Alchemy for it.
	const { requestBody: body } = await import('../src/request.js');
	assert.ok(!('alchemyKey' in body(form)) && !('nearblocksKey' in body(form)) && !/lchemy|earblocks/.test(JSON.stringify(body(form))));
	const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
	assert.match(config, /keyedSources\(\)\.map/);
	assert.match(src, /blocksFor\(\{ alchemyKey: key \}\)/);
	// Without a key the keyless blocks are what the page serves; the keyed ones are greyed out.
	const { describeBlocks } = await import('@eigenbeleg/pipeline/blocks');
	assert.ok(describeBlocks().length > 0 && !describeBlocks().some((b) => b.needs), 'the keyless blocks need no key');
	// The pipeline modules that load with the page never import the keyed ones; keyed.js is the page's own import.
	for (const m of ['blocks', 'request', 'generate', 'sources', 'rates']) {
		const code = await readFile(new URL(`../../../packages/pipeline/src/${m}.js`, import.meta.url), 'utf8');
		assert.doesNotMatch(code, /^import .*(keyed\.js|readers\/evm\.js|chains\/alchemy)/m, `pipeline/src/${m}.js`);
	}
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
	// The terms of business and the privacy policy are in the markup in both languages; the Impressum is le-space.de's.
	assert.deepEqual([...html.matchAll(/data-lang="(\w+)"/g)].map((m) => m[1]), ['de', 'en', 'de', 'en']);
	assert.match(html, /href="https:\/\/le-space\.de\/#impressum"/);
});

test('the footer names the version, the commit and its instant, in the reader\'s terms', async () => {
	const { buildStamp } = await import('../build-info.js');
	const { localStamp, parseBuild, utcStamp } = await import('../src/build.js');
	// From git or from SOURCE_COMMIT: a commit and its instant, else nothing (the build clock never).
	assert.deepEqual(buildStamp({ commit: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01', date: '2026-11-13T10:15:00+01:00', version: '0.1.0' }), { release: 'v0.1.0', commit: 'abcdef0123456789abcdef0123456789abcdef01', date: '2026-11-13T09:15:00.000Z' });
	assert.deepEqual(buildStamp({ commit: '', date: '2026-11-13T10:15:00+01:00', version: '0.1.0' }), { release: 'v0.1.0', commit: '', date: '' });
	assert.deepEqual(buildStamp({ commit: 'abcdef0', date: 'yesterday' }), { release: '', commit: '', date: '' });
	// The page: the placeholders are filled by the build; unfilled ones hide the stamp.
	assert.equal(parseBuild({ release: '__BUILD_RELEASE__', commit: '__BUILD_COMMIT__', date: '__BUILD_DATE__' }), null);
	const build = parseBuild({ release: 'v0.1.0', commit: 'abcdef0123456789abcdef0123456789abcdef01', date: '2026-11-13T09:15:00.000Z' });
	assert.ok(build);
	assert.equal(build.short, 'abcdef0');
	assert.equal(utcStamp(build.when), '2026-11-13 09:15 UTC');
	assert.equal(localStamp(build.when, 'de-DE', 'Europe/Berlin'), '13.11.2026, 10:15 MEZ');
	assert.equal(localStamp(build.when, 'en-US', 'America/New_York'), '11/13/2026, 04:15 AM EST');
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	assert.match(html, /id="build" data-release="__BUILD_RELEASE__" data-commit="__BUILD_COMMIT__" data-date="__BUILD_DATE__"/);
	const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
	for (const m of ['__BUILD_RELEASE__', '__BUILD_COMMIT__', '__BUILD_DATE__']) assert.ok(config.includes(`'${m}'`), `vite.config.js fills ${m}`);
	// The container build copies no .git: the image workflow hands the commit in.
	const docker = await readFile(new URL('../../../Dockerfile', import.meta.url), 'utf8');
	const image = await readFile(new URL('../../../.github/workflows/image.yml', import.meta.url), 'utf8');
	for (const v of ['SOURCE_COMMIT', 'SOURCE_COMMIT_DATE']) {
		assert.match(docker, new RegExp(`ARG ${v}=`));
		assert.match(image, new RegExp(`${v}=`));
	}
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

test('the page shows the published prices and pays on mainnet only', async () => {
	const { TEXTS } = await import('../src/i18n.js');
	const { eurGuide, priceFor, timesMonths, usdc } = await import('@eigenbeleg/pipeline/prices');
	assert.equal(TEXTS.de.payNearPrice, `${usdc(priceFor('near:mainnet'), 'de')} (${eurGuide(priceFor('near:mainnet'), 'de')})`);
	assert.equal(TEXTS.en.payEthPrice, `${usdc(priceFor('eip155:1'), 'en')} (${eurGuide(priceFor('eip155:1'), 'en')})`);
	assert.equal(eurGuide('$0.10', 'de'), 'rund 0,09 €');
	assert.equal(eurGuide('$1.00', 'en'), 'about €0.90');
	assert.ok(TEXTS.de.subscriptionNote.includes(usdc(timesMonths(priceFor('near:mainnet')), 'de')));
	assert.ok(TEXTS.en.prompt.includes(usdc(priceFor('near:mainnet'), 'en')));
	// index.html's German text (what shows before the script runs) is the same as TEXTS.de.
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	const unescape = (/** @type {string} */ s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	for (const key of ['payNearPrice', 'payBasePrice', 'payEthPrice', 'payNote', 'businessOnly', 'subscriptionNote', 'agentsPrompt', 'prompt']) {
		const m = new RegExp(`data-i18n="${key}">([^<]*)<`).exec(html);
		assert.ok(m, key);
		assert.equal(unescape(m[1]), TEXTS.de[/** @type {keyof typeof TEXTS.de} */ (key)], key);
	}
	// No payment on a testnet is offered or suggested on the page.
	for (const lang of /** @type {const} */ (['de', 'en'])) {
		for (const key of ['payNote', 'agentsPrompt', 'prompt', 'agentsText', 'subscriptionNote']) {
			assert.doesNotMatch(String(TEXTS[lang][/** @type {keyof typeof TEXTS.de} */ (key)]), /testnet/i, `${lang}.${key}`);
		}
	}
});

test('the paid API is for businesses only; the terms are on the page in both languages and say so', async () => {
	const { TEXTS } = await import('../src/i18n.js');
	const { VAT } = await import('@eigenbeleg/pipeline/prices');
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	const terms = html.slice(html.indexOf('<details id="agb"'), html.indexOf('</details>', html.indexOf('<details id="agb"')));
	assert.ok(terms.length > 1000, 'the terms are in the page');
	const [de, en] = terms.split('<div data-lang="en" hidden>');
	assert.match(de, /ausschließlich an Unternehmer im Sinne von § 14 BGB/);
	assert.match(de, /Ein Widerrufsrecht für Verbraucher besteht daher nicht/);
	assert.match(de, new RegExp(`${VAT} % Umsatzsteuer`));
	assert.match(en, /exclusively to businesses within the meaning of § 14 BGB/);
	assert.match(en, new RegExp(`${VAT}% German VAT`));
	assert.match(en, /German version is binding/);
	assert.match(html, /<a href="#agb" data-i18n="navTerms">/);
	assert.match(TEXTS.de.businessOnly, /nur für Unternehmer/);
	assert.match(TEXTS.de.payNote, new RegExp(`inkl. ${VAT} % USt`));
	assert.match(TEXTS.en.payNote, new RegExp(`${VAT}% German VAT`));
	// Section 6 of the privacy policy names every payment network, not NEAR alone.
	assert.match(html, /auf der gewählten Blockchain \(NEAR, Base oder Ethereum\)/);
	assert.match(html, /on the chosen blockchain \(NEAR, Base or Ethereum\)/);
});
