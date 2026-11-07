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
	tagline: 'Kostenlos und quelloffen. Alles in Ihrem Browser, nichts auf unseren Servern.',
	forWhom: 'Für alle, die auf NEAR, Akash oder Filecoin bezahlen oder Aleph Cloud mit Credits nutzen, für Hosting, Speicher oder Verträge, und dafür einen Beleg für die Buchhaltung brauchen.',
	sampleTitle: 'So sieht das Ergebnis aus',
	sampleText: 'Je Transaktion ein Eigenbeleg mit Hash, Von/An, allen Bewegungen, QR-Code zum Explorer und Unterschriftszeile. Je Adresse ein Kontoauszug mit Anfangssaldo, Buchungen und Endsaldo, gegen die Chain geprüft. Beides als PDF/A, dazu eine CSV für die Tabelle.',
	privacy: 'Die Seite liest die Chain, holt die Kurse und erstellt die PDFs in diesem Browser. Name und Anschrift verlassen das Gerät nie, und kein Server von uns sieht Ihre Adressen. Der Quellcode ist offen (AGPL-3.0), jeder kann prüfen, was die Seite tut.',
	install: 'Die Seite lässt sich als App installieren (im Browser-Menü „Installieren“ oder „Zum Home-Bildschirm“) und startet dann auch ohne Netz.',
	hAgents: 'Für Agenten: dieselben Dokumente per API, bezahlt per x402',
	agentsText: 'Wer einen Agenten für sich arbeiten lässt, nutzt die API. Sie prüft die Anfrage, liest, bewertet und zeichnet mit demselben Code wie diese Seite. Der Agent zahlt je Anfrage 0,10 USDC per x402, ohne Gas (derzeit auf dem NEAR-Testnet). Die Vorschau ist kostenlos, und abgebucht wird nur, wenn die Chain gelesen werden konnte.',
	agentsPrompt: 'So beauftragen Sie zum Beispiel Claude oder einen anderen Agenten, der x402 kann (die Adresse ist unser eigener Testnet-Agent, mit echten Zahlungen):',
	copy: 'In die Zwischenablage',
	copied: 'Kopiert',
	prompt: 'Besorge mir die Eigenbelege und den Kontoauszug für den 1. bis 6. November 2026 für meine NEAR-Testnet-Adresse eigenbeleg-agent.testnet von https://eigenbeleg.le-space.de. Lies zuerst https://eigenbeleg.le-space.de/llms.txt. Aussteller: Wolkenfabrik Hosting GmbH, Musterstraße 1, 12345 Beispielstadt. Zahle höchstens 0,10 USDC.',
	agentsCurl: 'Was die API ist, was sie kostet und wie man zahlt, sagt sie selbst:',
	agentsMore: 'Der Agent aus dem Quellcode kauft innerhalb seines Budgets, prüft die PDFs und legt eine Quittung ab. Beauftragen lässt er sich auch auf dem',
	navGuide: 'Anleitung',
	navAgents: 'Für Agenten',
	navApi: 'API (llms.txt)',
	navPrivacy: 'Datenschutz',
	navImprint: 'Impressum',
	hPrivacy: 'Datenschutzerklärung',
	licence: 'Le Space UG · AGPL-3.0-or-later',
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
	rememberAccounts: 'Blockchain, Netz und Adressen auf diesem Gerät merken',
	monthlyOnly: 'Aleph Cloud: ein Verbrauchsauszug je Adresse und abgeschlossenem Monat (Credits; Euro-Wert zum USD-Preis je Credit und EZB-Kurs des Tages). Ein Eigenbeleg entsteht dafür nicht: Verbrauch aus Guthaben ist keine einzelne Zahlung.',
	missingChain: 'Ihre Blockchain fehlt? Ein Pull Request ist willkommen, wie steht in',
	missingChainOr: ', oder schreiben Sie an',
	btnCreate: 'Lesen und erstellen',
	btnReading: 'Lese die Chain …',
	progressRead: 'Lese die Chain … {account} ({n}/{of})',
	progressRates: 'Hole die Tageskurse …',
	progressDraw: 'Zeichne die PDFs …',
	hResult: '2. Ergebnis',
	signHint: 'Drucken, prüfen und unterschreiben: Ein Eigenbeleg gilt erst mit Ihrer Unterschrift.',
	source: 'Quellcode',

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
	tagline: 'Free and open source. All in your browser, nothing on our servers.',
	forWhom: 'For everyone who pays on NEAR, Akash or Filecoin, or uses Aleph Cloud with credits, for hosting, storage or contracts, and needs a receipt for the books.',
	sampleTitle: 'What you get',
	sampleText: 'One Eigenbeleg per transaction, with the hash, from/to, every movement, a QR code to the explorer and a signature line. One account statement per address, with opening balance, bookings and closing balance, checked against the chain. Both as PDF/A, plus a CSV for the spreadsheet.',
	privacy: 'The page reads the chain, fetches the rates and makes the PDFs in this browser. Name and address never leave the device, and no server of ours sees your addresses. The source code is open (AGPL-3.0), so anyone can check what the page does.',
	install: 'The page installs as an app (browser menu: "Install" or "Add to Home Screen") and then starts without a network too.',
	hAgents: 'For agents: the same documents through the API, paid with x402',
	agentsText: 'Whoever has an agent work for them uses the API. It checks the request, reads, values and draws with the same code as this page. The agent pays 0.10 USDC per request with x402, without gas (on the NEAR testnet for now). The preview is free, and nothing is charged unless the chain could be read.',
	agentsPrompt: 'This is how you brief Claude, say, or another agent that speaks x402 (the address is our own testnet agent, with real payments):',
	copy: 'Copy to clipboard',
	copied: 'Copied',
	prompt: 'Get me the Eigenbelege and the account statement for 1 to 6 November 2026 for my NEAR testnet address eigenbeleg-agent.testnet from https://eigenbeleg.le-space.de. Read https://eigenbeleg.le-space.de/llms.txt first. Issuer: Wolkenfabrik Hosting GmbH, Musterstraße 1, 12345 Beispielstadt. Pay at most 0.10 USDC.',
	agentsCurl: 'What the API is, what it costs and how to pay, it says itself:',
	agentsMore: 'The agent in the source code buys within its budget, checks the PDFs and keeps a receipt. It can also be hired on the',
	navGuide: 'Guide',
	navAgents: 'For agents',
	navApi: 'API (llms.txt)',
	navPrivacy: 'Privacy',
	navImprint: 'Imprint',
	hPrivacy: 'Privacy policy',
	licence: 'Le Space UG · AGPL-3.0-or-later',
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
	rememberAccounts: 'Remember chain, network and addresses on this device',
	monthlyOnly: "Aleph Cloud: one usage statement (Verbrauchsauszug) per address and finished month (credits; euro value at the USD price per credit and the day's ECB rate). No Eigenbeleg: usage from a prepaid balance is no single payment.",
	missingChain: 'Your chain is missing? A pull request is welcome; how is in',
	missingChainOr: ', or write to',
	btnCreate: 'Read and create',
	btnReading: 'Reading the chain …',
	progressRead: 'Reading the chain … {account} ({n}/{of})',
	progressRates: 'Fetching the day rates …',
	progressDraw: 'Drawing the PDFs …',
	hResult: '2. Result',
	signHint: 'Print, check and sign: an Eigenbeleg counts only with your signature.',
	source: 'Source code',

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
