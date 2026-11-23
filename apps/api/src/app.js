// SPDX-License-Identifier: AGPL-3.0-or-later
// The HTTP API.
//
//   GET  /             what this is, the price and how to pay (JSON); a browser is sent to /ui/
//   GET  /blocks       the building blocks by chain, for agents
//   GET  /health
//   POST /eigenbeleg   the Eigenbeleg, behind the x402 paywall; paid in a chain's own coin (DOI): 202 until its block, then the files
//   POST /eigenbeleg/preview  free: positions and total, never the payer
//   POST /eigenbeleg/subscribe  twelve monthly Kontoauszüge by mail, paid once (#20)
//   POST /eigenbeleg/subscribe/:months  the same for 1 to 12 months, at months × the price
//   GET  /eigenbeleg/subscribe/:id/cancel?token=…  the link in each mail; deletes the subscription
//   POST /testnet/eigenbeleg  the test route: testnet data only, paid in testnet USDC, every PDF
//        marked TESTNET; a few per hour per IP; on only with a testnet paywall (TESTNET_PAY_TO)
//   GET  /ui/          the web UI (apps/web/dist), when it is built; ?lang=de and ?lang=en are each language under its own address
//   GET  /robots.txt, /sitemap.xml   for crawlers, with the UI: the page's addresses
//
// No storage beyond the request: the body (payer's name and address, and an
// e-mail address when the files are wanted by mail) lives in memory until the
// response is sent and the mail, if any, is out. Logs carry method, path,
// status and duration only. The one exception is a subscription, kept
// encrypted until its last month or its cancellation (subscriptions.js), and a
// payment in a chain's own coin: its txid, amount, time and a hash of the
// request, so that it is redeemed once (onchain.js).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { CURRENCIES, RequestError, blocksFor, checkBlock, describeBlocks, generate, issuerLogoImage, parseRequest } from '@eigenbeleg/pipeline';
import { VAT } from '@eigenbeleg/pipeline/prices';
import { composeMail } from './mail.js';
import { apiBuild, buildFields } from './build.js';
import { openapi } from './describe.js';
import { SECURITY_HTML, SECURITY_MAIL, SECURITY_PATH } from './security-page.js';
import { MONTHS, cancelUrl, dueDate, newSubscription, subscriptionJob, tokenMatches } from './subscriptions.js';

/**
 * @param {object} o
 * @param {{ middleware: import('express').RequestHandler | null, info: Record<string, unknown>, step?: import('express').RequestHandler }} o.paywall
 *   `step`: in front of the middleware, for a payment that is final only after a block (onchain.js)
 * @param {Parameters<typeof generate>[1]} [o.deps] with `alchemyKey` (ALCHEMY_KEY) the API also serves Ethereum and Base;
 *   the key goes to their reads only, never into an answer or a log
 * @param {(line: string) => void} [o.log]
 * @param {string} [o.source] where the source of this running version is (AGPL-3.0-or-later, section 13)
 * @param {import('./build.js').Build} [o.build] which build this is (build.js); from the environment or git when not given
 * @param {string | null} [o.web] the built web UI (apps/web/dist); null: no UI
 * @param {{ max: number, windowMs: number }} [o.previewLimit] free previews per IP
 * @param {import('./mail.js').Mailer | null} [o.mailer] sends the files by mail when a request asks (`email`); null: not offered here
 * @param {import('./subscriptions.js').Store | null} [o.subscriptions] where subscriptions are kept (#20); null, or no mailer: not offered here
 * @param {import('./logos.js').LogoStore | null} [o.logos] where a preview's logo is kept for 24 hours (logos.js); null: the preview checks a picture and keeps none
 * @param {{ middleware: import('express').RequestHandler | null, info: Record<string, unknown> } | null} [o.testnet] the test
 *   route's paywall (paywall.js, createTestnetPaywall); null: the test route is off
 * @param {{ max: number, windowMs: number }} [o.testnetLimit] requests to the test route per IP, the 402s included
 * @param {number} [o.testnetMailsPerDay] the test route's mails per day, all callers together
 * @param {string} [o.publicUrl] this instance's public origin, e.g. https://eigenbeleg.le-space.de, for the share
 *   cards' absolute URLs; unset: taken from the request's Host (and X-Forwarded-Proto)
 */
/** Where to get help; what to send is on the page (/ui/#hilfe). */
export const SUPPORT = Object.freeze({
	help: 'eigenbeleg@le-space.de',
	payments: 'support@le-space.de',
	security: SECURITY_MAIL,
	policy: SECURITY_PATH,
	page: '/ui/#hilfe',
	never: 'Le Space never asks for a seed phrase, passkey, private key or token'
});

/** Where the terms of business are: a folded section of the web UI. */
export const TERMS_PATH = '/ui/#agb';

