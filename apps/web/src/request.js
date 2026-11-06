// SPDX-License-Identifier: AGPL-3.0-or-later
// What the form becomes: the body for POST /eigenbeleg (with the payer), the
// body for the free preview (never with the payer), and the agent CLI command
// for the same request (the payer's data left for the user to fill in).
// Pure functions, so they are tested without a browser.

/**
 * @typedef {object} FormValues
 * @property {string} chain
 * @property {string} network
 * @property {string} addresses one per line (or separated by commas or spaces)
 * @property {'month' | 'range'} periodMode
 * @property {string} month YYYY-MM
 * @property {string} from YYYY-MM-DD
 * @property {string} to YYYY-MM-DD
 * @property {string} name
 * @property {string} postal
 * @property {string} number
 * @property {string[]} includeKinds
 */

/** @param {string} text */
export function splitAddresses(text) {
	return [...new Set(text.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean))];
}

/**
 * The request without the payer: what the preview gets, and the part of the
 * paid request the preview vouches for.
 * @param {FormValues} f
 */
export function previewBody(f) {
	return {
		chain: f.chain,
		network: f.network,
		addresses: splitAddresses(f.addresses),
		period: f.periodMode === 'month' ? { month: f.month } : { from: f.from, to: f.to },
		...(f.number.trim() ? { number: f.number.trim() } : {}),
		includeKinds: [...f.includeKinds]
	};
}

/**
 * The paid request: both files in one response (format json).
 * @param {FormValues} f
 */
export function paidBody(f) {
	return { ...previewBody(f), format: 'json', payer: { name: f.name.trim(), address: f.postal.trim() } };
}

/** A key that changes whenever the previewed part of the request changes. @param {FormValues} f */
export function previewKey(f) {
	return JSON.stringify(previewBody(f));
}

/** POSIX shell single quotes. @param {string} s */
function sh(s) {
	return /^[A-Za-z0-9._\/:=@,-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

/**
 * The same request for the agent CLI, for a user without a browser wallet.
 * Name and postal address are placeholders: they stay out of what the page shows.
 * @param {FormValues} f
 * @param {string} api the API's origin
 */
export function cliCommand(f, api) {
	const b = previewBody(f);
	const parts = ['npm run agent --', '--api', sh(api), '--chain', sh(b.chain), '--network', sh(b.network)];
	for (const a of b.addresses) parts.push('--address', sh(a));
	if ('month' in b.period) parts.push('--month', sh(b.period.month));
	else parts.push('--from', sh(b.period.from), '--to', sh(b.period.to));
	if (b.number) parts.push('--number', sh(b.number));
	parts.push('--include', sh(b.includeKinds.join(',')));
	parts.push('--name', sh('<Name des Zahlers>'), '--postal', sh('<Straße Nr., PLZ Ort>'));
	return parts.join(' ');
}

/** Decodes a base64 JSON header (PAYMENT-REQUIRED, PAYMENT-RESPONSE). @param {string | null} h */
export function decodeHeader(h) {
	if (!h) return null;
	try {
		const bin = atob(h);
		const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
}

/** @param {string} network e.g. near:testnet @param {string} tx */
export function explorerUrl(network, tx) {
	if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(tx)) return null;
	if (network === 'near:testnet') return `https://testnet.nearblocks.io/txns/${tx}`;
	if (network === 'near:mainnet') return `https://nearblocks.io/txns/${tx}`;
	return null;
}

/** USDC atomic units (6 decimals) as German text. @param {string} amount */
export function usdc(amount) {
	const n = BigInt(amount);
	const whole = n / 1_000_000n;
	const frac = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
	return `${whole},${frac} USDC`;
}
