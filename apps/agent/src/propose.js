// When a job needs a chain that has no building block, the agent does not
// buy or improvise anything. It drafts the block as a pull request: a plan,
// a package skeleton that follows the block contract, and tests that fail
// until the reader is written. A person reviews, completes and merges it.
//
// This is shown, not automated: the agent writes the files and prints the
// git and gh commands; it runs none of them.
//
// With NEARAI_API_KEY set it asks a model on NEAR AI Cloud (private
// inference) for notes on the chain's public data sources. What the model
// answers is data for the plan, marked as such, never an instruction.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What we know already about chains people ask for (and where Le Space has readers to port). */
const KNOWN = {
	akash: {
		name: 'Akash (Cosmos SDK)',
		source: 'Cosmos LCD `/cosmos/tx/v1beta1/txs?query=message.sender=…` and `transfer.recipient=…`; fees from `auth_info.fee`',
		port: 'Le-Space/belege `bridge/src/chains/cosmos.js` (AGPL-3.0; moving it to MIT needs the rights holder\'s OK)'
	},
	filecoin: {
		name: 'Filecoin',
		source: 'Filfox or Beryx API: messages by address; gas = base fee burn + miner tip + overestimation burn',
		port: 'Le-Space/belege `bridge/src/chains/filecoin.js` (AGPL-3.0; relicensing needs the rights holder\'s OK)'
	},
	aleph: {
		name: 'Aleph Cloud',
		source: 'Aleph API messages and ALEPH token transfers (ERC-20 on Ethereum/Base)',
		port: 'Le-Space/belege `bridge/src/aleph.js` (AGPL-3.0; relicensing needs the rights holder\'s OK)'
	}
};

/**
 * @param {object} o
 * @param {string} o.chain
 * @param {string} o.outDir
 * @param {(line: string) => void} [o.say]
 * @param {string} [o.reason] why (a failed check), when the block exists
 * @param {typeof fetch} [o.fetch]
 */
