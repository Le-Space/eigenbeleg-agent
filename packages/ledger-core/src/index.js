// The neutral booking format every chain reader produces and every output
// (Eigenbeleg PDF, CSV, later DATEV) reads. One entry is one movement of
// value seen from one own address: a payment sent, a payment received, or a
// network fee. A transaction that moves several things gives several entries
// with the same hash.
//
// Versioned: `schema` names the version; a reader that changes the meaning
// of a field bumps it.
//
// Amounts are decimal strings, never floats: a NEAR amount has 24 decimals,
// more than a JavaScript number keeps.

export const SCHEMA = 'eigenbeleg.ledger/1';

/** @typedef {'sent' | 'received' | 'fee'} EntryType */
/** @typedef {'transfer' | 'fee' | 'call' | 'stake' | 'unstake' | 'reward' | 'swap' | 'storage' | 'escrow'} EntryKind */

/**
 * @typedef {object} LedgerEntry
 * @property {string} schema SCHEMA
 * @property {string} id stable across reads: `<chain>:<account>:<hash>:<part>`
 * @property {string} chain e.g. `near`
 * @property {string} network e.g. `mainnet`, `testnet`
 * @property {string} account the own address this entry is seen from
 * @property {string} hash the transaction hash, in full
 * @property {number} height block height
 * @property {string} time ISO 8601, UTC
 * @property {string} date YYYY-MM-DD, UTC
 * @property {EntryType} type
 * @property {EntryKind} kind
 * @property {string} asset symbol, e.g. `NEAR`, `USDC`
 * @property {string} contract `native`, or the token's contract
 * @property {number} decimals
 * @property {string} amount signed decimal: negative for sent and fee
 * @property {string} counterparty the other address; for a fee the network
 * @property {string} counterpartyLabel a known name for it, or ''
 * @property {string} method the contract method called, or ''
 * @property {string} memo
 * @property {boolean} success
 * @property {string} explorerUrl
 * @property {string} priceAs the market asset that values it (`NEAR`, `USDC`, …), '' for a token
 *   without a trusted price (an unknown token, often spam): such an entry is listed, never valued
 */

const TYPES = new Set(['sent', 'received', 'fee']);
const KINDS = new Set(['transfer', 'fee', 'call', 'stake', 'unstake', 'reward', 'swap', 'storage', 'escrow']);
const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * A checked entry; throws on a field that breaks the format.
 *
 * @param {Omit<LedgerEntry, 'schema' | 'date' | 'priceAs'> & { date?: string, priceAs?: string }} fields
 * @returns {LedgerEntry}
 */
export function entry(fields) {
	const time = new Date(fields.time);
	if (Number.isNaN(time.getTime())) throw new Error(`entry ${fields.id}: bad time`);
	const e = {
		schema: SCHEMA,
		id: String(fields.id),
		chain: String(fields.chain),
		network: String(fields.network),
		account: String(fields.account),
		hash: String(fields.hash),
		height: Number(fields.height),
		time: time.toISOString(),
		date: time.toISOString().slice(0, 10),
		type: fields.type,
		kind: fields.kind,
		asset: String(fields.asset),
		contract: String(fields.contract || 'native'),
		decimals: Number(fields.decimals),
		amount: normalize(String(fields.amount)),
		counterparty: String(fields.counterparty ?? ''),
		counterpartyLabel: String(fields.counterpartyLabel ?? ''),
		method: String(fields.method ?? ''),
		memo: String(fields.memo ?? ''),
		success: fields.success !== false,
		explorerUrl: String(fields.explorerUrl ?? ''),
		priceAs: String(fields.priceAs ?? '')
	};
	if (!TYPES.has(e.type)) throw new Error(`entry ${e.id}: bad type ${e.type}`);
	if (!KINDS.has(e.kind)) throw new Error(`entry ${e.id}: bad kind ${e.kind}`);
	if (!Number.isInteger(e.decimals) || e.decimals < 0) throw new Error(`entry ${e.id}: bad decimals`);
	if (!DECIMAL.test(e.amount)) throw new Error(`entry ${e.id}: bad amount ${e.amount}`);
	if ((e.type === 'sent' || e.type === 'fee') && !e.amount.startsWith('-') && e.amount !== '0')
		throw new Error(`entry ${e.id}: ${e.type} must be negative`);
	if (e.type === 'received' && e.amount.startsWith('-'))
		throw new Error(`entry ${e.id}: received must be positive`);
	return e;
}

