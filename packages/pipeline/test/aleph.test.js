// SPDX-License-Identifier: AGPL-3.0-or-later
// The Aleph Cloud block: a month's credits as a Verbrauchsauszug, end to end
// through the pipeline, offline. The account, its resources and every amount
// are made up (Wolkenfabrik Hosting GmbH); the API answers in Aleph's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toChecksumAddress } from '@le-space/chains/evm-address';
import { RequestError, describeBlocks, generate, parseRequest } from '../src/index.js';

const ACCOUNT = `0x${'a1'.repeat(20)}`;
const OTHER = `0x${'b2'.repeat(20)}`;
const VM = 'c3'.repeat(32);
const BILLING = 'd4'.repeat(32);
const payer = { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' };

const PURCHASE = `0x${'cd'.repeat(32)}`;
/** A purchase in July, then August: storage, an instance, a purchase on Base, a transfer in and one out; a line in September. */
const ROWS = [
	{ at: '2026-07-20T08:00:00.000Z', amount: 1_000_000, price: '0.000002', tx_hash: `0x${'ab'.repeat(32)}`, token: 'ALEPH', chain: 'ETH' },
	{ at: '2026-08-01T00:30:00.000Z', amount: -100, payment_method: 'credit_expense', origin_ref: 'storage', expense_count: 3, expense_size_mib: 12.5 },
	{ at: '2026-08-01T01:30:00.000Z', amount: -100, payment_method: 'credit_expense', origin_ref: 'storage', expense_count: 4, expense_size_mib: 13 },
	{ at: '2026-08-01T02:00:00.000Z', amount: -2000, payment_method: 'credit_expense', origin_ref: BILLING, origin: VM },
	{ at: '2026-08-10T09:00:00.000Z', amount: 500_000, price: '0.0000025', tx_hash: PURCHASE, token: 'ALEPH', chain: 'BASE' },
	{ at: '2026-08-15T12:00:00.000Z', amount: 50_000, origin: OTHER },
	{ at: '2026-08-20T12:00:00.000Z', amount: -5_000, payment_method: 'credit_transfer', origin: OTHER },
	{ at: '2026-09-01T00:30:00.000Z', amount: -120, payment_method: 'credit_expense', origin_ref: 'storage', expense_count: 4, expense_size_mib: 13 }
];
const BALANCE = 2_000_000 + ROWS.reduce((n, r) => n + r.amount, 0);

/** @type {string[]} */
let asked = [];
const json = (/** @type {unknown} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** Aleph's API (balance, credit history with its filters and pages, summary, messages) and the ECB's USD rate. */
const fetch = /** @type {typeof globalThis.fetch} */ (
	async (/** @type {any} */ input) => {
		const url = new URL(String(input));
		asked.push(url.origin + url.pathname);
		if (url.origin === 'https://data-api.ecb.europa.eu') {
			// 1.25 USD per EUR on every day of the window asked for: 0.8 EUR per USD.
			const days = [];
			const end = Date.parse(`${url.searchParams.get('endPeriod')}T00:00:00Z`);
			for (let t = Date.parse(`${url.searchParams.get('startPeriod')}T00:00:00Z`); t <= end; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
			return json({
				dataSets: [{ series: { '0:0:0:0:0': { observations: Object.fromEntries(days.map((_, i) => [i, [1.25]])) } } }],
				structure: { dimensions: { observation: [{ values: days.map((id) => ({ id })) }] } }
			});
		}
		if (url.origin !== 'https://api2.aleph.im') return json({}, 404);
		if (url.pathname === `/api/v0/messages/${VM}`) return json({ message: { type: 'INSTANCE', content: { metadata: { name: 'wolkenfabrik-web' } } } });
		const m = /^\/api\/v0\/addresses\/(0x[0-9a-fA-F]{40})\/(balance|credit_history)(\/summary)?$/.exec(url.pathname);
		// Aleph knows accounts only by their checksum: asked in lower case, it knows nothing.
		if (!m || m[1] !== toChecksumAddress(ACCOUNT)) return json({}, 404);
		if (m[2] === 'balance') return json({ credit_balance: BALANCE });
		const q = url.searchParams;
		const from = q.has('startDate') ? Number(q.get('startDate')) * 1000 : -Infinity;
		const to = q.has('endDate') ? Number(q.get('endDate')) * 1000 : Infinity;
		const rows = ROWS.filter((r) => Date.parse(r.at) >= from && Date.parse(r.at) <= to)
			.filter((r) => q.get('direction') !== 'incoming' || r.amount > 0)
			.sort((a, b) => b.at.localeCompare(a.at));
		if (m[3]) return json({ total_amount: rows.reduce((n, r) => n + r.amount, 0), entry_count: rows.length });
		const per = Number(q.get('pagination') ?? 100);
		const page = Number(q.get('page') ?? 1);
		return json({ pagination_total: rows.length, credit_history: rows.slice((page - 1) * per, page * per).map(({ at, ...r }) => ({ message_timestamp: at, ...r })) });
	}
);

test('a month of Aleph credits is a Verbrauchsauszug: opening, purchases, usage per day and resource, closing', async () => {
	asked = [];
	const req = parseRequest({ chain: 'aleph', addresses: [ACCOUNT], period: { month: '2026-08' }, format: 'json', payer }, { today: '2026-11-06' });
	assert.equal(req.document, 'kontoauszug', 'the statement is what Aleph gives');
	assert.deepEqual(req.addresses, [toChecksumAddress(ACCOUNT)]);
	assert.equal(req.statementNumber, 'VA-2026-08-01');
	const out = await generate(req, { fetch, now: () => new Date('2026-11-06T12:00:00Z') });
	assert.equal(out.pdf, null, 'no Eigenbeleg for consumption from a prepaid balance');
	assert.equal(out.statements.length, 1);
	const [k] = out.summary.kontoauszuege;
	// Before August: 2,000,000 + the July purchase; August: −2,200 used, +500,000 bought, +50,000 in, −5,000 out.
	const [{ monthly, ...credits }] = k.assets;
	assert.deepEqual(credits, { asset: 'ALEPH-CREDIT', opening: '3000000', closing: '3542800', reconciled: true }, 'the purchase is credits in; its USD side is not on the statement');
	// The month in sums (#24): per resource, in all, bought, in, out; the EUR of a transfer is unknown.
	assert.deepEqual(monthly.usage.map((l) => [l.label, l.amount, l.eur, l.rows]), [['Verbrauch Speicher (storage)', '200', '0.00032', 1], ['Verbrauch wolkenfabrik-web', '2000', '0.0032', 1]]);
	assert.deepEqual(monthly.usageTotal, { label: 'Verbrauch gesamt (Aufwand)', amount: '2200', eur: '0.00352', rows: 2 });
	assert.deepEqual([monthly.purchases.amount, monthly.purchases.eur, monthly.transfersIn.amount, monthly.transfersIn.eur, monthly.transfersOut.amount, monthly.fees], ['500000', '1', '50000', '', '5000', null]);
	assert.equal(k.method, 'derived');
	assert.ok(asked.every((u) => u.startsWith('https://api2.aleph.im/') || u.startsWith('https://data-api.ecb.europa.eu/')), asked.join('\n'));

	const lines = /** @type {string} */ (out.csv).split('\r\n');
	const storage = lines.find((l) => l.includes('Aleph Cloud (storage)'));
	const vm = lines.find((l) => l.includes('Aleph Cloud (wolkenfabrik-web)'));
	// 200 credits × 0.000002 USD × 0.8 EUR/USD; 2,000 credits the same way.
	assert.match(storage ?? '', /;Verbrauch \(aus Guthaben abgerechnet\);Ausgang;.*;-200;0,0000016;-0,00032;Aleph Kaufpreis 0.000002 USD je Credit × EZB-Referenzkurs USD\/EUR vom 2026-08-01;/);
	assert.match(vm ?? '', /;-2000;0,0000016;-0,0032;/);
	assert.match(storage ?? '', /;nein;Verbrauch aus Guthaben: steht im Verbrauchsauszug$/);
	const pdf = new TextDecoder('latin1').decode(out.statements[0].pdf);
	assert.match(pdf, /Verbrauchsauszug VA-2026-08-01/, 'the title in the metadata');
	assert.deepEqual(out.summary.eigenbelege, ['EB-2026-001'], 'the August purchase would be one; the statement was asked for, so none is drawn');
	const statementCsv = lines.filter((l) => l.includes(PURCHASE));
	assert.equal(statementCsv.length, 2, 'the credits bought and the payment for them, both excluded from a statement-only request');
});

test('Aleph: an Eigenbeleg per purchase of credits, the payment in USD at the ECB rate, with the paying transaction (#23)', async () => {
	const req = parseRequest({ chain: 'aleph', addresses: [ACCOUNT], period: { month: '2026-08' }, format: 'json', document: 'beide', payer }, { today: '2026-11-06' });
	assert.deepEqual(req.includeKinds, ['swap'], 'the purchase is on the Eigenbeleg by default');
	const out = await generate(req, { fetch, now: () => new Date('2026-11-06T12:00:00Z') });
	assert.deepEqual(out.summary.eigenbelege, ['EB-2026-001'], 'the July purchase is not in August; the August one is');
	assert.equal(out.summary.transactions, 1);
	// 500,000 credits × 0.0000025 USD = 1.25 USD × 0.8 EUR/USD = 1.00 EUR.
	assert.equal(out.summary.totalEur, '1');
	assert.deepEqual(out.summary.quantities, { USD: '1.25' });
	assert.ok(out.pdf instanceof Uint8Array && out.pdf.length > 1000, 'the Eigenbeleg is drawn');
	assert.deepEqual(out.summary.kontoauszuege[0].assets.map((a) => a.asset), ['ALEPH-CREDIT'], 'no USD section on the Verbrauchsauszug');
	const lines = /** @type {string} */ (out.csv).split('\r\n');
	const paid = lines.find((l) => l.startsWith('EB-2026-001;'));
	assert.match(paid ?? '', /;Kauf von Guthaben \(Credits\);Ausgang;Aleph Cloud \(Kauf von 500000 Credits mit ALEPH auf BASE\) \(aleph\);USD;native;-1,25;0,8;-1;EZB-Referenzkurs USD\/EUR vom 2026-08-10;0xcdcd/);
	assert.match(paid ?? '', new RegExp(`;https://basescan\\.org/tx/${PURCHASE};ja;$`), 'the explorer link of the paying transaction');
	const credits = lines.find((l) => l.includes(PURCHASE) && l.includes('ALEPH-CREDIT'));
	assert.match(credits ?? '', /;Überweisung;Eingang;.*;500000;.*;nein;Eingang, keine Zahlung$/, 'the credits bought: the incoming movement of the same transaction');
	const usage = lines.filter((l) => l.includes('Verbrauch (aus Guthaben abgerechnet)'));
	assert.ok(usage.length >= 2 && usage.every((l) => l.endsWith(';nein;Verbrauch aus Guthaben: steht im Verbrauchsauszug')), 'usage never is');
});

test('Aleph: whole finished months, every document, Ethereum addresses', () => {
	const d = describeBlocks().find((b) => b.chain === 'aleph');
	assert.deepEqual([d?.documents, d?.period, d?.statementPrefix, d?.kinds], [['kontoauszug', 'eigenbelege', 'beide'], 'month', 'VA', ['swap']]);
	const body = { chain: 'aleph', addresses: [ACCOUNT], period: { month: '2026-08' }, format: 'json', payer };
	const refused = (/** @type {any} */ over) => assert.throws(() => parseRequest({ ...body, ...over }, { today: '2026-11-06' }), RequestError);
	refused({ period: { from: '2026-08-01', to: '2026-08-31' } });
	refused({ period: { month: '2026-11' } });
	refused({ includeKinds: ['fee'] });
	refused({ addresses: ['wolkenfabrik.near'] });
	refused({ addresses: [`0x${'A1'.repeat(19)}a1`.replace('A1', 'a1')] });
	assert.deepEqual(parseRequest({ ...body, addresses: [ACCOUNT, ACCOUNT.toUpperCase().replace('0X', '0x')] }, { today: '2026-11-06' }).addresses, [toChecksumAddress(ACCOUNT)], 'one account, in any case');
});
