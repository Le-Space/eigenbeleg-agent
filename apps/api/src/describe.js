// SPDX-License-Identifier: AGPL-3.0-or-later
// The paid route, described for machines: the body it takes as a JSON Schema,
// an example, and from them
//   - the discovery hints in every 402 (x402's `bazaar` extension, paywall.js):
//     a client or a crawler that asks the route learns what to send without
//     reading prose;
//   - GET /openapi.json (app.js): the whole API as OpenAPI 3.1.
//
// One description, kept beside the check it describes (packages/pipeline
// src/request.js): describe.test.js sends the example through that check.
//
// A catalogue such as the x402 Bazaar lists a route when a facilitator that
// keeps one settles a payment for it. This API is its own facilitator – no
// third party sees a payment – so these hints do not put it into such a
// catalogue by themselves; they are what any reader of the 402 gets.

import { CURRENCIES } from '@eigenbeleg/pipeline/request';

/** The body of POST /eigenbeleg; `chain` is one of GET /blocks. */
export const REQUEST_SCHEMA = /** @type {const} */ ({
	type: 'object',
	properties: {
		chain: { type: 'string', description: 'The blockchain, one of GET /blocks (near, akash, filecoin, filecoin-pay, aleph; ethereum and base where the instance has them).' },
		network: { type: 'string', enum: ['mainnet', 'testnet'], description: 'Where the payments were made. Default mainnet.' },
		addresses: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, description: 'One to ten own addresses of the payer on that chain.' },
		period: {
			type: 'object',
			description: 'Either { month: "YYYY-MM" } or { from, to } as YYYY-MM-DD; finished days only, at most 92.',
			properties: { month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' }, from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }
		},
		format: { type: 'string', enum: ['pdf', 'csv', 'json'], description: 'pdf (default), csv, or json: every file, PDFs as base64.' },
		document: { type: 'string', enum: ['eigenbelege', 'kontoauszug', 'beide'], description: 'One Eigenbeleg per transaction (default), the Kontoauszug per address, or both (format json only).' },
		payer: {
			type: 'object',
			description: 'Printed on the documents; used for this response only, never stored or logged.',
			properties: { name: { type: 'string', minLength: 2, maxLength: 200 }, address: { type: 'string', minLength: 5, maxLength: 500, description: 'The postal address.' } },
			required: ['name', 'address']
		},
		number: { type: 'string', maxLength: 40, description: 'Optional: the first number of the payer\'s own range, e.g. EB-2026-001.' },
		statementNumber: { type: 'string', maxLength: 40, description: 'Optional: the number of the Kontoauszug.' },
		includeKinds: { type: 'array', items: { type: 'string', enum: ['fee', 'storage', 'transfer', 'call', 'swap'] }, description: 'Optional: the kinds of payment to write receipts for, of those the chain has (GET /blocks).' },
		logo: { type: 'boolean', description: 'Optional: the chain\'s mark, small, beside the title.' },
		reference: { type: 'object', description: 'Only for a chain whose asset has no published rate (doichain: DOI): the payer\'s own euro value per unit, e.g. { "DOI": { "eur": "0.05", "from": "2026-01-01" } }. Printed as the payer\'s reference value, not an exchange rate. Without it: 0.04 EUR per DOI for the whole period, printed as the default (eigenbeleg-agent).' },
		tokens: { type: 'array', maxItems: 50, items: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' }, description: 'Optional, only for ethereum and base: contracts of ERC-20 tokens not in the chain\'s list (GET /blocks) to put on the Kontoauszug although the address only received them. A token the address sent on is on it anyway, in a section of its own named by its contract; one only received (often an airdrop or spam) only when named here. Such a token is valued by its contract (CoinGecko, else its Uniswap pool at the booking\'s block) or not at all; a token calling itself like a listed one (USDC, ETH, …) never.' },
		chart: { type: 'boolean', description: 'Optional, default true: the diagram above a statement\'s bookings (the balance over the period, or the consumption per day). false leaves it out.' },
		issuerLogo: { type: 'string', contentEncoding: 'base64', maxLength: 699052, description: 'Optional: the payer\'s own logo, drawn top right in the head of every Eigenbeleg (a Kontoauszug carries none). A PNG or JPEG file as plain base64 text: at most 512 kB and 2048 pixels a side, at most 6 times as wide as high and twice as high as wide. Never logged; used for this response only, except by a subscription with Eigenbelege, which keeps it encrypted with its other details until its end (one of statements alone keeps none). The preview checks it and draws nothing.' },
		issuerLogoId: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Optional, instead of issuerLogo, where the instance keeps a preview\'s picture: the id POST /eigenbeleg/preview answered with for a picture sent there. Valid for 24 hours; then the picture is deleted.' },
		email: { type: 'string', maxLength: 254, description: 'Optional, where the instance offers mail: the files also to this address, used for that one mail.' },
		currency: { type: 'string', enum: [...CURRENCIES], description: 'Optional, default EUR: the currency of the documents (ISO 4217; GET /blocks lists them as currencies). Another than EUR is the euro rate of the payment\'s day times that currency\'s official rate of the day (ECB euro reference rate, USD too; RUB: Bank of Russia; a reference value in EUR, DOI, times the same leg), both named on every position. The value fields keep their names (eur, totalEur) and hold the value in this currency.' },
		documentLanguage: { type: 'string', enum: ['de', 'en'], description: 'Optional, default de: the language of the documents – German for German bookkeeping, or English (the German document names stay beside the English ones).' },
		language: { type: 'string', enum: ['de', 'en'], description: 'Optional, default en: the language of the mail. The documents\' language is documentLanguage.' }
	},
	required: ['chain', 'addresses', 'period', 'payer']
});