/** Oldest first; within a transaction the fee last. @param {LedgerEntry[]} entries */
export function sortEntries(entries) {
	return [...entries].sort(
		(a, b) =>
			a.time.localeCompare(b.time) ||
			a.hash.localeCompare(b.hash) ||
			Number(a.type === 'fee') - Number(b.type === 'fee') ||
			a.id.localeCompare(b.id)
	);
}

/** The entries of one period, both ends included. @param {LedgerEntry[]} entries @param {string} from YYYY-MM-DD @param {string} to YYYY-MM-DD */
export function inPeriod(entries, from, to) {
	return entries.filter((e) => e.date >= from && e.date <= to);
}

/** `2026-10` → { from: '2026-10-01', to: '2026-10-31' }. @param {string} month YYYY-MM */
export function monthPeriod(month) {
	const m = /^(\d{4})-(\d{2})$/.exec(month);
	if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`bad month ${month}`);
	const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
	return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ---- decimals ---------------------------------------------------------------

/** `1.50` → `1.5`, `-0` → `0`. @param {string} s */
export function normalize(s) {
	if (!DECIMAL.test(s)) return s;
	let [int, frac = ''] = s.replace(/^-/, '').split('.');
	int = int.replace(/^0+(?=\d)/, '');
	frac = frac.replace(/0+$/, '');
	const out = frac ? `${int}.${frac}` : int;
	return s.startsWith('-') && out !== '0' ? `-${out}` : out;
}

/** Base units → decimal string: (1500000n, 6) → `1.5`. @param {bigint | string} units @param {number} decimals */
export function fromUnits(units, decimals) {
	const v = BigInt(units);
	const neg = v < 0n;
	const abs = (neg ? -v : v).toString().padStart(decimals + 1, '0');
	const int = abs.slice(0, abs.length - decimals);
	const frac = decimals ? abs.slice(abs.length - decimals) : '';
	return normalize(`${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`);
}

/** Decimal string → base units: ('1.5', 6) → 1500000n; extra digits are cut. @param {string} amount @param {number} decimals */
export function toUnits(amount, decimals) {
	const s = String(amount).trim();
	if (!DECIMAL.test(s)) throw new Error(`bad decimal ${amount}`);
	const neg = s.startsWith('-');
	const [int, frac = ''] = s.replace(/^-/, '').split('.');
	const v = BigInt(int + frac.padEnd(decimals, '0').slice(0, decimals));
	return neg ? -v : v;
}

/** Sum of decimal strings. @param {string[]} amounts */
export function sum(amounts) {
	const d = Math.max(0, ...amounts.map((a) => (String(a).split('.')[1] ?? '').length));
	return fromUnits(
		amounts.reduce((acc, a) => acc + toUnits(a, d), 0n),
		d
	);
}

/**
 * amount × rate, rounded half away from zero to `places` decimals.
 *
 * @param {string} amount decimal
 * @param {string} rate decimal
 * @param {number} [places]
 */
export function multiply(amount, rate, places = 2) {
	const da = (amount.split('.')[1] ?? '').length;
	const dr = (rate.split('.')[1] ?? '').length;
	const product = toUnits(amount, da) * toUnits(rate, dr); // scale da + dr
	const scale = da + dr;
	if (scale <= places) return fromUnits(product * 10n ** BigInt(places - scale), places);
	const div = 10n ** BigInt(scale - places);
	const neg = product < 0n;
	const abs = neg ? -product : product;
	let q = abs / div;
	if ((abs % div) * 2n >= div) q += 1n;
	return fromUnits(neg ? -q : q, places);
}

/** Round a decimal half away from zero. @param {string} amount @param {number} places */
export function round(amount, places) {
	return multiply(amount, '1', places);
}
