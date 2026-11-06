// SPDX-License-Identifier: AGPL-3.0-or-later
// The page's texts in German and English. German is the default; a browser
// set to another language gets English; the choice is kept per browser.
// Texts are only ever set with textContent (and placeholders as attributes).

/** @typedef {'de' | 'en'} Lang */

const de = {
	title: 'Eigenbeleg für Blockchain-Zahlungen',
	lead1: 'Ein Eigenbeleg ist ein Beleg, den Sie selbst für Ihre eigenen Zahlungen ausstellen, wenn niemand eine Rechnung schickt: Netzwerkgebühren, Storage-Deposits, Zahlungen an Peer-to-Peer-Netzwerke. Er ist ',
	lead2: 'keine Rechnung',
	lead3: '. Ob Ihr Steuerberater ihn annimmt, entscheidet er.',
	privacy: 'Alles geschieht in diesem Browser: Er liest die Chain, holt die Kurse und erstellt die PDFs. Name und Anschrift verlassen das Gerät nie, und kein Server von uns sieht Ihre Adressen. Kostenlos.',
	sourcesSummary: 'Welche Dienste Ihr Browser dabei fragt',
	sourcesIntro: 'Ihr Browser fragt nur diese Dienste, direkt. Sie sehen Ihre IP-Adresse und, wo angegeben, die Adressen, die Sie eintragen; Name und Anschrift nie.',
	learnsAddresses: 'erfährt Ihre Adressen',
	learnsAssets: 'erfährt nur die Währung',
	langSwitch: 'English',
	hForm: '1. Angaben',
	chain: 'Blockchain',
	network: 'Netz der Zahlungen',
	addresses: 'Eigene Adressen (eine pro Zeile, bis zu zehn)',
	period: 'Zeitraum (nur abgeschlossene Tage, höchstens 92)',
	month: 'Monat',
	range: 'Von – bis',
	from: 'Von',
	to: 'Bis',
	kinds: 'Was auf den Eigenbeleg kommt',
	kindFee: 'Netzwerkgebühren',
	kindStorage: 'Storage-Deposits',
	kindTransfer: 'Überweisungen',
	kindCall: 'Vertragsaufrufe mit Deposit',
	documents: 'Welche Dokumente (die CSV kommt immer mit)',
	docEigenbelege: 'Eigenbelege (je Transaktion einer)',
	docKontoauszug: 'Kontoauszug (je Adresse: Anfangssaldo, Buchungen, Endsaldo)',
	docBeide: 'Beide',
	number: 'Erste Belegnummer (optional, die weiteren zählen hoch)',
	statementNumber: 'Nummer des Kontoauszugs (optional)',
	payer: 'Aussteller (steht auf dem Eigenbeleg, bleibt in diesem Browser)',
	name: 'Name',
	postal: 'Anschrift',
	postalPlaceholder: 'Musterstraße 1\n12345 Beispielstadt',
	remember: 'Name und Anschrift auf diesem Gerät merken',
	btnCreate: 'Lesen und erstellen',
	btnReading: 'Lese die Chain …',
	hResult: '2. Ergebnis',
	signHint: 'Drucken, prüfen und unterschreiben: Ein Eigenbeleg gilt erst mit Ihrer Unterschrift.',
	source: 'Quellcode',
	agents: 'Für Agenten: API mit x402',

	pickKind: 'Bitte mindestens eine Art wählen.',
	needPayer: 'Bitte Name und Anschrift ausfüllen: Sie stehen auf dem Eigenbeleg und bleiben in diesem Browser.',
	refused: 'Bitte prüfen: {error}',
	unreadable: 'Die Chain oder die Kurse sind gerade nicht lesbar, bitte später noch einmal ({error}).',
	nothing: 'Keine Positionen in diesem Zeitraum.',
	sumEigenbelege: 'Eigenbelege',
	sumChain: 'Blockchain',
	sumPeriod: 'Zeitraum',
	sumPeriodValue: '{from} bis {to}',
	sumPositions: 'Positionen',
	sumNotOnIt: 'Nicht auf den Belegen (andere Arten)',
	sumTotal: 'Summe',
	sumQuantity: 'Menge {asset}',
	sumStatement: 'Kontoauszug {number}',
	reconciled: 'mit der Chain abgeglichen',
	derived: 'vom heutigen Saldo abgeleitet',
	difference: ' (Abweichung)',
	dlEigenbelege: 'Eigenbelege (PDF/A, {n})',
	dlStatement: 'Kontoauszug {account} (PDF/A)',
	dlCsv: 'Alle Bewegungen (CSV)'
};