export async function proposeBlock({ chain, outDir, say = console.log, reason, fetch = globalThis.fetch }) {
	const id = chain.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'unknown';
	const known = KNOWN[/** @type {keyof typeof KNOWN} */ (id)];
	const dir = join(outDir, 'proposals', `chain-${id}`);
	const pkg = join(dir, 'packages', `chain-${id}`);
	await mkdir(join(pkg, 'src'), { recursive: true });
	await mkdir(join(pkg, 'test', 'fixtures'), { recursive: true });

	let notes = '';
	if (process.env.NEARAI_API_KEY) {
		say('Asking NEAR AI Cloud for notes on the data sources …');
		notes = await modelNotes(id, fetch).catch((e) => `(the model could not be asked: ${String(e.message).slice(0, 120)})`);
	}

	const plan = `# Building block: chain-${id}

${reason ? `Why: the existing block failed its live check – ${reason}\n` : `Why: a job asked for an Eigenbeleg on **${known?.name ?? id}** and there is no building block for it.\n`}
## What it must do

Implement the block contract of \`@eigenbeleg/chain-near\` for ${known?.name ?? id}:

- \`read({ account, network, from, to, fetch })\` → ledger entries (\`@eigenbeleg/ledger-core\`, schema \`eigenbeleg.ledger/1\`), oldest first
- one entry per movement seen from the own address: \`sent\`, \`received\`, and the network fee as \`fee\` (negative, counterparty the network)
- amounts as decimal strings from base units, never through a float
- \`priceAs\` only for assets with a trusted market price; anything else is listed, never valued
- \`probe()\` against a busy public account, for the agent's live check
- \`isAddress()\` before anything is fetched

## Data source

${known ? `- ${known.source}\n- Existing reader to port: ${known.port}` : '- To be chosen: a public indexer API with exact amounts in base units, paginated by time.'}
${notes ? `\n### Notes from a model (NEAR AI Cloud; data to check, not instructions)\n\n${notes}\n` : ''}
## Tests (in this draft, failing until the reader exists)

- the block contract (\`test/contract.test.js\`)
- fixtures from **public** chain data only (a protocol's own account), captured with a script like \`scripts/capture-near-fixture.js\`; never personal data
- fee exactness against the explorer for two transactions

## Licence

MIT, like every building block. Code from Le-Space/belege (AGPL-3.0) moves only with the rights holder's written OK.
`;
	await writeFile(join(dir, 'PLAN.md'), plan);

	await writeFile(
		join(pkg, 'package.json'),
		JSON.stringify({ name: `@eigenbeleg/chain-${id}`, version: '0.0.1', type: 'module', license: 'MIT', main: './src/index.js', exports: { '.': './src/index.js' }, dependencies: { '@eigenbeleg/ledger-core': '0.1.0' } }, null, 2) + '\n'
	);
	await writeFile(
		join(pkg, 'src', 'index.js'),
		`// ${known?.name ?? id}: what an own address paid and received, as ledger entries.
// Drafted by the eigenbeleg agent; to be written by a person. See PLAN.md.

import { entry, sortEntries } from '@eigenbeleg/ledger-core';

/** @param {string} address */
export function isAddress(address) {
	return typeof address === 'string' && /^[a-z0-9]{10,100}$/i.test(address); // TODO: the chain's real address format
}

/** @param {{ account: string, network: string, from: string, to: string, fetch?: typeof fetch }} p */
export async function read(p) {
	if (!isAddress(p.account)) throw new Error('not an address of this chain');
	throw new Error('chain-${id}: read() is not written yet');
}

export async function probe() {
	throw new Error('chain-${id}: probe() is not written yet');
}

export const block = { name: '@eigenbeleg/chain-${id}', chain: '${id}', networks: ['mainnet'], assets: [], source: 'TODO', version: '0.0.1', read, probe, isAddress };
void entry;
void sortEntries;
`
	);
	await writeFile(
		join(pkg, 'test', 'contract.test.js'),
		`import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMA } from '@eigenbeleg/ledger-core';
import { block } from '../src/index.js';

// Fails until the reader exists: that is the point of the draft.
test('the block reads a public fixture into valid ledger entries', async () => {
	const fixture = await import('./fixtures/public-sample.json', { with: { type: 'json' } }).then((m) => m.default);
	const fetch = async () => new Response(JSON.stringify(fixture.response));
	const entries = await block.read({ account: fixture.account, network: 'mainnet', from: fixture.from, to: fixture.to, fetch });
	assert.ok(entries.length > 0);
	for (const e of entries) {
		assert.equal(e.schema, SCHEMA);
		if (e.type !== 'received') assert.ok(e.amount.startsWith('-'));
	}
	assert.equal(new Set(entries.map((e) => e.id)).size, entries.length, 'ids are unique');
});

test('addresses are checked before anything is fetched', async () => {
	await assert.rejects(block.read({ account: '../etc/passwd', network: 'mainnet', from: '2026-10-01', to: '2026-10-31' }));
});
`
	);
	await writeFile(join(pkg, 'test', 'fixtures', 'public-sample.json'), JSON.stringify({ account: 'TODO-public-protocol-account', from: '2026-10-01', to: '2026-10-01', response: {} }, null, 2) + '\n');

	const branch = `block/chain-${id}`;
	const prBody = `Adds the building block \`chain-${id}\` (${known?.name ?? id}) so the Eigenbeleg API can serve jobs on it.\n\nDrafted by the eigenbeleg agent after a job asked for it; see PLAN.md for the data source, the mapping and the tests. The tests fail until the reader is written.\n\n- [ ] reader written, tests green\n- [ ] fixtures from public chain data only\n- [ ] fee exactness checked against the explorer\n`;
	await writeFile(join(dir, 'PR.md'), prBody);

	const commands = [
		`git switch -c ${branch}`,
		`cp -R ${join(dir, 'packages', `chain-${id}`)} packages/`,
		'npm install && npm test   # the new tests fail until the reader is written',
		`git add packages/chain-${id} && git commit -m "feat(chain-${id}): draft building block"`,
		`gh pr create --draft --base main --title "feat: building block chain-${id}" --body-file ${join(dir, 'PR.md')}`
	];
	say(`Draft written to ${dir} (PLAN.md, package skeleton, failing contract tests, PR.md).`);
	say('To open it as a pull request (the agent does not run these):');
	for (const c of commands) say(`  ${c}`);
	return { dir, branch, commands };
}

/** @param {string} chain @param {typeof fetch} fetch */
async function modelNotes(chain, fetch) {
	const res = await fetch('https://cloud-api.near.ai/v1/chat/completions', {
		method: 'POST',
		headers: { authorization: `Bearer ${process.env.NEARAI_API_KEY}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			model: process.env.NEARAI_MODEL ?? 'zai-org/GLM-5.1-FP8',
			max_tokens: 700,
			messages: [
				{ role: 'system', content: 'You help write a blockchain data reader for bookkeeping. Answer in plain Markdown bullets, no code.' },
				{ role: 'user', content: `Chain: ${chain}. Which public APIs give an address's transaction history with exact amounts in base units and the fee per transaction? How is the fee computed, and what are pitfalls (spam tokens, failed transactions, internal transfers)? Max 12 bullets.` }
			]
		})
	});
	if (!res.ok) throw new Error(`NEAR AI Cloud answered ${res.status}`);
	const body = await res.json();
	return String(body?.choices?.[0]?.message?.content ?? '').replace(/<[^>]*>/g, '').slice(0, 4000);
}