/** A body that passes the check: made-up payer, a public account's addresses. */
export const REQUEST_EXAMPLE = /** @type {const} */ ({
	chain: 'near',
	network: 'mainnet',
	addresses: ['wolkenfabrik.near'],
	period: { month: '2026-10' },
	format: 'json',
	document: 'eigenbelege',
	payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1, 12345 Beispielstadt' }
});

/** What `format: json` answers with, in outline: the numbers given out, the PDF as base64, the CSV as text. */
export const RESPONSE_EXAMPLE = /** @type {const} */ ({
	number: 'EB-2026-001',
	eigenbelege: ['EB-2026-001', 'EB-2026-002'],
	pdf: '<base64 of the PDF/A-2b>',
	csv: 'Belegnummer;…'
});

/**
 * The route's `extensions` for the 402: x402's discovery declaration.
 * `@x402/extensions` comes with `@x402/express`.
 */
export async function discoveryExtensions() {
	const { declareDiscoveryExtension } = await import('@x402/extensions/bazaar');
	return declareDiscoveryExtension({ input: REQUEST_EXAMPLE, inputSchema: REQUEST_SCHEMA, bodyType: 'json', output: { example: RESPONSE_EXAMPLE } });
}

/**
 * The API as OpenAPI 3.1.
 *
 * @param {object} o
 * @param {string} o.base the public origin, '' when unknown
 * @param {Record<string, unknown>} o.payment the paywall's info (GET /)
 * @param {string[]} o.chains what this instance serves
 * @param {string} o.terms where the terms of business are
 * @param {string} o.source the source code
 * @param {boolean} [o.subscriptions]
 * @param {import('./build.js').Build} [o.build] which build this is; its version is the document's
 */
