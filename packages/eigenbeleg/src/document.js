// What an Eigenbeleg says, before it is drawn (pdf.js) or written (csv.js).
//
// An Eigenbeleg is a receipt the payer writes for a payment that has no
// receipt from the other side. It is never an invoice, and never one written
// for somebody else: the payer issues it, for their own payments.
//
// For a blockchain, the clean case is the network fee: it goes to a
// peer-to-peer network that has no organisation to issue an invoice. A
// storage deposit to a protocol contract is the same. A transfer to another
// account may well be to a company that does invoice; it goes on the
// Eigenbeleg only when the payer says so (`includeKinds`), and is always in
// the CSV.
//
// One Eigenbeleg covers one period (a month, say) of one chain, as a
// collective receipt (Sammel-Eigenbeleg) with numbered positions; its number
// comes from the payer's own range, since this service stores nothing.

import { normalize, round, sum } from '@eigenbeleg/ledger-core';

/* The document is German: it is for German bookkeeping. */

export const NOTE =
	'Eigenbeleg. Für diese Zahlung gibt es keinen Fremdbeleg: Empfänger ist ein Peer-to-Peer-Netzwerk ohne rechnungsstellende Organisation. ' +
	'Ausgestellt vom Zahlenden auf Grundlage der öffentlichen Transaktion; jede Position ist über ihren Transaktions-Hash in einem öffentlichen Block-Explorer nachprüfbar.';

export const NOT_AN_INVOICE = 'Dies ist keine Rechnung und kein Beleg eines Dritten. Le Space stellt keine Rechnungen für andere aus.';

/** Kinds that go on the Eigenbeleg unless the payer chooses otherwise. */
export const DEFAULT_KINDS = ['fee', 'storage'];

export const KIND_TEXT = {
	fee: 'Netzwerkgebühr (Gas)',
	storage: 'Speicherhinterlegung (Storage Deposit)',
	transfer: 'Überweisung',
	call: 'Zahlung an Contract',
	stake: 'Staking (keine Zahlung)',
	unstake: 'Unstaking',
	reward: 'Staking-Ertrag',
	swap: 'Tausch',
	escrow: 'Hinterlegung für ein Deployment (Escrow)'
};

export const CHAIN_NAMES = { near: 'NEAR Protocol', akash: 'Akash' };

/**
 * @typedef {object} Payer who pays and issues the Eigenbeleg
 * @property {string} name
 * @property {string} address postal address, lines separated by \n
 * @property {string[]} addresses own payment addresses on the chain
 */

/**
 * @typedef {object} Position
 * @property {number} pos
 * @property {import('@eigenbeleg/rates').ValuedEntry} entry
 * @property {string} what
 * @property {string} recipient
 */

/**
 * @param {object} p
 * @param {Payer} p.payer
 * @param {string} p.chain
 * @param {string} p.network
 * @param {{ from: string, to: string }} p.period
 * @param {import('@eigenbeleg/rates').ValuedEntry[]} p.entries every entry of the period, all own addresses
 * @param {string} [p.number] the Eigenbeleg's number in the payer's range, e.g. EB-2026-007
 * @param {string[]} [p.includeKinds]
 * @param {string} [p.issuedAt] ISO; now when not given
 */
