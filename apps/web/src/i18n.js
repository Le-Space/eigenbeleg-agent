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
	privacy: 'Testnet. Nichts wird gespeichert: Name und Anschrift gehen nur an den bezahlten Abruf und werden nach der Antwort verworfen.',
	langSwitch: 'English',
	hForm: '1. Anfrage',
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
	documents: 'Welche Dokumente (ein Preis, die CSV kommt immer mit)',
	docEigenbelege: 'Eigenbelege (je Transaktion einer)',
	docKontoauszug: 'Kontoauszug (je Adresse: Anfangssaldo, Buchungen, Endsaldo)',
	docBeide: 'Beide',
	number: 'Erste Belegnummer (optional, die weiteren zählen hoch)',
	statementNumber: 'Nummer des Kontoauszugs (optional)',
	payer: 'Zahler (steht auf dem Eigenbeleg, geht nicht in die Vorschau)',
	name: 'Name',
	postal: 'Anschrift',
	postalPlaceholder: 'Musterstraße 1\n12345 Beispielstadt',
	btnPreview: 'Vorschau (kostenlos)',
	btnReading: 'Lese die Chain …',
	hPreview: '2. Vorschau',
	hPay: '3. Bezahlen und herunterladen',
	btnWallet: 'Wallet verbinden',
	btnDisconnect: 'Wallet trennen',
	btnPay: 'Kaufen',
	walletHint: 'Zahlung per x402 auf NEAR: Sie signieren genau eine USDC-Überweisung, die API reicht sie ein und zahlt das Gas. Unterstützt: Meteor, Intear.',
	payment: 'Zahlung:',
	signHint: 'Drucken, prüfen und unterschreiben: Ein Eigenbeleg gilt erst mit Ihrer Unterschrift.',
	cliSummary: 'Keine passende Wallet? Mit dem Agenten auf der Kommandozeile kaufen',
	cliHint1: 'Im Repository, mit ',
	cliHint2: ' in ',
	cliHint3: ' (siehe README). Name und Anschrift selbst einsetzen.',
	source: 'Quellcode',
	data: 'Daten: NearBlocks.io, Kurse: Kraken',

	apiDown: 'Die API ist nicht erreichbar.',
	pickKind: 'Bitte mindestens eine Art wählen.',
	tooMany: 'Zu viele Vorschauen. Bitte in einer Minute noch einmal.',
	unreadable: 'Die Chain oder die Kurse sind gerade nicht lesbar, bitte später noch einmal ({error}).',
	refused: 'Abgelehnt: {error}',
	nothing: 'Keine Positionen in diesem Zeitraum: Es gibt nichts zu kaufen.',
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
	previewNote: 'Name und Anschrift kommen erst beim Kauf dazu. Der Kauf liest die Chain noch einmal.',
	free: 'Diese API verlangt keine Zahlung (Entwicklungsmodus).',
	noNear: 'Die API bietet keine Zahlung auf NEAR an.',
	docsEigenbelege: 'die Eigenbelege',
	docsKontoauszug: 'den Kontoauszug',
	docsBeide: 'Eigenbelege und Kontoauszug',
	price: 'Preis für {docs}: {amount} an {payTo} ({network}). Gas zahlt die API.',
	disconnected: 'Getrennt.',
	noAccount: 'Die Wallet hat kein Konto geliefert.',
	connected: 'Verbunden: {account} ({wallet}). Dieses Konto zahlt die USDC; es muss nicht auf dem Eigenbeleg stehen.',
	walletError: 'Wallet: {error}',
	changed: 'Die Anfrage hat sich seit der Vorschau geändert. Bitte erst neu prüfen.',
	needPayer: 'Bitte Name und Anschrift des Zahlers ausfüllen (oben im Formular).',
	connectFirst: 'Bitte zuerst eine Wallet verbinden.',
	asking: 'Frage den Eigenbeleg an …',
	notAccepted: 'Zahlung nicht angenommen{error}. Es wurde nichts abgebucht.',
	failed: '{status}: {error}',
	dlEigenbelege: 'Eigenbelege (PDF/A, {n})',
	dlStatement: 'Kontoauszug {account} (PDF/A)',
	dlCsv: 'Alle Bewegungen (CSV)',
	unpaid: 'ohne Zahlung (Entwicklungsmodus)',
	done: 'Fertig: {eb}, {ka}, CSV.',
	doneEb: 'Eigenbelege {number}',
	doneNoEb: 'keine Eigenbelege',
	doneKa: '{n} Kontoauszug/-auszüge',
	doneNoKa: 'kein Kontoauszug',

	signPlease: 'Bitte in der Wallet signieren …',
	signed: 'Signiert. Die API prüft und rechnet ab …',
	otherPayment: 'Die API verlangt jetzt eine andere Zahlung als bestätigt. Bitte neu starten.',
	noDelegate: 'Die Wallet hat keine signierte Delegate Action zurückgegeben.',
	mismatch: 'Die Wallet hat etwas anderes signiert als verlangt ({why}). Nichts wurde gesendet.',
	whySignature: 'Signatur ungültig',
	whySender: 'Absender {sender}',
	whyActions: 'nicht genau eine Aktion',
	whyToken: 'anderer Token',
	whyRecipient: 'anderer Empfänger',
	whyAmount: 'anderer Betrag',
	whyDeposit: 'anderer Deposit'
};

