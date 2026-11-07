// SPDX-License-Identifier: AGPL-3.0-or-later
// One full run of the pipeline on a recorded NEAR day, with fixed rates and a
// fixed clock: the same input in Node and in a browser. Returns the SHA-256 of
// every file, so the two sides can be compared without moving the bytes.

import { sha256 } from '@noble/hashes/sha2.js';
import { toHex, utf8 } from '@le-space/ledger';
import { fixedRates } from '@eigenbeleg/eigenbeleg';

import { generate, parseRequest } from '../src/index.js';
import { recordedNear } from '../../../apps/agent/src/recorded.js';

const NOW = Date.parse('2026-11-06T12:00:00Z');

/** @param {any} raw the recorded NearBlocks day (test/fixtures) */
export async function fixtureRun(raw) {
	const req = parseRequest(
		{
			chain: 'near',
			network: 'mainnet',
			addresses: ['relay.aurora'],
			period: { from: '2026-11-01', to: '2026-11-01' },
			format: 'json',
			document: 'beide',
			number: 'EB-2026-042',
			logo: true,
			// Made-up payer, as everywhere in this repository; in the web UI it never leaves the page.
			payer: { name: 'Wolkenfabrik Hosting GmbH', address: 'Musterstraße 1\n12345 Beispielstadt' }
		},
		{ today: '2026-11-06' }
	);
	const out = await generate(req, { fetch: recordedNear(raw, { now: NOW }), rates: fixedRates({ NEAR: '2.5' }), now: () => new Date(NOW) });
	const hash = (/** @type {Uint8Array} */ b) => toHex(sha256(b));
	return {
		summary: out.summary,
		pdf: out.pdf ? hash(out.pdf) : null,
		statements: out.statements.map((s) => ({ number: s.number, pdf: hash(s.pdf) })),
		csv: out.csv ? hash(utf8(out.csv)) : null
	};
}