/** @type {typeof de} */
const en = {
	title: 'Eigenbeleg for blockchain payments',
	lead1: 'An Eigenbeleg is a self-issued receipt for your own payments when nobody sends an invoice: network fees, storage deposits, payments to peer-to-peer networks. It is ',
	lead2: 'not an invoice',
	lead3: '. Whether your tax adviser accepts it is their call. The documents are in German, as German bookkeeping needs them.',
	privacy: 'Everything happens in this browser: it reads the chain, fetches the rates and makes the PDFs. Name and address never leave the device, and no server of ours sees your addresses. Free.',
	sourcesSummary: 'Which services your browser asks',
	sourcesIntro: 'Your browser asks only these services, directly. They see your IP address and, where said, the addresses you enter; never name or postal address.',
	learnsAddresses: 'learns your addresses',
	learnsAssets: 'learns only the currency',
	langSwitch: 'Deutsch',
	hForm: '1. Details',
	chain: 'Blockchain',
	network: 'Network of the payments',
	addresses: 'Own addresses (one per line, up to ten)',
	period: 'Period (finished days only, at most 92)',
	month: 'Month',
	range: 'From – to',
	from: 'From',
	to: 'To',
	kinds: 'What goes on the Eigenbeleg',
	kindFee: 'Network fees',
	kindStorage: 'Storage deposits',
	kindTransfer: 'Transfers',
	kindCall: 'Contract calls with a deposit',
	documents: 'Which documents (the CSV always comes along)',
	docEigenbelege: 'Eigenbelege (one per transaction)',
	docKontoauszug: 'Account statement, Kontoauszug (per address: opening balance, bookings, closing balance)',
	docBeide: 'Both',
	number: 'First receipt number (optional; the others count up)',
	statementNumber: 'Statement number (optional)',
	payer: 'Issuer (printed on the Eigenbeleg, stays in this browser)',
	name: 'Name',
	postal: 'Postal address',
	postalPlaceholder: 'Musterstraße 1\n12345 Beispielstadt',
	remember: 'Remember name and address on this device',
	btnCreate: 'Read and create',
	btnReading: 'Reading the chain …',
	hResult: '2. Result',
	signHint: 'Print, check and sign: an Eigenbeleg counts only with your signature.',
	source: 'Source code',
	agents: 'For agents: API with x402',

	pickKind: 'Please pick at least one kind.',
	needPayer: 'Please fill in name and address: they are printed on the Eigenbeleg and stay in this browser.',
	refused: 'Please check: {error}',
	unreadable: 'The chain or the rates cannot be read right now; please try again later ({error}).',
	nothing: 'No positions in this period.',
	sumEigenbelege: 'Eigenbelege',
	sumChain: 'Blockchain',
	sumPeriod: 'Period',
	sumPeriodValue: '{from} to {to}',
	sumPositions: 'Positions',
	sumNotOnIt: 'Not on the receipts (other kinds)',
	sumTotal: 'Total',
	sumQuantity: 'Quantity {asset}',
	sumStatement: 'Statement {number}',
	reconciled: 'reconciled with the chain',
	derived: "derived from today's balance",
	difference: ' (difference)',
	dlEigenbelege: 'Eigenbelege (PDF/A, {n})',
	dlStatement: 'Statement {account} (PDF/A)',
	dlCsv: 'All movements (CSV)'
};

export const TEXTS = { de, en };

/** @type {Lang} */
let current = 'de';

/** @returns {Lang} */
export function lang() {
	return current;
}

/** @param {Lang} l @param {boolean} [keep] remember the choice in this browser (only when the user picked it) */
export function setLang(l, keep = false) {
	current = l === 'en' ? 'en' : 'de';
	if (!keep) return;
	try {
		globalThis.localStorage?.setItem('lang', current);
	} catch {
		// private mode or blocked storage: the choice lasts until reload
	}
}

/** The saved choice, else the browser's language: German for de-*, English otherwise. @returns {Lang} */
export function detectLang() {
	try {
		const saved = globalThis.localStorage?.getItem('lang');
		if (saved === 'de' || saved === 'en') return saved;
	} catch {
		// no storage
	}
	const nav = globalThis.navigator?.language ?? 'de';
	return /^de\b/i.test(nav) ? 'de' : 'en';
}

/**
 * @param {keyof typeof de} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars = {}) {
	const s = TEXTS[current][key] ?? de[key] ?? key;
	return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Locale for numbers and dates. */
export function locale() {
	return current === 'en' ? 'en-GB' : 'de-DE';
}
