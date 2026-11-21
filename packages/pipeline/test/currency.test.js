// SPDX-License-Identifier: AGPL-3.0-or-later
// Documents in another currency than EUR (#72): the request's `currency`, the
// rates in it with both legs named, and the files of a recorded NEAR day in
// CHF and RUB. Every rate here is made up; an EUR document is what it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { fakeDoichainAddress } from '@le-space/chains/testing/doichain';
import { pdfaStructure } from '@le-space/pdf/testing/pdfa-structure';

import { CURRENCIES, RequestError, generate, parseRequest } from '../src/index.js';
import { dayRates, sourceText } from '../src/rates.js';
import { recordedNear } from '../../../apps/agent/src/recorded.js';

const raw = JSON.parse(await readFile(new URL('./fixtures/relay-aurora-2026-11-01.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
const DAY = '2026-11-01';
// Made-up payer, as everywhere in this repository.
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const base = { chain: 'near', network: 'mainnet', addresses: ['relay.aurora'], period: { from: DAY, to: DAY }, format: 'json', document: 'beide', number: 'EB-2026-042', payer };

/**
 * The rate hosts, made up: CoinGecko's NEAR snapshot (EUR and USD), the ECB's CHF of the Friday before
 * (1 November 2026 is a Sunday), no ECB rate for the ruble, and the Bank of Russia's file of the Saturday.
 * @param {string[]} asked
 */
const rateHosts = (asked) =>
	/** @type {(url: string) => Response | null} */ (
		(url) => {
			const u = String(url);
			if (/^https:\/\/(api\.coingecko\.com|api\.kraken\.com|data-api\.ecb\.europa\.eu|www\.cbr\.ru)\//.test(u)) asked.push(u);
			if (u.startsWith('https://api.coingecko.com/api/v3/coins/near/history')) return Response.json({ market_data: { current_price: { eur: 2.5, usd: 2.9 } } });
			if (u.startsWith('https://api.coingecko.com/') || u.startsWith('https://api.kraken.com/')) return new Response('{}', { status: 404 });
			if (u.startsWith('https://data-api.ecb.europa.eu/service/data/EXR/D.CHF.EUR')) return Response.json({ dataSets: [{ series: { '0:0:0:0:0': { observations: { 0: [0.9312] } } } }], structure: { dimensions: { observation: [{ values: [{ id: '2026-10-30' }] }] } } });
			if (u.startsWith('https://data-api.ecb.europa.eu/')) return new Response('', { status: 404 });
			if (u.startsWith('https://www.cbr.ru/scripts/XML_daily.asp')) return new Response('<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="31.10.2026" name="Foreign Currency Market"><Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Euro</Name><Value>98,7654</Value></Valute></ValCurs>');
			return null;
		}
	);

/** The recorded NEAR day, and the rate hosts beside it. @param {string[]} asked */
const fetchWith = (asked) => {
	const chain = recordedNear(raw, { now: NOW });
	const rates = rateHosts(asked);
	return /** @type {typeof fetch} */ (async (/** @type {any} */ url, /** @type {any} */ init) => rates(url) ?? chain(url, init));
};

/** @param {Record<string, unknown>} extra */
const run = async (extra = {}) => {
	/** @type {string[]} */
	const asked = [];
	const req = parseRequest({ ...base, ...extra }, { today: '2026-11-06' });
	const out = await generate(req, { fetch: fetchWith(asked), now: () => new Date(NOW) });
	return { req, out, asked };
};

test('currency: EUR by default, one of the documents’ currencies, anything else a 400 that lists them', () => {
	assert.equal(parseRequest(base, { today: '2026-11-06' }).currency, 'EUR');
	assert.equal(parseRequest({ ...base, currency: 'CHF' }, { today: '2026-11-06' }).currency, 'CHF');
	assert.equal(parseRequest({ ...base, currency: null }, { today: '2026-11-06' }).currency, 'EUR', 'null: none given');
	assert.deepEqual(CURRENCIES, ['EUR', 'USD', 'CHF', 'GBP', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'ISK', 'TRY', 'RUB']);
	for (const bad of ['chf', 'XYZ', 'BGN', 'UAH', '', 7, ['CHF']])
		assert.throws(() => parseRequest({ ...base, currency: bad }, { today: '2026-11-06' }), (e) => e instanceof RequestError && e.message === `currency: one of ${CURRENCIES.join(', ')} (ISO 4217, default EUR)`, String(bad));
	// The preview checks it too, before anything is paid.
	assert.throws(() => parseRequest({ ...base, payer: undefined, currency: 'JPY' }, { preview: true, today: '2026-11-06' }), RequestError);
});

test('currency: a reference value is in EUR, so Doichain’s Eigenbelege stay in EUR; its statement may be in another', () => {
	const doi = { chain: 'doichain', network: 'mainnet', addresses: [fakeDoichainAddress('own')], period: { month: '2026-10' }, format: 'json', payer };
	const reference = { DOI: { eur: '0.05', from: '2026-01-01' } };
	assert.equal(parseRequest({ ...doi, reference }, { today: '2026-11-06' }).currency, 'EUR');
	assert.throws(() => parseRequest({ ...doi, reference, currency: 'CHF' }, { today: '2026-11-06' }), /currency: a reference value is in EUR/);
	assert.throws(() => parseRequest({ ...doi, currency: 'CHF' }, { today: '2026-11-06' }), /in EUR only/);
	assert.equal(parseRequest({ ...doi, document: 'kontoauszug', currency: 'CHF' }, { today: '2026-11-06' }).currency, 'CHF');
});

test('the rate in the document’s currency names both legs; EUR is named as it always was', async () => {
	const rates = (/** @type {string} */ currency) => dayRates({ fetch: /** @type {any} */ (async (/** @type {string} */ u) => rateHosts([])(u) ?? new Response('{}', { status: 404 })), now: () => new Date(NOW), currency });
	assert.deepEqual(await rates('EUR').rateFor('NEAR', DAY), { rate: '2.5', source: `CoinGecko, Kurs ${DAY} 00:00 UTC`, date: DAY });
	assert.deepEqual(await rates('CHF').rateFor('NEAR', DAY), { rate: '2.328', source: `CoinGecko, Kurs ${DAY} 00:00 UTC × EZB-Referenzkurs EUR/CHF vom 2026-10-30`, date: DAY, currency: 'CHF' });
	assert.deepEqual(await rates('RUB').rateFor('NEAR', DAY), { rate: '246.9135', source: `CoinGecko, Kurs ${DAY} 00:00 UTC × amtlicher Kurs EUR/RUB der Bank von Russland, gültig am 2026-10-31`, date: DAY, currency: 'RUB' });
	// USD: CoinGecko's own USD price of the same snapshot, one leg.
	assert.deepEqual(await rates('USD').rateFor('NEAR', DAY), { rate: '2.9', source: `CoinGecko, USD-Kurs ${DAY} 00:00 UTC`, date: DAY, currency: 'USD' });
	// No rate into the currency: unvalued, as a day without a rate is.
	assert.equal(await rates('GBP').rateFor('NEAR', DAY), null);
	assert.equal(sourceText(DAY, { asset: 'USD', at: `${DAY}T00:00:00Z`, source: 'same', currency: 'USD' }), 'USD, 1:1');
	assert.equal(
		sourceText(DAY, { asset: 'USD', at: '2026-10-30T00:00:00Z', source: 'ecb', currency: 'CHF', fx: { currency: 'CHF', source: 'ecb', at: '2026-10-30T00:00:00Z' } }),
		'EZB-Referenzkurs USD/EUR vom 2026-10-30 × EZB-Referenzkurs EUR/CHF vom 2026-10-30'
	);
});

test('a document in CHF: the values, the CSV’s heads and the source of every position in CHF, PDF/A-2b', async () => {
	const { out, asked } = await run({ currency: 'CHF' });
	assert.equal(out.summary.currency, 'CHF');
	assert.ok(asked.some((u) => u.includes('D.CHF.EUR')));
	assert.ok(!asked.some((u) => u.includes('cbr.ru')), 'the Bank of Russia only for RUB');
	const lines = /** @type {string} */ (out.csv).trimEnd().split('\r\n');
	assert.match(lines[0], /;Kurs CHF;Wert CHF/);
	assert.ok(!/EUR/.test(lines[0]), lines[0]);
	assert.match(lines[1], /CoinGecko, Kurs 2026-11-01 00:00 UTC × EZB-Referenzkurs EUR\/CHF vom 2026-10-30/);
	assert.match(lines[1], /;2,328;/);
	assert.deepEqual(pdfaStructure(/** @type {Uint8Array} */ (out.pdf)).pdfaid, { part: '2', conformance: 'B' });
	assert.deepEqual(pdfaStructure(out.statements[0].pdf).pdfaid, { part: '2', conformance: 'B' });
});

test('a document in RUB: the euro leg times the Bank of Russia’s rate, after the ECB has none', async () => {
	const { out, asked } = await run({ currency: 'RUB' });
	assert.equal(out.summary.currency, 'RUB');
	assert.ok(asked.some((u) => u.startsWith('https://www.cbr.ru/scripts/XML_daily.asp')));
	const lines = /** @type {string} */ (out.csv).trimEnd().split('\r\n');
	assert.match(lines[0], /;Kurs RUB;Wert RUB/);
	assert.match(lines[1], /× amtlicher Kurs EUR\/RUB der Bank von Russland, gültig am 2026-10-31/);
	assert.match(lines.at(-1) ?? '', /^;Summe;/);
	assert.deepEqual(pdfaStructure(/** @type {Uint8Array} */ (out.pdf)).pdfaid, { part: '2', conformance: 'B' });
});

test('EUR: the same files with currency EUR as without, no second leg asked, the rate named as before', async () => {
	const without = await run();
	const eur = await run({ currency: 'EUR' });
	assert.equal(without.out.summary.currency, 'EUR');
	assert.deepEqual(Buffer.from(/** @type {Uint8Array} */ (eur.out.pdf)), Buffer.from(/** @type {Uint8Array} */ (without.out.pdf)));
	assert.deepEqual(Buffer.from(eur.out.statements[0].pdf), Buffer.from(without.out.statements[0].pdf));
	assert.equal(eur.out.csv, without.out.csv);
	assert.ok(!without.asked.some((u) => u.includes('ecb.europa.eu') || u.includes('cbr.ru')), 'no second leg for EUR');
	const lines = /** @type {string} */ (without.out.csv).trimEnd().split('\r\n');
	assert.match(lines[0], /;Kurs EUR;Wert EUR/);
	assert.match(lines[1], /;CoinGecko, Kurs 2026-11-01 00:00 UTC;/);
});
