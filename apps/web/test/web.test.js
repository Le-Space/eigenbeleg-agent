// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { parseRequest } from '@eigenbeleg/pipeline';
import { samplePng } from '@le-space/pdf/testing/sample-images';
import { fileName, isNearblocksKey, rememberAccounts, rememberKey, rememberNearblocksKey, rememberedAccounts, rememberedKey, rememberedNearblocksKey, rememberedPayer, rememberPayer, requestBody, splitAddresses, bytesToText, textToBytes } from '../src/request.js';

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
	// The statement's diagram: on unless the form's box is unticked.
	assert.equal(req.chart, true);
	assert.equal(parseRequest(requestBody({ ...form, chart: false }), { today: '2026-11-06' }).chart, false);
	// The documents' currency: EUR unless the dropdown says another; EUR is not even written into the body.
	assert.equal(req.currency, 'EUR');
	assert.ok(!('currency' in requestBody({ ...form, currency: 'EUR' })));
	assert.equal(parseRequest(requestBody({ ...form, currency: 'CHF' }), { today: '2026-11-06' }).currency, 'CHF');
	assert.equal(fileName('EB-2026/007 ä'), 'EB-2026_007__');
});

test('the issuer’s own logo goes into the request as its bytes, and is kept only with the payer', () => {
	assert.ok(!('issuerLogo' in requestBody(form)));
	const req = parseRequest(requestBody({ ...form, issuerLogo: samplePng() }), { today: '2026-11-06' });
	assert.deepEqual(req.issuerLogo, samplePng());
	assert.deepEqual(textToBytes(bytesToText(samplePng())), samplePng());
	const large = Uint8Array.from({ length: 200_000 }, (_, i) => i % 251);
	assert.deepEqual(textToBytes(bytesToText(large)), large);
	assert.equal(textToBytes('not base64!'), null);

	const store = new Map();
	globalThis.localStorage = /** @type {any} */ ({ getItem: (/** @type {string} */ k) => store.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v), removeItem: (/** @type {string} */ k) => store.delete(k) });
	try {
		const payer = { name: 'Wolkenfabrik Hosting GmbH', postal: 'Musterstraße 1\n12345 Beispielstadt' };
		assert.equal(rememberPayer(payer), true);
		assert.deepEqual(rememberedPayer(), { ...payer, logo: null });
		rememberPayer({ ...payer, logo: samplePng() });
		assert.deepEqual(rememberedPayer(), { ...payer, logo: samplePng() });
		assert.deepEqual([...store.keys()], ['payer'], 'one entry: the logo is forgotten with the payer');
		rememberPayer(null);
		assert.equal(store.size, 0);
		// A full or blocked storage keeps nothing, and says so.
		globalThis.localStorage = /** @type {any} */ ({ setItem: () => { throw new Error('quota'); } });
		assert.equal(rememberPayer({ ...payer, logo: samplePng() }), false);
	} finally {
		delete (/** @type {any} */ (globalThis).localStorage);
	}
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
	assert.deepEqual([...html.matchAll(/data-lang="(\w+)"/g)].map((m) => m[1]), ['de', 'en', 'de', 'en', 'de', 'en']);
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
	const { coinPriceFor, eurGuide, priceFor, timesMonths, usdc } = await import('@eigenbeleg/pipeline/prices');
	assert.equal(TEXTS.de.payNearPrice, `${usdc(priceFor('near:mainnet'), 'de')} (${eurGuide(priceFor('near:mainnet'), 'de')})`);
	assert.equal(TEXTS.en.payEthPrice, `${usdc(priceFor('eip155:1'), 'en')} (${eurGuide(priceFor('eip155:1'), 'en')})`);
	assert.equal(eurGuide('$0.10', 'de'), 'rund 0,09 €');
	assert.equal(eurGuide('$1.00', 'en'), 'about €0.90');
	assert.ok(TEXTS.de.subscriptionNote.includes(usdc(timesMonths(priceFor('near:mainnet')), 'de')));
	assert.ok(TEXTS.en.prompt.includes(usdc(priceFor('near:mainnet'), 'en')));
	// DOI on Doichain is a way to pay too, at its published price.
	assert.equal(TEXTS.de.payDoiPrice, `${coinPriceFor('doichain')} DOI`);
	for (const lang of /** @type {const} */ (['de', 'en'])) assert.match(TEXTS[lang].agentsText, /DOI auf Doichain|DOI on Doichain/, lang);
	// index.html's German text (what shows before the script runs) is the same as TEXTS.de.
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	const unescape = (/** @type {string} */ s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	for (const key of ['payNearPrice', 'payBasePrice', 'payEthPrice', 'payDoiPrice', 'payDoiHow', 'payNote', 'businessOnly', 'subscriptionNote', 'agentsPrompt', 'prompt']) {
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

test('help and support: the addresses, what to send, never a secret, and the private way for weaknesses, in both languages', async () => {
	const { TEXTS } = await import('../src/i18n.js');
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	const start = html.indexOf('<section id="hilfe"');
	assert.ok(start > 0, 'a visible section, not folded');
	const help = html.slice(start, html.indexOf('</section>', start));
	const [de, en] = help.split('<div data-lang="en" hidden>');
	for (const part of [de, en]) {
		assert.match(part, /href="mailto:eigenbeleg@le-space\.de"/);
		assert.match(part, /href="mailto:support@le-space\.de"/);
		// The repository is private: the way to report is the mail, the policy the public page /security.
		assert.doesNotMatch(part, /github\.com\/Le-Space\/eigenbeleg-agent\/(security|blob)/);
		assert.match(part, /href="\/security(#en)?"/);
		assert.match(part, /href="mailto:security@le-space\.de"/);
		assert.match(part, /90/);
		// No answer time is promised.
		assert.doesNotMatch(part, /\b(Stunden|Werktag|hours|business day|within)\b/i);
	}
	assert.match(de, /Le Space fragt nie nach Seed-Phrase, Passkey, privatem Schlüssel oder Token/);
	assert.match(en, /Le Space never asks for a seed phrase, a passkey, a private key or a token/);
	assert.match(de, /Bitte nicht mitschicken: Belege/);
	assert.match(en, /Please do not send: documents/);
	assert.equal((html.match(/href="#hilfe" data-i18n="navHelp"/g) ?? []).length, 2, 'in the jump bar and the footer');
	assert.equal(TEXTS.de.hHelp, 'Hilfe & Support');
	assert.equal(TEXTS.en.hHelp, 'Help & support');
	const { SECURITY_HTML } = await import('../../api/src/security-page.js');
	const [sde, sen] = SECURITY_HTML.split('<article id="en" lang="en">');
	for (const h of ['Eine Sicherheitslücke melden', 'Coordinated Disclosure', 'Guter Glaube', 'Regeln', 'Geltungsbereich', 'Kein Bounty']) assert.ok(sde.includes(`<h2>${h}</h2>`), h);
	for (const h of ['Reporting a weakness', 'Coordinated disclosure', 'Good faith', 'Rules', 'Scope', 'No bounty']) assert.ok(sen.includes(`<h2>${h}</h2>`), h);
	assert.match(sde, /kein rechtlicher Verzicht/);
	assert.match(sen, /it is not a legal waiver/);
	assert.doesNotMatch(sde, /Entwurf, noch nicht anwaltlich geprüft|Safe Harbor/);
	assert.doesNotMatch(sen, /Draft, not yet reviewed by our lawyer|Safe harbor/);
	for (const part of [sde, sen]) {
		assert.match(part, /href="mailto:security@le-space\.de"/);
		assert.match(part, /90/);
		assert.doesNotMatch(part, /github\.com/, 'no link into the private repository');
	}
	assert.match(sde, /Kein Denial of Service/);
	assert.match(sde, /Kein Social Engineering/);
	assert.match(sen, /No denial of service/);
	assert.match(sen, /No social engineering/);
	const security = await readFile(new URL('../../../SECURITY.md', import.meta.url), 'utf8');
	assert.match(security, /https:\/\/eigenbeleg\.le-space\.de\/security/);
	assert.doesNotMatch(security, /security\/advisories/);
});

test('Le Space addresses: contact@ (legal), eigenbeleg@ (help), support@ (payments, credits), security@; no other', async () => {
	const { execFileSync } = await import('node:child_process');
	const root = new URL('../../../', import.meta.url);
	const found = execFileSync('git', ['grep', '-h', '-o', '-E', '[A-Za-z0-9._%+-]+@le-space\\.de', '--', '.', ':!package-lock.json'], { cwd: root, encoding: 'utf8' });
	const used = new Set(found.split('\n').filter(Boolean));
	assert.deepEqual([...used].sort(), ['contact@le-space.de', 'eigenbeleg@le-space.de', 'security@le-space.de', 'support@le-space.de'].filter((a) => used.has(a)));
	assert.ok(used.has('contact@le-space.de') && used.has('eigenbeleg@le-space.de'));
	const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	assert.match(html, /Fragen zum Datenschutz: <a href="mailto:contact@le-space\.de">/);
});

test('each language has its own address: head, alternates and markup in that language (seo.js)', async () => {
	const { SEO_SLOT, englishPage, germanPage, jsonLd, seoHead } = await import('../seo.js');
	const { TEXTS, urlLang } = await import('../src/i18n.js');
	const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
	assert.ok(source.includes(SEO_SLOT), 'index.html keeps the place for the head');
	const built = source.replace(SEO_SLOT, seoHead('de'));

	// The adapting page: German, canonical to itself, and all three alternates.
	assert.match(built, /<link rel="canonical" href="__PUBLIC_URL__\/ui\/" \/>/);
	for (const [lang, url] of [['de', '/ui/?lang=de'], ['en', '/ui/?lang=en'], ['x-default', '/ui/']]) {
		assert.ok(built.includes(`<link rel="alternate" hreflang="${lang}" href="__PUBLIC_URL__${url}" />`), lang);
	}
	assert.ok(built.includes(`<title>${TEXTS.de.metaTitle}</title>`));

	const en = englishPage(built);
	assert.match(en, /<html lang="en">/);
	assert.match(en, /<link rel="canonical" href="__PUBLIC_URL__\/ui\/\?lang=en" \/>/);
	assert.match(en, /og:image" content="__PUBLIC_URL__\/ui\/social\/eigenbeleg-en\.png"/);
	assert.match(en, /og:locale" content="en_GB"/);
	assert.ok(en.includes(`<title>${TEXTS.en.metaTitle}</title>`));
	// Every text of the markup is the English one, and none is left in German.
	for (const m of en.matchAll(/data-i18n="(\w+)"[^>]*>([^<]*)</g)) {
		const text = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
		assert.equal(text, /** @type {any} */ (TEXTS.en)[m[1]], m[1]);
	}
	// The blocks written in both languages: the English ones show, the German ones do not.
	assert.equal((en.match(/data-lang="en" hidden/g) ?? []).length, 0);
	assert.equal((en.match(/data-lang="de" hidden/g) ?? []).length, (built.match(/data-lang="en" hidden/g) ?? []).length);
	assert.ok((en.match(/data-lang="de" hidden/g) ?? []).length >= 3);

	const de = germanPage(built);
	assert.match(de, /<link rel="canonical" href="__PUBLIC_URL__\/ui\/\?lang=de" \/>/);
	assert.match(de, /<html lang="de">/);

	// A build that knows its origin has put it in before the variants are made.
	const fill = (/** @type {string} */ s) => s.replaceAll('__PUBLIC_URL__', 'https://eigenbeleg.example.org');
	assert.match(englishPage(fill(built), fill), /<link rel="canonical" href="https:\/\/eigenbeleg\.example\.org\/ui\/\?lang=en" \/>/);
	assert.throws(() => englishPage(source), /German head/);

	// Structured data: a data block that parses, free, and cannot close its own tag.
	const data = JSON.parse(jsonLd('en', 'https://eigenbeleg.example.org/ui/?lang=en'));
	assert.equal(data['@type'], 'WebApplication');
	assert.equal(data.offers.price, '0');
	assert.equal(data.inLanguage, 'en');
	assert.ok(!jsonLd('de', 'https://x.example/</script>').includes('</script>'));

	// The address names the language; anything else leaves it to the saved choice and the browser.
	assert.equal(urlLang('?lang=en'), 'en');
	assert.equal(urlLang('?lang=de'), 'de');
	assert.equal(urlLang('?lang=fr'), null);
	assert.equal(urlLang(''), null);
});

test('a chain without a published rate (Doichain): the form\'s own reference value goes into the request', async () => {
	const { requestBody, referenceEur } = await import('../src/request.js');
	assert.deepEqual([referenceEur('0,05'), referenceEur(' 0.05 '), referenceEur('0'), referenceEur('fünf'), referenceEur('-1')], ['0.05', '0.05', null, null, null]);
	const f = { chain: 'doichain', network: 'mainnet', addresses: 'dc1qexample', periodMode: /** @type {const} */ ('month'), month: '2026-10', from: '', to: '', name: 'Wolkenfabrik Hosting GmbH', postal: 'Musterstraße 1, 12345 Beispielstadt', number: '', statementNumber: '', includeKinds: ['fee'], logo: false, chart: true, document: /** @type {const} */ ('eigenbelege') };
	assert.deepEqual(requestBody({ ...f, referenceAsset: 'DOI', referenceEur: '0,05', referenceFrom: '2026-01-01' }).reference, { DOI: { eur: '0.05', from: '2026-01-01' } });
	assert.equal('reference' in requestBody({ ...f, referenceAsset: 'DOI', referenceEur: '', referenceFrom: '' }), false);
	// another chain never carries one, whatever is left in the fields
	assert.equal('reference' in requestBody({ ...f, chain: 'near', referenceAsset: '', referenceEur: '0,05', referenceFrom: '2026-01-01' }), false);
});