export function openapi({ base, payment, chains, terms, source, subscriptions = false, build = { version: '', commit: '', date: '' } }) {
	const accepts = /** @type {{ network: string, name: string, asset: string, price: string, payTo: string }[]} */ (payment.accepts ?? []);
	const paid = payment.mode === 'x402';
	const coins = /** @type {{ name: string, asset: string, price: string, wait: string }[]} */ (payment.coins ?? []);
	const coined = coins.map((c) => ` Also ${c.price} on ${c.name} (scheme onchain): the answer is 202 until the payment's block, ${c.wait}; see /llms.txt.`).join('');
	const priced = accepts.map((a) => `${a.price} in ${a.asset} on ${a.name} (${a.network})`).join('; ');
	const body = { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Request' }, example: REQUEST_EXAMPLE } } };
	const error = { description: 'The body did not pass the check; nothing was charged.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
	const pay = {
		description: `Payment required (x402 v2, scheme exact): ${priced || 'see GET /'}. The PAYMENT-REQUIRED header carries the requirements as base64 JSON; send the same request again with PAYMENT-SIGNATURE.${coined}`,
		headers: { 'PAYMENT-REQUIRED': { schema: { type: 'string' }, description: 'base64 JSON: x402Version, resource, accepts, extensions' } }
	};
	return {
		openapi: '3.1.0',
		info: {
			title: 'Eigenbeleg API',
			version: build.version || '0.0.0',
			...(build.commit ? { 'x-commit': build.commit, 'x-built': build.date } : {}),
			summary: 'Eigenbelege and Kontoauszüge for the payments of own blockchain addresses, paid per request with x402.',
			description:
				'Eigenbelege (self-issued proofs of payment for German bookkeeping; never invoices) for network fees, storage deposits and transfers of a person\'s own blockchain addresses, as PDF/A-2b and CSV with the EUR rate of each payment\'s day. The paid routes sell to businesses only (§ 14 BGB) under the terms of business. People use the web UI at /ui/ instead, free, in their browser.',
			termsOfService: `${base}${terms}`,
			contact: { name: 'Le Space UG (haftungsbeschränkt)', email: 'eigenbeleg@le-space.de', url: 'https://le-space.de' },
			license: { name: 'AGPL-3.0-or-later', identifier: 'AGPL-3.0-or-later' }
		},
		externalDocs: { description: 'Source and README', url: source },
		...(base ? { servers: [{ url: base }] } : {}),
		paths: {
			'/eigenbeleg/preview': {
				post: {
					operationId: 'preview',
					summary: 'Free: counts and totals for the same body without `payer`; no files. Check here first.',
					requestBody: body,
					responses: { 200: { description: 'What the paid request would deliver, in numbers.', content: { 'application/json': { schema: { type: 'object' } } } }, 400: error }
				}
			},
			'/eigenbeleg': {
				post: {
					operationId: 'eigenbeleg',
					summary: 'The documents for the period, paid per request.',
					...(paid ? { 'x-payment-info': { protocol: 'x402', version: 2, scheme: 'exact', accepts: accepts.map((a) => ({ network: a.network, asset: a.asset, price: a.price, payTo: a.payTo })) } } : {}),
					requestBody: body,
					responses: {
						200: {
							description: 'The files. PAYMENT-RESPONSE names the settled transaction.',
							content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } }, 'text/csv': { schema: { type: 'string' } }, 'application/json': { schema: { type: 'object' }, example: RESPONSE_EXAMPLE } }
						},
						400: error,
						...(paid ? { 402: pay } : {})
					}
				}
			},
			...(subscriptions
				? {
						'/eigenbeleg/subscribe': {
							post: {
								operationId: 'subscribe',
								summary: 'A subscription: monthly Kontoauszüge by mail, paid once. The same body with `email` and without `period`.',
								requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
								responses: { 200: { description: 'The subscription and its cancel link.', content: { 'application/json': { schema: { type: 'object' } } } }, 400: error, ...(paid ? { 402: pay } : {}) }
							}
						}
					}
				: {}),
			'/blocks': { get: { operationId: 'blocks', summary: 'The chains this instance serves, with their networks, assets and kinds, and the currencies a document can be in.', responses: { 200: { description: 'The building blocks.', content: { 'application/json': { schema: { type: 'object' } } } } } } },
			'/llms.txt': { get: { operationId: 'llms', summary: 'The same, as plain text for agents.', responses: { 200: { description: 'Plain text.', content: { 'text/plain': { schema: { type: 'string' } } } } } } }
		},
		components: {
			schemas: {
				Request: { ...REQUEST_SCHEMA, properties: { ...REQUEST_SCHEMA.properties, chain: { ...REQUEST_SCHEMA.properties.chain, enum: chains } } },
				Error: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] }
			}
		}
	};
}
