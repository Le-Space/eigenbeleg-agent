// Saves the raw NearBlocks rows of a public account as a test fixture:
//   node scripts/capture-near-fixture.js <account> <network> <from> <to> <out.json> [maxPages]
// Only for accounts whose history holds no personal data (a protocol's relayer,
// our own demo accounts): fixtures are public.
import { writeFile } from 'node:fs/promises';
import { fetchRaw } from '@eigenbeleg/chain-near';

const [account, network, from, to, out, maxPages = '2'] = process.argv.slice(2);
let raw;
try {
	raw = await fetchRaw({ account, network, from, to, maxPages: Number(maxPages), partial: true });
} catch (e) {
	console.error(String(e));
	process.exit(1);
}
// Icons are data URLs of kilobytes; a fixture does not need them.
for (const f of raw.ftTxns) if (f.meta) delete f.meta.icon;
await writeFile(out, JSON.stringify(raw, null, '\t') + '\n');
console.log(`${raw.txns.length} txns, ${raw.ftTxns.length} ft-txns → ${out}`);
