// SPDX-License-Identifier: AGPL-3.0-or-later
// Why a movement is not on an Eigenbeleg, in the words of #116: an Eigenbeleg
// only where value was consumed and nobody invoices. Network fees are like a
// bank's fees and staking rewards like interest: the account statement
// (Kontoauszug) documents them; swaps and refundable deposits are no expense.
//
// @le-space/eigenbeleg (buildDocument) still says "keine Zahlung an das
// Netzwerk" for a fee left out, from the time fees were on the Eigenbeleg by
// default. Until the package says it itself, the reasons of the kinds the
// statement documents are put in here, in the CSV and in the movements an
// Eigenbeleg lists beside its positions.

/** @typedef {'de' | 'en'} Language */

/** @type {Record<string, { de: string, en: string }>} */
const BY_STATEMENT = {
	fee: { de: 'Netzwerkgebühr – belegt durch den Kontoauszug', en: 'network fee – documented by the account statement' },
	storage: {
		de: 'Speicherhinterlegung (erstattbar) – belegt durch den Kontoauszug',
		en: 'storage deposit (refundable) – documented by the account statement'
	},
	swap: { de: 'Tausch – belegt durch den Kontoauszug', en: 'swap – documented by the account statement' },
	escrow: {
		de: 'Hinterlegung (Escrow, Vorauszahlung) – belegt durch den Kontoauszug',
		en: 'deposit (escrow, prepayment) – documented by the account statement'
	},
	stake: { de: 'Staking, keine Ausgabe – belegt durch den Kontoauszug', en: 'staking, no expense – documented by the account statement' },
	unstake: { de: 'Unstaking, keine Ausgabe – belegt durch den Kontoauszug', en: 'unstaking, no expense – documented by the account statement' },
	reward: {
		de: 'Staking-Ertrag (wie Zinsen) – belegt durch den Kontoauszug',
		en: 'staking reward (like interest) – documented by the account statement'
	}
};

/** A reward on a chain that is mined (a coinbase): mining, not staking. */
const MINING_REWARD = {
	de: 'Mining-Ertrag (wie Zinsen) – belegt durch den Kontoauszug',
	en: 'mining reward (like interest) – documented by the account statement'
};
const MINED = new Set(['doichain', 'bitcoin']);

/** Aleph's swap is a purchase of credits: a prepayment, consumed later. */
const CREDIT_PURCHASE = {
	de: 'Kauf von Credits (Vorauszahlung) – belegt durch den Kontoauszug, der Verbrauch durch den Verbrauchsauszug',
	en: 'purchase of credits (prepayment) – documented by the account statement, the usage by the usage statement'
};

/**
 * The reason for a movement the statement documents, or null where the package's own reason stands
 * (incoming payments other than rewards, failed ones, own transfers, payments to an account, usage, no rate).
 *
 * @param {import('@le-space/eigenbeleg').ValuedEntry} e
 * @param {{ chain: string, own: Set<string>, kinds: Set<string>, language: Language }} c
 */
export function statementReason(e, { chain, own, kinds, language }) {
	if (kinds.has(e.kind)) return null;
	// A reward comes in; any other incoming payment keeps "Eingang, keine Zahlung".
	if (e.type === 'received') return e.kind === 'reward' ? (MINED.has(chain) ? MINING_REWARD : BY_STATEMENT.reward)[language] : null;
	if (!e.success || own.has(e.counterparty)) return null;
	if (e.kind === 'swap' && chain === 'aleph') return CREDIT_PURCHASE[language];
	return BY_STATEMENT[e.kind]?.[language] ?? null;
}

/**
 * Puts the reasons of the kinds the statement documents into a built document: its `excluded` (the
 * CSV's lines not on an Eigenbeleg) and the movements beside an Eigenbeleg's positions. Changes the
 * document in place and returns it.
 *
 * @template {{ chain: string, language?: string, payer: { addresses: string[] }, excluded: { entry: any, why: string }[], transactions: { movements: { entry: any, onIt: boolean, why: string }[] }[] }} D
 * @param {D} doc
 * @param {string[]} includeKinds
 * @returns {D}
 */
export function withStatementReasons(doc, includeKinds) {
	const c = { chain: doc.chain, own: new Set(doc.payer.addresses), kinds: new Set(includeKinds), language: /** @type {Language} */ (doc.language === 'en' ? 'en' : 'de') };
	/** @type {Map<any, string>} */
	const why = new Map();
	for (const x of doc.excluded) {
		const r = statementReason(x.entry, c);
		if (r) {
			x.why = r;
			why.set(x.entry, r);
		}
	}
	for (const t of doc.transactions) for (const m of t.movements) if (!m.onIt && why.has(m.entry)) m.why = /** @type {string} */ (why.get(m.entry));
	return doc;
}