export function createApp({
	paywall,
	deps: given = {},
	log = (l) => console.log(l),
	source = 'https://github.com/Le-Space/eigenbeleg-agent',
	build = apiBuild(),
	web = WEB_DIST,
	previewLimit = { max: 10, windowMs: 60_000 },
	mailer = null,
	subscriptions = null,
	logos = null,
	testnet = null,
	testnetLimit = { max: 30, windowMs: 3_600_000 },
	testnetMailsPerDay = TESTNET_MAILS_PER_DAY,
	publicUrl
}) {
	// The blocks this instance serves: the keyless ones, and Ethereum and Base where an Alchemy key is set.
	const blocks = blocksFor(given);
	const deps = { ...given, blocks };
	/** Subscriptions need somewhere to keep them and a way to send them. */
	const subs = mailer && subscriptions ? subscriptions : null;
	const today = () => (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
	/**
	 * A body that names a preview's picture (`issuerLogoId`) becomes one that carries it. The id is
	 * the key to the picture and goes nowhere else: not into the job, an answer or a log line.
	 * @param {any} body
	 */
	const withKeptLogo = async (body) => {
		if (!body || typeof body !== 'object' || Array.isArray(body) || body.issuerLogoId === undefined || body.issuerLogoId === null) return body;
		if (body.issuerLogo !== undefined && body.issuerLogo !== null) throw new RequestError('issuerLogoId: either the id a preview answered with or issuerLogo, not both');
		if (!logos) throw new RequestError('issuerLogoId: this instance keeps no pictures; send the file as issuerLogo');
		const kept = await logos.get(body.issuerLogoId);
		if (!kept) throw new RequestError('issuerLogoId: no such picture (a preview\'s picture is kept for 24 hours); send the file as issuerLogo');
		const { issuerLogoId: _id, ...rest } = body;
		return { ...rest, issuerLogo: kept.bytes };
	};
	/** Payments in a chain's own coin, where this instance offers one (paywall.js, onchain.js). */
	const coins = /** @type {{ network: string, name: string, asset: string, price: string, payTo: string, confirmations: number, wait: string, redeemableDays: number, explorer: string, servers: string[], perOrder: boolean, orderHeader: string | null, orderHours: number }[]} */ (/** @type {any} */ (paywall.info).coins ?? []);
	const app = express();
	app.disable('x-powered-by');
	// The paywalls match the exact path: `/eigenbeleg/` or `/EIGENBELEG` must not
	// reach the paid route around them.
	app.set('case sensitive routing', true);
	app.set('strict routing', true);
	app.use((req, res, next) => {
		const t0 = Date.now();
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Cache-Control', 'no-store');
		res.on('finish', () => log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`));
		next();
	});

	// Content negotiation: a browser (Accept: text/html) is sent to the UI;
	// agents, curl and fetch (application/json, */* or nothing) get the JSON.
	app.get('/', (req, res) => {
		res.vary('Accept');
		if (hasUi && req.accepts(['json', 'html']) === 'html') {
			res.redirect(302, '/ui/');
			return;
		}
		res.json({
			service: 'eigenbeleg',
			// Which build answers: the version, and the commit with its instant (build.js).
			...buildFields(build),
			what: 'Eigenbelege (self-issued proofs of payment, never invoices) for the payments of own blockchain addresses, as PDF/A-2b and CSV',
			endpoint: 'POST /eigenbeleg',
			preview: 'POST /eigenbeleg/preview (free; the same body without payer)',
			ui: hasUi ? '/ui/' : null,
			people: 'the web UI does everything in the browser, free; nothing is sent to this API',
			customers: `businesses only (§ 14 BGB): the paid API sells to businesses under its terms of business, ${TERMS_PATH} on this host; prices include ${VAT}% German VAT; invoice on request (contact@le-space.de, with the transaction hash). Private persons use the web UI, free.`,
			terms: TERMS_PATH,
			support: SUPPORT,
			agents: '/llms.txt',
			openapi: '/openapi.json',
			payment: paywall.info,
			request: {
				chain: 'near',
				network: 'mainnet | testnet (where the payments were made)',
				addresses: ['own-account.near'],
				period: { month: 'YYYY-MM' },
				format: 'pdf | csv | json (all files, PDFs base64)',
				document: 'eigenbelege (default; one per transaction) | kontoauszug (per address) | beide (format json only)',
				payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' },
				number: 'EB-2026-001 (optional, from your own range)',
				includeKinds: ['fee', 'storage'],
				logo: 'true | false (optional: the chain\'s mark, small, beside the title)',
				chart: 'true | false (optional, default true: the diagram above a statement\'s bookings – the balance, or the consumption per day)',
				currency: `${CURRENCIES.join(' | ')} (optional, default EUR: the currency of the documents, ISO 4217)`,
				issuerLogo: 'optional: the payer\'s own logo, a PNG or JPEG file as base64 text (at most 512 kB), drawn top right in the head of every Eigenbeleg (a Kontoauszug carries none); never logged, see llms.txt for what is kept',
				issuerLogoId: logos ? 'optional, instead of issuerLogo: the id POST /eigenbeleg/preview answered with for a picture sent there, within 24 hours' : null,
				email: mailer ? 'belege@example.org (optional: the files also by mail, for a document management system\'s inbox)' : null,
				language: 'en | de (optional, default en: the language of the mail; the documents are German either way)'
			},
			mail: mailer ? 'the files by mail to the request\'s email, once the payment is settled; the address is used for that one mail' : 'not offered by this instance',
			subscription: subs
				? {
						endpoint: 'POST /eigenbeleg/subscribe',
						what: `${MONTHS} monthly Kontoauszüge (Aleph: Verbrauchsauszüge) by mail, each from the 2nd of the month for the month before, paid once`,
						months: `POST /eigenbeleg/subscribe/<months>: the same for 1 to ${MONTHS} months in advance, at months × the price of one request`,
						request: 'the body of POST /eigenbeleg with email, without period (document: kontoauszug by default; eigenbelege or beide too)',
						price: /** @type {any} */ (paywall.info).subscription ?? null,
						cancel: 'the link in every mail deletes the subscription; no refund of the remaining months',
						privacy: 'chain, addresses, payer (with the logo, if one was sent), e-mail address and options are kept encrypted until the last statement or the cancellation, then deleted'
					}
				: 'not offered by this instance',
			testnet: testnet
				? { ...testnet.info, what: TESTNET_WHAT, limits: testnetLimits(testnetLimit, testnetMailsPerDay) }
				: 'not offered by this instance',
			blocks: describeBlocks(blocks),
			privacy: `Nothing is stored beyond the request; logs hold method, path, status and duration only. An e-mail address goes into that one mail and nowhere else.${logos ? ' A logo sent with the free preview is kept encrypted for 24 hours, then deleted.' : ''}${subs ? ' A subscription is the one exception: see subscription.privacy.' : ''}${coins.length ? ` Of a payment in ${coins.map((c) => c.asset).join(', ')} the transaction id, amount and time and a SHA-256 hash of the request are kept, so that it is redeemed once; the paying address is public on the chain.` : ''}`,
			data: 'Powered by NearBlocks.io APIs; EUR rates: the price at 00:00 UTC from CoinGecko, else Kraken (@le-space/rates).',
			license: 'AGPL-3.0-or-later',
			source
		});
	});
	const hasUi = Boolean(web && existsSync(`${web}/index.html`));
	if (hasUi) mountUi(app, /** @type {string} */ (web), publicUrl);
	// For tools and agents that read a description instead of prose (describe.js).
	app.get('/openapi.json', (req, res) => {
		res.setHeader('Cache-Control', 'public, max-age=3600');
		res.json(openapi({ base: origin(req, publicUrl), payment: /** @type {Record<string, unknown>} */ (paywall.info), chains: Object.keys(blocks), terms: TERMS_PATH, source, subscriptions: Boolean(subs), build }));
	});
	// For agents (llms.txt convention): what is sold, the price, the x402 flow, and where people go instead.
	app.get('/llms.txt', (req, res) => {
		const p = /** @type {Record<string, unknown>} */ (paywall.info);
		const accepts = /** @type {{ network: string, name: string, asset: string, price: string, payTo: string }[]} */ (p.accepts ?? []);
		const price =
			p.mode === 'x402'
				? `USDC on ${accepts.map((a) => `${a.name} (${a.network}): ${a.price} to ${a.payTo}`).join('; ')}. The payer picks one of the 402's accepts; this API's relayer pays the gas on each`
				: p.mode === 'none'
					? 'free (development mode)'
					: `paid via ${p.mode}`;
		// A coin beside USDC is named in the same line, so an agent that skims sees every way to pay.
		const orCoins = coins.length ? `; or ${coins.map((c) => `${c.price} on ${c.name} (below, "Paying in ${c.asset}")`).join('; ')}` : '';
		// How to sign, only for the networks this instance offers.
		const near = accepts.some((a) => a.network.startsWith('near:'));
		const evm = accepts.some((a) => a.network.startsWith('eip155:'));
		const signs = [near ? 'On NEAR: one NEP-366 delegate action with one `ft_transfer` of USDC (the payer needs USDC and a USDC storage registration, no NEAR).' : '', evm ? 'On Base or Ethereum: one EIP-3009 `transferWithAuthorization` of USDC (the payer needs USDC, no ETH).' : ''].filter(Boolean).join(' ');
		const clients = [near ? '@x402/near' : '', evm ? '@x402/evm' : ''].filter(Boolean).join(' or ') || '@x402/near or @x402/evm';
		const base = origin(req, publicUrl);
		const stamp = [build.version ? `version ${build.version}` : '', build.commit ? `commit ${build.commit.slice(0, 12)} of ${build.date.slice(0, 10)}` : ''].filter(Boolean).join(', ');
		res.type('text/plain; charset=utf-8').send(`# Eigenbeleg API
${stamp ? `\nThis instance: ${stamp}.\n` : ''}
> Eigenbelege (self-issued proofs of payment for German bookkeeping; never invoices) for the payments of a person's own blockchain addresses: network fees, storage deposits, transfers. PDF/A-2b and CSV, with the EUR rate of each payment's day and its source. Paid per request with x402.

People use the web UI at ${base}/ui/ instead: it does everything in their browser, for free, and sends nothing here. This API is for agents acting for someone.

**Businesses only.** The paid API sells to businesses (§ 14 BGB, German Civil Code) under its terms of business: ${base}${TERMS_PATH} (German binding, English for reading). By paying, the customer confirms they act for their business; buy only for someone who does. Private persons use the web UI, free. Prices include ${VAT}% German VAT; an invoice comes on request (e-mail to contact@le-space.de with the payment's transaction hash and the billing address).

## Buy

- POST ${base}/eigenbeleg/preview: free, the same body without \`payer\`; counts and totals, no files. Check here first.
- POST ${base}/eigenbeleg: ${price}${orCoins}.${subs ? `\n- POST ${base}/eigenbeleg/subscribe: a subscription, ${MONTHS} monthly Kontoauszüge by mail, paid once: ${/** @type {any} */ (paywall.info).subscription?.price ?? 'see GET /'} (${MONTHS} × the price, unless set apart); POST ${base}/eigenbeleg/subscribe/<months> buys 1 to ${MONTHS} months in advance at months × the price of one request. The same body as POST /eigenbeleg with \`email\` and without \`period\`; \`document\` is kontoauszug by default. From the 2nd of each month the statement for the month before goes to that address; the answer and every mail carry the cancel link, which deletes everything (no refund of the remaining months). Chain, addresses, payer, e-mail address and options are kept encrypted until the last statement or the cancellation; everything else this API does stays unstored.` : ''}
  1. Send the body; the answer is 402 with a \`PAYMENT-REQUIRED\` header (base64 JSON, x402 v2, scheme \`exact\`).
  2. Sign what it asks for and send the same request again with \`PAYMENT-SIGNATURE\`.${signs ? ` ${signs}` : ''}
  3. The answer carries the files and \`PAYMENT-RESPONSE\` (the transaction). If reading the chain fails, nothing is charged.
  Clients: @x402/fetch with ${clients} (JavaScript), or this repository's agent: npm run agent -- --help.
${coins.map((c) => `
### Paying in ${c.asset} (${c.name})

POST ${base}/eigenbeleg also takes ${c.price}${c.perOrder ? '' : ` to ${c.payTo}`}: the 402's accepts list it with scheme \`onchain\`, network ${c.network}, the amount in the smallest unit. A block takes its time, so this purchase has two steps; tell the person the documents come ${c.wait} after the payment.
  1. Sign a plain transaction that pays at least the amount to that address, with final sequence numbers. Do not broadcast it.
  2. Send the same request with \`PAYMENT-SIGNATURE\`: base64 JSON { "x402Version": 2, "accepted": <that entry of accepts, unchanged>, "payload": { "transaction": "<hex>" } }. This server ties the transaction to the request and broadcasts it. A transaction the network already knows is refused, because anybody could have copied it.
  3. The answer is 202 with the txid, an explorer link, the confirmations so far and \`Retry-After\`. Repeat the same request (the same header, or payload { "txid": "…" }) until it is 200 with the files and \`PAYMENT-RESPONSE\`; the documents are built after ${c.confirmations} confirmation(s).
  The payment belongs to this one request (the same body, byte for byte in its values) and stays redeemable for it for ${c.redeemableDays} days, also when reading the chain failed in between (502) or the same files are wanted again. A 402 on a repeat names the reason in the header's \`error\` (replaced, dropped, too small, another request). Not for subscriptions yet.${c.perOrder ? `
  From a wallet (a QR code) instead: send the request with the header \`${c.orderHeader}\`. The 402's offer then has a \`payTo\` that is this request's alone, the payment URI in \`extra.uri\` and \`extra.payBefore\` (${c.orderHours} hours). Let the person pay it, then send the same request, with that header, with \`PAYMENT-SIGNATURE\` and payload {} until it is 200: the payment is found at the address, no txid needed. Use the offer of that 402, unchanged, as \`accepted\`.` : ' Not from a wallet by itself: the transaction has to come through this server.'} Kept of the payment: txid, amount, time and a SHA-256 hash of the request${c.perOrder ? ' (and of an order its address, that hash and its time)' : ''}; the paying address is public on ${c.name}. Asked about it: ${c.servers.join(', ')} (ElectrumX; they see the transaction and this server's IP address, never the request).
`).join('')}${testnet ? `\n## Test (testnet)\n\n- POST ${base}/testnet/eigenbeleg: ${TESTNET_WHAT}. GET ${base}/testnet/blocks as well, so a client takes ${base}/testnet as its API base (this repository's agent: --api ${base}/testnet --network testnet). Paid like POST /eigenbeleg, with USDC on NEAR testnet (near:testnet): ${testnetPrice(testnet)}. ${testnetLimits(testnetLimit, testnetMailsPerDay)}. For developing and testing clients; no contract, no invoice, no value.\n` : ''}
The same for tools: GET ${base}/openapi.json (OpenAPI 3.1); every 402 of POST /eigenbeleg also carries the body's JSON Schema and an example (the x402 bazaar extension).

## Body

{
  "chain": ${describeBlocks(blocks).map((b) => `"${b.chain}"`).join(' | ')}   (GET ${base}/blocks lists them and their networks),
  "network": "mainnet" | "testnet",           where the payments were made,
  "addresses": ["own-account.near"],          one to ten own addresses,
  "period": { "month": "YYYY-MM" } or { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }   finished days, at most 92,
  "format": "pdf" | "csv" | "json",          json: every file, PDFs base64,
  "document": "eigenbelege" | "kontoauszug" | "beide",
  "payer": { "name": "…", "address": "street, postcode town" }   printed on the documents; used for this response only, never stored or logged,
  "number": "EB-2026-001",                    optional, first number of the payer's own range,
  "includeKinds": ["fee", "storage"],         optional: of the chain's kinds in GET /blocks (fee, storage, transfer, call, swap; storage is NEAR's; NEAR's default has its swaps at a DEX too)
  "logo": false,                              optional: the chain's mark, small, beside the title
  "tokens": ["0x…"],                         optional, ethereum and base only: contracts of tokens not in the chain's list to put on the Kontoauszug although only received; see the choices below
  "chart": true,                              optional, default true: the diagram above a statement's bookings (the balance, or the consumption per day)
  "currency": "EUR",                          optional, default EUR: the documents' currency, one of ${CURRENCIES.join(', ')} (ISO 4217); see the choices below
  "reference": { "DOI": { "eur": "0.05", "from": "2026-01-01" } }   optional, only for a chain whose asset has no published rate (doichain): the payer's own euro value per unit and the day it holds from; default 0.04 EUR per DOI for the whole period, printed as the default
  "issuerLogo": "iVBORw0KGgo…",               optional: the payer's own logo, a PNG or JPEG file as base64 text; see Notes
${logos ? '  "issuerLogoId": "…",                        optional, instead of issuerLogo: the id the preview answered with; see Notes\n' : ''}  "email": "belege@example.org",              optional${mailer ? '' : ' (not offered by this instance)'}: the files also by mail, once the payment is settled
  "language": "en" | "de"                     optional, default en: the language of the mail (the documents are German either way)
}

## Choices to settle with the person

The request has choices that change what the person gets. Take each from what the person said. Where they said nothing, tell them the default you will use – or ask, when the answer is not obvious – before anything is bought: once, in one message, not question by question. Never make up the payer's name or address.

- **Which document** (\`document\`): \`eigenbelege\` (the default: one Eigenbeleg per payment, for payments without a receipt from the other side), \`kontoauszug\` (the account's statement: opening balance, every booking, closing balance) or \`beide\`. "Receipts for my fees" means eigenbelege; "a statement", "the balance" or "what did the account do" means kontoauszug; "everything for my bookkeeping" means beide. For \`aleph\` and \`filecoin-pay\` the statement is a Verbrauchsauszug.
- **Currency** (\`currency\`, EUR by default): the currency the books are kept in, as an ISO 4217 code: EUR, USD, CHF, GBP, SEK, NOK, DKK, PLN, CZK, HUF, RON, ISK, TRY or RUB. A value in another currency than EUR is the euro rate of the payment's day times that currency's official rate of the day (the ECB's euro reference rate, USD too; for RUB the Bank of Russia's; only the crypto leg is CoinGecko's or Kraken's), and every position names both. One currency per document, no second EUR column. Ask only when the person's books are not in EUR (a company in Switzerland, say); never convert the figures yourself. Doichain's reference value stays in EUR per DOI; in another currency it is taken times the euro in that currency on the day, and both are named.
- **The chain's logo** (\`logo\`, off by default): the network's mark, small, beside the title, to tell the documents of several chains apart. There is one for NEAR, Akash, Filecoin and Aleph Cloud; the other chains get none, without an error. It is the chain's mark, not the person's company logo: that is the next choice. Switch it on when the person asks for a logo or for documents that are easy to tell apart; otherwise mention it only if they ask what can be changed.
- **Their own logo** (\`issuerLogo\`, none by default): the logo of the person's company, top right in the head of every Eigenbeleg, beside or without the chain's mark; a Kontoauszug or Verbrauchsauszug carries none. Only a file the person gives you (PNG or JPEG, at most 512 kB; no SVG): never take one from the web or make one up. Ask for it once when the person wants their own documents to look like theirs or asks for "our logo"; otherwise mention it only if they ask what can be changed. Tell them before buying that a subscription with Eigenbelege keeps the picture until it ends (one of statements alone keeps none, as no statement draws it), and a preview keeps it for 24 hours.
- **Other tokens on Ethereum and Base** (\`tokens\`): the Kontoauszug has ETH and the listed tokens (GET /blocks), and every other ERC-20 token the address sent on, each in a section of its own named by its contract – the symbol is the token's own claim. A token the address only received (an airdrop, often spam) is left out unless the person names its contract here (up to 50). Such a token is valued by its contract only, CoinGecko or its Uniswap pool at the booking's block, else not at all. Ask only when the person mentions a token that is missing; never pick contracts yourself.
- **The diagram** (\`chart\`, on by default): above a statement's bookings, the balance over the period or the consumption per day. Only on statements, and none for a period of one day or without bookings. Switch it off when the person wants a plain statement, tables only, or the fewest pages.
- **What goes on an Eigenbeleg** (\`includeKinds\`): network fees and, on NEAR, storage deposits by default. Transfers and contract calls are payments to someone who may have sent a receipt; include them only when the person says those payments have none.
- **Language:** the documents are German whatever is asked for.

After the preview, say what you are about to buy – document, period, these choices, the price – and buy only then.

## Notes

${blocks.base ? "- ethereum, base: ETH, USDC and ALEPH (the token Aleph Cloud is paid with) and the gas, read through this server's Alchemy key; the whole history of the address is read, so a busy address takes a while.\n" : ''}${blocks.doichain ? "- doichain (DOI, by the own address: dc1…, M… or N…, 6…): read from public ElectrumX servers of the Doichain network, and only from one on the valid chain. DOI has no published rate and no price feed is asked for it: the payer's own value goes in \`reference\` (EUR per DOI, from a day on), which the documents name as a reference value of the payer, not an exchange rate. Without it the documents take the default of 0.04 EUR per DOI for the whole period, named as the default (eigenbeleg-agent), not as an exchange rate. A name operation is a payment with a note.\n" : ''}${blocks.bitcoin ? "- bitcoin (BTC, by the own address: 1…, 3… or bc1…; no xpub here: a wallet by its xpub, ypub or zpub is read on the web UI or with the CLI, where the key stays on the caller's machine): read from the Esplora API at mempool.space, confirmed transactions only. A payment is the amount sent plus the miner fee as its own entry; EUR at the day's BTC rate.\n" : ''}- filecoin-pay (the balance in the Filecoin Pay contract of Filecoin Onchain Cloud, by the payer's address, 0x… or f410f…): one finished month (\`period.month\`), \`document\` kontoauszug only – a Verbrauchsauszug (VA-…) with the balance before and after, what was paid in and taken out, and each settlement of a rail to its storage provider, valued at the day's USDC rate. No Eigenbeleg: a settlement is no single payment. Only USDFC; a settlement pays up to the moment it names, so a month's settlements need not cover exactly that month. The paying in itself is on the payer's \`filecoin\` Kontoauszug.
- aleph (Aleph Cloud credits, by the Ethereum address): one finished month (\`period.month\`). \`document\` kontoauszug (the default) is a Verbrauchsauszug (VA-…), usage per day and resource, valued at the USD price per credit and the ECB rate of the day; eigenbelege gives one Eigenbeleg per purchase of credits (kind swap: a token for credits, in USD at the ECB rate, with the paying transaction's hash on Ethereum or Base). Usage itself gets no Eigenbeleg: it is no single payment.
- issuerLogo: the logo of the person or company the documents are for, drawn top right in the head of every Eigenbeleg as a letterhead, fitted into 200 × 70 pt; a Kontoauszug or Verbrauchsauszug, which shows what the account did, carries none. The file's bytes as plain base64 (no \`data:\` prefix), PNG or JPEG (no SVG, GIF or CMYK), at most 512 kB and 2048 pixels a side, at most 6 times as wide as high and twice as high as wide; a transparent PNG is laid on white, a JPEG loses its EXIF. A picture outside these limits is a 400 that says why, before anything is paid. Never logged, and used for this response only – except in a subscription with Eigenbelege (\`document\` eigenbelege or beide), which keeps the picture encrypted with its other details until the last statement or the cancellation; a subscription of statements alone keeps none. The free preview takes it too and checks it (it draws nothing), so send it there first.${logos ? ' A picture sent with the preview is kept on this server for 24 hours, encrypted, and then deleted: the preview answers with `issuerLogoId` and `issuerLogoUntil`, and POST /eigenbeleg or the subscription within that time takes `"issuerLogoId": "…"` instead of the picture. Tell the user that it is kept for a day; where the answer has no issuerLogoId, or after 24 hours, send issuerLogo again. A payment that waits for its block is tied to the exact body: with such a payment send the picture itself as issuerLogo, so the body still works when it is sent again after those 24 hours.' : ' No picture of a preview is kept here: send issuerLogo again with the paid request.'} It is the user's own file: ask for it, never fetch a logo from the web yourself. \`logo\` is something else: the chain's mark.
- The documents are in German. An Eigenbeleg counts only once the payer signs it; whether a tax adviser accepts it is theirs to decide.
- email: the files go as attachments (stable names: EB-….pdf, KA-….pdf, EB-….csv; subject "Eigenbeleg EB-… · chain network · period"), so a document management system's inbox can sort them. The answer says \`mail: queued\` (format json) or carries X-Eigenbeleg-Mail: queued. The address is used for that one mail only.
- As a skill (Agent Skills format, agentskills.io): ${source}/tree/main/plugin/skills/eigenbeleg-api – these steps for Claude Code and other agents that read SKILL.md. Without paying, on the user's own machine (nothing sent here): ${source}/tree/main/plugin/skills/eigenbeleg-local, i.e. \`npm run local\` in a checkout.
- Help: ${SUPPORT.help}; payments, invoices and credits: ${SUPPORT.payments}. Send the status and \`error\` of the answer and, for a payment, the transaction hash; never documents, names, postal addresses, keys or tokens. Le Space never asks for a seed phrase, passkey, private key or token. Security weaknesses: privately to ${SUPPORT.security}, never in public; the policy: ${base}${SECURITY_PATH}.
- Nothing is stored beyond the request${coins.length ? ' (and what is kept of a payment in a coin, above)' : ''}. Source (AGPL-3.0-or-later): ${source}
`);
	});
	// Also under /testnet/ when the test route is on, so a client takes https://…/testnet as its API base.
	const under = (/** @type {string} */ path) => (testnet ? [path, `/testnet${path}`] : path);
	app.get(under('/blocks'), (_req, res) => res.json({ blocks: describeBlocks(blocks), currencies: CURRENCIES }));
	app.get(under('/blocks/:chain/check'), async (req, res) => res.json(await checkBlock(req.params.chain, deps)));
	// The security policy, a page of its own: the repository is private, so the public reads it here.
	app.get(SECURITY_PATH, (_req, res) => {
		res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
		res.setHeader('Referrer-Policy', 'no-referrer');
		res.setHeader('Cache-Control', 'public, max-age=3600');
		res.type('html').send(SECURITY_HTML);
	});
	// RFC 9116: where to report a weakness. Expires is always half a year ahead; the policy is GET /security.
	app.get('/.well-known/security.txt', (req, res) => {
		const base = origin(req, publicUrl);
		const expires = new Date((deps.now?.() ?? new Date()).getTime() + 182 * 86_400_000);
		expires.setUTCHours(0, 0, 0, 0);
		res.setHeader('Cache-Control', 'public, max-age=86400');
		res.type('text/plain; charset=utf-8').send(
			[
				`Contact: mailto:${SECURITY_MAIL}`,
				`Expires: ${expires.toISOString().replace('.000Z', 'Z')}`,
				'Preferred-Languages: de, en',
				...(base ? [`Canonical: ${base}/.well-known/security.txt`] : []),
				...(base ? [`Policy: ${base}${SECURITY_PATH}`] : []),
				''
			].join('\n')
		);
	});
	app.get('/health', (_req, res) => res.json({ ok: true, paywall: paywall.info.mode, ...buildFields(build) }));

	// The subscription (#20): checked like a paid request before a price is named; stored only once the
	// payment is settled (the x402 middleware turns an unsettled 200 into a 402 after this handler).
	/** @type {import('express').RequestHandler} */
	const validateSubscription = async (req, res, next) => {
		try {
			if (!subs) throw new RequestError('subscriptions: not offered by this instance; buy each month with POST /eigenbeleg');
			// The plain route sells MONTHS; /subscribe/<months> sells 1 to MONTHS at months × the price.
			const months = req.params.months === undefined ? MONTHS : Number(req.params.months);
			if (!Number.isInteger(months) || months < 1 || months > MONTHS) throw new RequestError(`months: 1 to ${MONTHS} (POST /eigenbeleg/subscribe/<months>)`);
			res.locals.months = months;
			res.locals.subJob = subscriptionJob(await withKeptLogo(req.body), { today: today(), blocks, months });
			next();
		} catch (e) {
			if (e instanceof RequestError) res.status(400).json({ error: e.message });
			else next(e);
		}
	};
	app.post(['/eigenbeleg/subscribe', '/eigenbeleg/subscribe/:months'], express.json({ limit: BODY_WITH_LOGO }), validateSubscription, (req, res, next) => (paywall.middleware ?? ((_r, _s, n) => n()))(req, res, next), (req, res) => {
		const s = newSubscription(res.locals.subJob, { now: deps.now?.() ?? new Date(), origin: origin(req, publicUrl), months: res.locals.months });
		res.on('finish', () => {
			if (res.statusCode >= 400 || !subs) return;
			subs.put(s).catch((e) => log(`${new Date().toISOString()} subscription ${s.id}: not stored: ${String(e?.message ?? e).slice(0, 200)}`));
		});
		if (paywall.info.mode === 'none') res.setHeader('X-Eigenbeleg-Paywall', 'none (development)');
		res.json({
			subscription: s.id,
			months: s.monthsLeft,
			firstMonth: s.nextMonth,
			firstMailFrom: dueDate(s.nextMonth),
			document: s.job.document,
			cancel: cancelUrl(s),
			note: 'The cancel link deletes every detail; the remaining months are not refunded. Keep it: it is in every mail as well.'
		});
	});
	app.get('/eigenbeleg/subscribe/:id/cancel', async (req, res) => {
		const s = subs ? await subs.get(String(req.params.id)) : null;
		if (!s || !tokenMatches(s, req.query.token)) {
			res.status(404).type('text/plain; charset=utf-8').send('Kein solches Abo (oder schon beendet).\nNo such subscription (or already cancelled).\n');
			return;
		}
		await subs?.remove(s.id);
		log(`${new Date().toISOString()} subscription ${s.id}: cancelled`);
		res.type('text/plain; charset=utf-8').send(`Abo ${s.id} beendet. Alle Angaben sind gelöscht.\nSubscription ${s.id} cancelled. Every detail is deleted.\n`);
	});

	/** @type {import('express').RequestHandler} */
	const validate = async (req, res, next) => {
		try {
			res.locals.job = parseRequest(await withKeptLogo(req.body), { blocks });
			if (res.locals.job.email && !mailer) throw new RequestError('email: this instance sends no mail; leave it out and take the files from the response');
			next();
		} catch (e) {
			if (e instanceof RequestError) res.status(400).json({ error: e.message });
			else next(e);
		}
	};
	/** @param {import('express').Response} res @param {unknown} e */
	const failed = (res, e) =>
		res.status(502).json({ error: `could not read the chain or the rates: ${String(/** @type {Error} */ (e)?.message ?? e).slice(0, 200)}` });

	// The free preview: same checks and the same reading as the paid route,
	// but no payer, no files, and a few per minute per IP (it costs the data
	// sources as much as a paid run).
	app.post('/eigenbeleg/preview', express.json({ limit: BODY_WITH_LOGO }), perIp(previewLimit, 'too many previews; try again in a minute'), async (req, res) => {
		let job;
		try {
			job = parseRequest(await withKeptLogo(req.body), { preview: true, blocks });
		} catch (e) {
			if (e instanceof RequestError) res.status(400).json({ error: e.message });
			else res.status(500).json({ error: 'internal error' });
			return;
		}
		try {
			const { summary } = await generate(job, deps, { preview: true });
			// A picture sent with the preview is kept for 24 hours, as the documents will carry it, so
			// the paid request names its id instead of sending it again. One that came by its id stays as it is.
			const sent = req.body?.issuerLogo !== undefined && req.body?.issuerLogo !== null;
			const kept = sent && job.issuerLogo && logos ? await logos.put(issuerLogoImage(job.issuerLogo).bytes) : null;
			res.json({ ...summary, ...(kept ? { issuerLogoId: kept.id, issuerLogoUntil: kept.until } : {}) });
		} catch (e) {
			failed(res, e);
		}
	});

	/** @type {import('express').RequestHandler} */
	const pay = paywall.middleware ?? ((_req, _res, next) => next());

	// PingPay settles inside its middleware, before the route runs. So for a
	// request that carries a payment, the work is done first: a run that fails
	// answers 502 before anything is settled. (The x402 NEAR middleware
	// settles after the route, only on a status below 400.)
	/** @type {import('express').RequestHandler} */
	const workFirst =
		paywall.info.mode === 'ping'
			? async (req, res, next) => {
					if (!req.get('payment-signature') && !req.get('x-payment')) return next();
					try {
						res.locals.out = await generate(res.locals.job, deps);
					} catch (e) {
						failed(res, e);
						return;
					}
					next();
				}
			: (_req, _res, next) => next();

	/** Mails sent by the test route today: at most TESTNET_MAILS_PER_DAY, so it is no free mail relay. */
	const testMails = { day: '', n: 0 };
	/** @param {{ test?: boolean }} [o] test: the test route's answer (TEST- file names, a [TESTNET] mail) */
	const deliver = ({ test = false } = {}) => /** @type {import('express').RequestHandler} */ (async (req, res) => {
		const job = res.locals.job;
		let out = res.locals.out;
		if (!out) {
			try {
				out = await generate(job, deps);
			} catch (e) {
				// A 5xx is not settled: the payer is not charged for a failed run.
				failed(res, e);
				return;
			}
		}
		if (!test && paywall.info.mode === 'none') res.setHeader('X-Eigenbeleg-Paywall', 'none (development)');
		// The mail goes out once the response is settled (the x402 middleware turns an
		// unsettled 200 into a 402 after this handler), so it cannot be awaited here:
		// the answer says `queued`. A failure is logged without the address.
		if (job.email && mailer) {
			const mail = composeMail(job, out, { origin: origin(req, publicUrl), source });
			if (test) mail.subject = `[TESTNET] ${mail.subject}`;
			res.on('finish', () => {
				if (res.statusCode >= 400) return;
				if (test) testMails.n += 1;
				mailer.send(mail).catch((e) => log(`${new Date().toISOString()} mail failed: ${String(e?.message ?? e).slice(0, 200)}`));
			});
			res.setHeader('X-Eigenbeleg-Mail', 'queued');
		}
		// No summary in a header: headers set here would stay on the 402 that a
		// failed settlement sends. The JSON format carries the summary.
		const name = (/** @type {string} */ n) => `${test ? 'TEST-' : ''}${n.replace(/[^A-Za-z0-9._-]/g, '_')}`;
		if (job.format === 'pdf' && job.document === 'eigenbelege') {
			res.setHeader('Content-Disposition', `attachment; filename="${name(out.summary.eigenbelege[0] ?? out.summary.number)}.pdf"`);
			res.type('application/pdf').send(Buffer.from(/** @type {Uint8Array} */ (out.pdf)));
		} else if (job.format === 'pdf') {
			const [st] = out.statements;
			res.setHeader('Content-Disposition', `attachment; filename="${name(st.number)}.pdf"`);
			res.type('application/pdf').send(Buffer.from(st.pdf));
		} else if (job.format === 'csv') {
			res.setHeader('Content-Disposition', `attachment; filename="${name(out.summary.number)}.csv"`);
			res.type('text/csv; charset=utf-8').send(out.csv);
		} else {
			res.json({
				...out.summary,
				...(out.pdf ? { pdf: Buffer.from(out.pdf).toString('base64') } : {}),
				...(out.statements.length ? { kontoauszuegePdf: out.statements.map((s) => ({ account: s.account, number: s.number, pdf: Buffer.from(s.pdf).toString('base64') })) } : {}),
				csv: out.csv,
				...(job.email ? { mail: 'queued' } : {}),
				...(test ? { testnet: TESTNET_WHAT } : {})
			});
		}
	});
	// A payment in a chain's own coin is judged first: 202 while it waits for its block (onchain.js).
	app.post('/eigenbeleg', express.json({ limit: BODY_WITH_LOGO }), validate, paywall.step ?? ((_req, _res, next) => next()), workFirst, pay, deliver());

	// The test route: the same work, for testnet addresses only, paid in testnet USDC on its own
	// paywall. Anything else is refused before the 402, so testnet USDC never buys a mainnet document.
	if (testnet) {
		/** @type {import('express').RequestHandler} */
		const testnetOnly = (req, res, next) => {
			const job = res.locals.job;
			if (testMails.day !== today()) Object.assign(testMails, { day: today(), n: 0 });
			res.setHeader('X-Eigenbeleg-Testnet', 'test only, no value');
			const days = (Date.parse(job.period.to) - Date.parse(job.period.from)) / 86_400_000 + 1;
			const why =
				job.network !== 'testnet'
					? 'network: the test route reads testnet addresses only ("network": "testnet"); mainnet documents are bought at POST /eigenbeleg, or made free in the web UI'
					: !blocks[job.chain]?.networks?.includes('testnet')
						? `chain: ${job.chain} has no testnet here`
						: days > TESTNET_MAX_DAYS
							? `period: at most ${TESTNET_MAX_DAYS} days on the test route`
							: job.email && testMails.n >= testnetMailsPerDay
								? `email: the test route sends at most ${testnetMailsPerDay} mails a day, and today's are out; leave email out`
								: null;
			if (why) res.status(400).json({ error: why });
			else next();
		};
		const testPay = testnet.middleware ?? ((_req, _res, next) => next());
		app.post('/testnet/eigenbeleg', perIp(testnetLimit, 'too many test requests; try again later'), express.json({ limit: BODY_WITH_LOGO }), validate, testnetOnly, testPay, deliver({ test: true }));
	} else app.post('/testnet/eigenbeleg', (_req, res) => res.status(404).json({ error: 'the test route is off on this instance' }));

	app.use((/** @type {any} */ err, /** @type {any} */ _req, /** @type {any} */ res, /** @type {any} */ _next) => {
		const status = err?.type === 'entity.too.large' ? 413 : err?.type === 'entity.parse.failed' ? 400 : err?.status === 404 ? 404 : 500;
		// A 500 is a bug: its message goes to the log (never a request body or an address), not to the caller.
		if (status === 500) log(`${new Date().toISOString()} internal error: ${String(err?.stack ?? err).slice(0, 400)}`);
		res.status(status).json({ error: status === 500 ? 'internal error' : status === 404 ? 'not found' : String(err.message) });
	});
	return app;
}

/**
 * The body of a request that may carry the issuer's logo (the paid route, the test route, the
 * preview and the subscription): a file of at most 512 kB as base64, about 683 kB of text. Every
 * other body stays within 32 kB.
 */
const BODY_WITH_LOGO = '720kb';

/** What the test route sells. */
export const TESTNET_WHAT = 'the same documents for testnet addresses only (network: testnet), every PDF marked TESTNET and every file name TEST-; test only, no value, no booking document';
/** The longest period on the test route. */
export const TESTNET_MAX_DAYS = 31;
/** The test route's mails, all callers together, per day. */
export const TESTNET_MAILS_PER_DAY = 20;

/** @param {{ max: number, windowMs: number }} l @param {number} mails */
const testnetLimits = (l, mails) => `at most ${l.max} requests per ${Math.round(l.windowMs / 60_000)} minutes per IP (402s included), periods up to ${TESTNET_MAX_DAYS} days, at most ${mails} mails a day in all (subject [TESTNET]), no subscription`;

/** @param {{ info: Record<string, unknown> }} t */
const testnetPrice = (t) => /** @type {{ price: string, payTo: string }[]} */ (t.info.accepts ?? []).map((a) => `${a.price} in testnet USDC to ${a.payTo}`).join('; ') || 'see GET /';

/**
 * A few requests per window per IP; then 429 with Retry-After.
 *
 * @param {{ max: number, windowMs: number }} limit
 * @param {string} message
 * @returns {import('express').RequestHandler}
 */
function perIp(limit, message) {
	/** @type {Map<string, { n: number, since: number }>} */
	const seen = new Map();
	return (req, res, next) => {
		const now = Date.now();
		for (const [ip, w] of seen) if (now - w.since > limit.windowMs) seen.delete(ip);
		const key = req.ip ?? '';
		const w = seen.get(key) ?? { n: 0, since: now };
		w.n += 1;
		seen.set(key, w);
		if (w.n > limit.max) {
			res.setHeader('Retry-After', String(Math.ceil((w.since + limit.windowMs - now) / 1000)));
			res.status(429).json({ error: message });
			return;
		}
		next();
	};
}

/**
 * The public origin for absolute URLs in the page: the configured one, or the
 * request's, if its Host is a plain host name (it ends up in an HTML attribute).
 *
 * @param {import('express').Request} req
 * @param {string} [publicUrl]
 */
export function origin(req, publicUrl) {
	const configured = publicUrl?.replace(/\/+$/, '');
	if (configured && /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(configured)) return configured;
	const host = req.get('host') ?? '';
	const proto = req.get('x-forwarded-proto') === 'https' ? 'https' : req.protocol;
	return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host) ? `${proto}://${host}` : '';
}

/** Where `npm run web:build` puts the UI. */
export const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

/**
 * Serves the built UI (a static PWA) at /ui/. The page talks to no route of
 * this API: it reads the chains from the data sources itself. Its
 * Content-Security-Policy comes from the build (dist/csp.txt, made from the
 * pipeline's data sources), plus frame-ancestors, which the page's <meta>
 * cannot carry.
 *
 * The share-card meta tags need absolute URLs: __PUBLIC_URL__ becomes `publicUrl`,
 * or else the request's origin, taken only if the Host is a plain host name.
 *
 * @param {import('express').Express} app
 * @param {string} dir
 * @param {string} [publicUrl]
 */
function mountUi(app, dir, publicUrl) {
	const html = readFileSync(`${dir}/index.html`, 'utf8');
	// Each language under its own address, for search engines and shared links (apps/web/seo.js):
	// ?lang=en is the English markup, ?lang=de the German one with its own canonical.
	const variant = (/** @type {string} */ l) => (existsSync(`${dir}/index.${l}.html`) ? readFileSync(`${dir}/index.${l}.html`, 'utf8') : html);
	const pages = /** @type {Record<string, string>} */ ({ de: variant('de'), en: variant('en') });
	const csp = existsSync(`${dir}/csp.txt`) ? readFileSync(`${dir}/csp.txt`, 'utf8').trim() : "default-src 'self'";
	app.get('/ui', (_req, res) => res.redirect(301, '/ui/'));
	app.get('/ui/', (req, res) => {
		res.setHeader('Content-Security-Policy', `${csp}; frame-ancestors 'none'`);
		res.setHeader('Referrer-Policy', 'no-referrer');
		res.setHeader('Cache-Control', 'no-cache');
		const lang = req.query.lang === 'en' || req.query.lang === 'de' ? req.query.lang : null;
		res.setHeader('Content-Language', lang ?? 'de');
		res.type('html').send((lang ? pages[lang] : html).replaceAll('__PUBLIC_URL__', origin(req, publicUrl)));
	});
	// For crawlers: what may be read, and the page's addresses. Cancel links of subscriptions stay out.
	app.get('/robots.txt', (req, res) => {
		const base = origin(req, publicUrl);
		res.setHeader('Cache-Control', 'public, max-age=3600');
		res.type('text/plain').send(['User-agent: *', 'Allow: /', 'Disallow: /eigenbeleg/', ...(base ? [`Sitemap: ${base}/sitemap.xml`] : []), ''].join('\n'));
	});
	app.get('/sitemap.xml', (req, res) => {
		const base = origin(req, publicUrl);
		if (!base) {
			res.status(404).json({ error: 'not found' });
			return;
		}
		const urls = ['', '?lang=de', '?lang=en'].map((q) => `${base}/ui/${q}`);
		const links = [`<xhtml:link rel="alternate" hreflang="de" href="${urls[1]}"/>`, `<xhtml:link rel="alternate" hreflang="en" href="${urls[2]}"/>`, `<xhtml:link rel="alternate" hreflang="x-default" href="${urls[0]}"/>`].join('');
		res.setHeader('Cache-Control', 'public, max-age=3600');
		res.type('application/xml').send(
			`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map((u) => `<url><loc>${u}</loc>${links}</url>`).join('\n')}\n</urlset>\n`
		);
	});
	// Browsers and crawlers ask for it at the root; the icon is the page's.
	app.get('/favicon.ico', (_req, res) => res.redirect(301, '/ui/icons/icon-192.png'));
	app.use('/ui/assets', express.static(`${dir}/assets`, { index: false, fallthrough: false, immutable: true, maxAge: '1y' }));
	// The service worker, the manifest, icons and share cards: revalidated, so a new version is seen.
	app.get('/ui/index.html', (_req, res) => res.redirect(301, '/ui/'));
	app.use('/ui', express.static(dir, { index: false, fallthrough: false, maxAge: 0 }));
}