export function buildDocument({ payer, chain, network, period, entries, number, includeKinds = DEFAULT_KINDS, issuedAt }) {
	checkPayer(payer);
	const kinds = new Set(includeKinds);
	const own = new Set(payer.addresses);
	/** @type {Position[]} */
	const positions = [];
	/** @type {{ entry: import('@eigenbeleg/rates').ValuedEntry, why: string }[]} */
	const excluded = [];
	for (const e of entries) {
		const why =
			e.type === 'received'
				? 'Eingang, keine Zahlung'
				: !e.success
					? 'fehlgeschlagen, nichts gezahlt'
					: own.has(e.counterparty)
						? 'Umbuchung zwischen eigenen Adressen'
						: !kinds.has(e.kind)
							? e.kind === 'transfer' || e.kind === 'call'
								? 'Zahlung an ein Konto: Fremdbeleg anfordern oder bewusst einbeziehen'
								: e.kind === 'escrow'
									? 'Hinterlegung (Escrow), noch kein Endbetrag'
									: 'keine Zahlung an das Netzwerk'
							: !e.eur
								? 'kein verlässlicher Kurs (unbekannter Token)'
								: '';
		if (why) excluded.push({ entry: e, why });
		else
			positions.push({
				pos: positions.length + 1,
				entry: e,
				what: KIND_TEXT[/** @type {keyof typeof KIND_TEXT} */ (e.kind)] ?? e.kind,
				recipient: e.counterpartyLabel || e.counterparty
			});
	}
	/** @type {Record<string, string>} */
	const quantities = {};
	for (const asset of new Set(positions.map((p) => p.entry.asset)))
		quantities[asset] = normalize(sum(positions.filter((p) => p.entry.asset === asset).map((p) => p.entry.amount)).replace(/^-/, ''));
	const eurExact = positions.length ? sum(positions.map((p) => /** @type {any} */ (p.entry.eur).value)) : '0';
	const year = period.to.slice(0, 4);
	return {
		number: number || `EB-${year}-001`,
		issuedAt: issuedAt ?? new Date().toISOString(),
		payer: { name: payer.name.trim(), address: payer.address.trim(), addresses: [...payer.addresses] },
		chain,
		chainName: CHAIN_NAMES[/** @type {keyof typeof CHAIN_NAMES} */ (chain)] ?? chain,
		network,
		testnet: network !== 'mainnet',
		period,
		positions,
		excluded,
		totals: {
			quantities,
			// What was paid, as a positive amount, rounded to cents.
			eur: round(eurExact.replace(/^-/, ''), 2),
			eurExact: eurExact.replace(/^-/, '')
		},
		sources: [...new Set(positions.map((p) => /** @type {any} */ (p.entry.eur).source.replace(/ \d{4}-\d{2}-\d{2}.*$/, '')))],
		note: NOTE,
		notInvoice: NOT_AN_INVOICE
	};
}

/** @typedef {ReturnType<typeof buildDocument>} EigenbelegDocument */

/** @param {Payer} payer */
function checkPayer(payer) {
	if (!payer || typeof payer !== 'object') throw new Error('payer is required');
	if (typeof payer.name !== 'string' || payer.name.trim().length < 2 || payer.name.length > 200) throw new Error('payer.name is required');
	if (typeof payer.address !== 'string' || payer.address.trim().length < 5 || payer.address.length > 500) throw new Error('payer.address (postal) is required');
	if (!Array.isArray(payer.addresses) || payer.addresses.length === 0 || payer.addresses.length > 20) throw new Error('payer.addresses: one to twenty own addresses');
}

// ---- German formats ---------------------------------------------------------

/** `-1234.5` → `-1.234,5`; keeps every decimal. @param {string} amount */
export function deNumber(amount) {
	const s = normalize(String(amount));
	const neg = s.startsWith('-');
	const [int, frac] = s.replace(/^-/, '').split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${neg ? '−' : ''}${grouped}${frac ? ',' + frac : ''}`;
}

/** A euro amount with fixed decimals: `0.0017` → `0,0017 €`. @param {string} amount @param {number} places */
export function deEuro(amount, places = 2) {
	const r = round(String(amount), places);
	const [int, frac = ''] = r.replace(/^-/, '').split('.');
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${r.startsWith('-') ? '−' : ''}${grouped},${frac.padEnd(places, '0')} €`;
}

/** `2026-10-05` → `05.10.2026`. @param {string} date */
export function deDate(date) {
	const [y, m, d] = date.slice(0, 10).split('-');
	return `${d}.${m}.${y}`;
}