/** @type {typeof de} */
const en = {
	title: 'Eigenbeleg for blockchain payments',
	lead1: 'An Eigenbeleg is a self-issued receipt for your own payments when nobody sends an invoice: network fees, storage deposits, payments to peer-to-peer networks. It is ',
	lead2: 'not an invoice',
	lead3: '. Whether your tax adviser accepts it is their call. The documents are in German, as German bookkeeping needs them.',
	privacy: 'Testnet. Nothing is stored: name and address go only to the paid request and are dropped after the response.',
	langSwitch: 'Deutsch',
	hForm: '1. Request',
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
	documents: 'Which documents (one price; the CSV always comes along)',
	docEigenbelege: 'Eigenbelege (one per transaction)',
	docKontoauszug: 'Account statement, Kontoauszug (per address: opening balance, bookings, closing balance)',
	docBeide: 'Both',
	number: 'First receipt number (optional; the others count up)',
	statementNumber: 'Statement number (optional)',
	payer: 'Payer (printed on the Eigenbeleg, not sent with the preview)',
	name: 'Name',
	postal: 'Postal address',
	postalPlaceholder: 'Musterstraße 1\n12345 Beispielstadt',
	btnPreview: 'Preview (free)',
	btnReading: 'Reading the chain …',
	hPreview: '2. Preview',
	hPay: '3. Pay and download',
	btnWallet: 'Connect wallet',
	btnDisconnect: 'Disconnect wallet',
	btnPay: 'Buy',
	walletHint: 'Payment with x402 on NEAR: you sign exactly one USDC transfer; the API submits it and pays the gas. Supported: Meteor, Intear.',
	payment: 'Payment:',
	signHint: 'Print, check and sign: an Eigenbeleg counts only with your signature.',
	cliSummary: 'No suitable wallet? Buy with the agent on the command line',
	cliHint1: 'In the repository, with ',
	cliHint2: ' in ',
	cliHint3: ' (see the README). Fill in name and address yourself.',
	source: 'Source code',
	data: 'Data: NearBlocks.io, rates: Kraken',

	apiDown: 'The API cannot be reached.',
	pickKind: 'Please pick at least one kind.',
	tooMany: 'Too many previews. Please try again in a minute.',
	unreadable: 'The chain or the rates cannot be read right now; please try again later ({error}).',
	refused: 'Refused: {error}',
	nothing: 'No positions in this period: there is nothing to buy.',
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
	previewNote: 'Name and address are added only when you buy. Buying reads the chain again.',
	free: 'This API asks for no payment (development mode).',
	noNear: 'The API offers no payment on NEAR.',
	docsEigenbelege: 'the Eigenbelege',
	docsKontoauszug: 'the statement',
	docsBeide: 'Eigenbelege and statement',
	price: 'Price for {docs}: {amount} to {payTo} ({network}). The API pays the gas.',
	disconnected: 'Disconnected.',
	noAccount: 'The wallet returned no account.',
	connected: 'Connected: {account} ({wallet}). This account pays the USDC; it need not be on the Eigenbeleg.',
	walletError: 'Wallet: {error}',
	changed: 'The request changed since the preview. Please preview again first.',
	needPayer: "Please fill in the payer's name and address (in the form above).",
	connectFirst: 'Please connect a wallet first.',
	asking: 'Requesting the Eigenbeleg …',
	notAccepted: 'Payment not accepted{error}. Nothing was charged.',
	failed: '{status}: {error}',
	dlEigenbelege: 'Eigenbelege (PDF/A, {n})',
	dlStatement: 'Statement {account} (PDF/A)',
	dlCsv: 'All movements (CSV)',
	unpaid: 'without payment (development mode)',
	done: 'Done: {eb}, {ka}, CSV.',
	doneEb: 'Eigenbelege {number}',
	doneNoEb: 'no Eigenbelege',
	doneKa: '{n} statement(s)',
	doneNoKa: 'no statement',

	signPlease: 'Please sign in the wallet …',
	signed: 'Signed. The API checks and settles …',
	otherPayment: 'The API now asks for a different payment than confirmed. Please start again.',
	noDelegate: 'The wallet returned no signed delegate action.',
	mismatch: 'The wallet signed something other than asked ({why}). Nothing was sent.',
	whySignature: 'invalid signature',
	whySender: 'sender {sender}',
	whyActions: 'not exactly one action',
	whyToken: 'another token',
	whyRecipient: 'another recipient',
	whyAmount: 'another amount',
	whyDeposit: 'another deposit'
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
