// Checks a POST /eigenbeleg body before anything is paid or fetched.
// What the payer sends (name, postal address) is used for this one response
// and dropped; it is never logged or stored.

import { monthPeriod } from '@eigenbeleg/ledger-core';
import { DEFAULT_KINDS } from '@eigenbeleg/eigenbeleg';
import { BLOCKS } from './blocks.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,39}$/;
const FORMATS = new Set(['pdf', 'csv', 'json']);
const KINDS = new Set(['fee', 'storage', 'transfer', 'call']);
const MAX_DAYS = 92;

export class RequestError extends Error {}

/**
 * @param {any} body
 * @returns {{ chain: string, network: 'mainnet' | 'testnet', addresses: string[], period: { from: string, to: string }, format: 'pdf' | 'csv' | 'json', payer: { name: string, address: string, addresses: string[] }, number: string, includeKinds: string[] }}
 */
export function parseRequest(body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('body must be a JSON object');
	const chain = String(body.chain ?? '');
	const block = BLOCKS[chain];
	if (!block) throw new RequestError(`no building block for chain "${chain}" yet; see GET /blocks`);
	const network = body.network ?? 'mainnet';
	if (!block.networks.includes(network)) throw new RequestError(`network must be one of ${block.networks.join(', ')}`);
	const addresses = body.addresses;
	if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 10) throw new RequestError('addresses: one to ten own addresses');
	for (const a of addresses) if (!block.isAddress(a)) throw new RequestError(`not a ${chain} address: ${String(a).slice(0, 80)}`);

	let period;
	const p = body.period ?? {};
	if (typeof p.month === 'string') {
		try {
			period = monthPeriod(p.month);
		} catch {
			throw new RequestError('period.month must be YYYY-MM');
		}
	} else if (DATE.test(p.from ?? '') && DATE.test(p.to ?? '')) period = { from: p.from, to: p.to };
	else throw new RequestError('period: { month: "YYYY-MM" } or { from, to } as YYYY-MM-DD');
	const days = (Date.parse(period.to) - Date.parse(period.from)) / 86400000 + 1;
	if (!(days >= 1 && days <= MAX_DAYS)) throw new RequestError(`period: 1 to ${MAX_DAYS} days`);
	if (Date.parse(period.from) > Date.now()) throw new RequestError('period lies in the future');

	const format = body.format ?? 'pdf';
	if (!FORMATS.has(format)) throw new RequestError('format: pdf, csv or json (both files)');

	const payer = body.payer ?? {};
	if (typeof payer.name !== 'string' || payer.name.trim().length < 2 || payer.name.length > 200) throw new RequestError('payer.name: 2 to 200 characters');
	if (typeof payer.address !== 'string' || payer.address.trim().length < 5 || payer.address.length > 500) throw new RequestError('payer.address: the postal address, 5 to 500 characters');

	const number = body.number ?? `EB-${period.to.slice(0, 4)}-001`;
	if (!NUMBER.test(String(number))) throw new RequestError('number: up to 40 letters, digits and . _ / -');

	const includeKinds = body.includeKinds ?? DEFAULT_KINDS;
	if (!Array.isArray(includeKinds) || includeKinds.some((k) => !KINDS.has(k))) throw new RequestError(`includeKinds: some of ${[...KINDS].join(', ')}`);

	return {
		chain,
		network,
		addresses: [...new Set(addresses)],
		period,
		format,
		payer: { name: payer.name, address: payer.address, addresses: [...new Set(addresses)] },
		number: String(number),
		includeKinds
	};
}
