// SPDX-License-Identifier: AGPL-3.0-or-later
// Every token of an Ethereum address on its Kontoauszug (#93): a token not in
// the chain's list that the address sent on gets a section of its own, named
// by its contract; one only received only when the request names it
// (`tokens`); it is valued by its contract, never by its symbol. Offline, with
// @le-space/chains' fake Alchemy as a fetch. Addresses, the key and every
// amount are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FAKE_ALCHEMY_KEY as KEY } from '@le-space/chains/testing/alchemy';
import { DROP, FAKE_USDC, TOKENS_WALLET, XYZ, fakeAlchemyFetch } from '@le-space/chains/testing/alchemy-tokens';
import { fixedRates } from '@le-space/eigenbeleg';
import { MAX_TOKENS, RequestError, blocksFor, describeBlocks, generate, parseRequest } from '../src/index.js';
import { dayRates, referenceRates } from '../src/rates.js';

const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };
const blocks = blocksFor({ alchemyKey: KEY });
const today = '2026-12-05';
const now = () => new Date(`${today}T12:00:00Z`);

/** @param {Record<string, unknown>} over */
const request = (over = {}) => parseRequest({ chain: 'ethereum', addresses: [TOKENS_WALLET], period: { month: '2026-10' }, format: 'json', document: 'kontoauszug', payer, ...over }, { today, blocks });

test('a request names token contracts on Ethereum and Base only, up to fifty, each 0x and 40 hex digits', () => {
	assert.equal('tokens' in request(), false, 'none named: no field');
	assert.deepEqual(request({ tokens: [DROP.toUpperCase().replace('0X', '0x'), ` ${DROP} `] }).tokens, [DROP], 'lower case, once');
	assert.throws(() => request({ tokens: ['0x1234'] }), /tokens: a contract is 0x and 40 hex digits/);
	assert.throws(() => request({ tokens: DROP }), RequestError);
	assert.throws(() => request({ tokens: Array.from({ length: MAX_TOKENS + 1 }, (_, i) => `0x${String(i).padStart(40, '0')}`) }), /up to 50/);
	assert.throws(() => parseRequest({ chain: 'near', addresses: ['relay.aurora'], period: { month: '2026-10' }, payer, tokens: [DROP] }, { today, blocks }), /near takes no token contracts/);
	const ethereum = describeBlocks(blocks).find((b) => b.chain === 'ethereum');
	assert.equal(ethereum?.tokens, true, 'GET /blocks says which chains take them');
});

test('a token the address sent on: a section of its own, named by its contract, valued by it', async () => {
	const fake = fakeAlchemyFetch();
	const out = await generate(request(), { fetch: fake.fetch, alchemyKey: KEY, blocks, now, rates: fixedRates({ ETH: '3000', [XYZ]: '0.02' }) });
	const [k] = out.summary.kontoauszuege;
	assert.deepEqual(
		k.assets.map((a) => [a.asset, /** @type {any} */ (a).contract ?? '', a.opening, a.closing, a.reconciled]),
		[
			['ETH', '', '0', '0.49988', true],
			['USDC', '', '0', '0', true],
			['ALEPH', '', '0', '0', true],
			['XYZ', XYZ, '0', '200', true]
		],
		'the airdrop never touched and the token calling itself USDC are not on it'
	);
	// The PDF's text is @le-space/eigenbeleg's to test; here: it is drawn, one per address.
	assert.equal(out.statements.length, 1);
	assert.ok(out.statements[0].pdf.length > 10_000);
});

test('a contract the request names is on it although only received; a month without its bookings keeps its contract', async () => {
	const rates = fixedRates({ ETH: '3000' });
	const named = await generate(request({ tokens: [DROP, FAKE_USDC] }), { fetch: fakeAlchemyFetch().fetch, alchemyKey: KEY, blocks, now, rates }, { preview: true });
	assert.deepEqual(
		named.summary.kontoauszuege[0].assets.map((a) => [a.asset, /** @type {any} */ (a).contract ?? '', a.closing]),
		[
			['ETH', '', '0.49988'],
			['USDC', '', '0'],
			['ALEPH', '', '0'],
			['XYZ', XYZ, '200'],
			['DROP', DROP, '5']
		],
		'named, yet the token calling itself USDC stays out'
	);
	const november = await generate(request({ period: { month: '2026-11' } }), { fetch: fakeAlchemyFetch().fetch, alchemyKey: KEY, blocks, now, rates });
	const xyz = november.summary.kontoauszuege[0].assets.find((a) => a.asset === 'XYZ');
	assert.deepEqual([/** @type {any} */ (xyz)?.contract, xyz?.opening, xyz?.closing], [XYZ, '200', '200']);
});

/** CoinGecko knows XYZ by its contract; nothing else is answered. @param {string[]} asked */
const coingecko = (asked) =>
	/** @type {typeof fetch} */ (
		async (/** @type {any} */ url) => {
			const u = String(url);
			asked.push(u);
			if (u === `https://api.coingecko.com/api/v3/coins/ethereum/contract/${XYZ}`) return Response.json({ id: 'xyz-made-up' });
			if (u.startsWith('https://api.coingecko.com/api/v3/coins/xyz-made-up/history?date=05-10-2026')) return Response.json({ market_data: { current_price: { eur: 0.02, usd: 0.023 } } });
			return new Response('{}', { status: 404 });
		}
	);

test('the day’s rate of a token by its contract: CoinGecko, named with the contract; none is null', async () => {
	/** @type {string[]} */
	const asked = [];
	const rates = dayRates({ fetch: coingecko(asked), now });
	const token = { asset: 'XYZ', contract: XYZ, chain: 'ethereum', block: 1200, decimals: 18 };
	assert.deepEqual(await rates.tokenRateFor(token, '2026-10-05'), { rate: '0.02', source: `CoinGecko, Kurs 2026-10-05 00:00 UTC (Token-Vertrag ${XYZ})`, date: '2026-10-05' });
	await rates.tokenRateFor(token, '2026-10-05');
	assert.equal(asked.filter((u) => u.includes('/history')).length, 1, 'asked once per token, day and block');
	assert.ok(!asked.some((u) => /\/coins\/xyz[/?]|ids=xyz|symbols?=/i.test(u)), 'never by the symbol it calls itself');
	// Without a key no pool is asked: no rate, no error.
	assert.equal(await rates.tokenRateFor({ ...token, contract: DROP }, '2026-10-05'), null);
	assert.ok(!asked.some((u) => u.includes('alchemy')));
	// With the EVM blocks' key a token CoinGecko does not know is looked for in its Uniswap pools at the block,
	// through Alchemy (no pool here: still no rate).
	/** @type {string[]} */
	const withKey = [];
	assert.equal(await dayRates({ fetch: coingecko(withKey), now, alchemyKey: KEY }).tokenRateFor({ ...token, contract: DROP }, '2026-10-05'), null);
	assert.ok(withKey.some((u) => u.startsWith('https://eth-mainnet.g.alchemy.com/v2/')), withKey.join('\n'));
});

test('a reference table and another currency keep the token rate', async () => {
	const priced = { ...fixedRates({ [XYZ]: '0.02' }, 'CHF'), perEuro: async () => null };
	for (const currency of ['EUR', 'CHF']) {
		const rates = referenceRates(priced, { DOI: [] }, currency);
		assert.equal((await rates.tokenRateFor?.({ asset: 'XYZ', contract: XYZ, chain: 'ethereum', block: 1, decimals: 18 }, '2026-10-05'))?.rate, '0.02', currency);
	}
});
