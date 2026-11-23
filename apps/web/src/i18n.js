// SPDX-License-Identifier: AGPL-3.0-or-later
// The page's texts in German and English. German is the default; a browser
// set to another language gets English; the choice is kept per browser.
// Texts are only ever set with textContent (and placeholders as attributes).
// The prices come from the API's own list (@eigenbeleg/pipeline/prices), so the page
// shows what the 402 asks; web.test.js holds index.html's German fallback to it.

import { USD_PER_EUR, VAT, coinPriceFor, eurGuide, priceFor, timesMonths, usdc } from '@eigenbeleg/pipeline/prices';

/** "0,10 USDC (rund 0,09 €)": the price and its euro guide. */
const priced = (/** @type {string} */ p, /** @type {'de' | 'en'} */ l) => `${usdc(p, l)} (${eurGuide(p, l)})`;
const [y, m, d] = USD_PER_EUR.date.split('-');

const NEAR = priceFor('near:mainnet');
const BASE = priceFor('eip155:8453');
const ETH = priceFor('eip155:1');
const DOI = `${coinPriceFor('doichain')} DOI`;

/** @typedef {'de' | 'en'} Lang */

const de = {
	// What search engines and share cards read (apps/web/seo.js); the tab's title too.
	metaTitle: 'Eigenbeleg für Blockchain-Zahlungen – kostenlos erstellen',
	metaDescription: 'Eigenbelege für Blockchain-Zahlungen: Netzwerkgebühren und Storage-Deposits als PDF/A und CSV, mit Euro-Kurs des Tages. Alles im Browser, kostenlos: Name, Anschrift und Adressen gehen an keinen Server von uns.',
	cardDescription: 'Netzwerkgebühren und Storage-Deposits als PDF/A und CSV, mit Euro-Kurs des Tages. Alles im Browser, kostenlos: Name, Anschrift und Adressen gehen an keinen Server von uns.',
	cardAlt: 'Le Space eigenbeleg: Eigenbelege für Blockchain-Zahlungen, als PDF/A und CSV.',
	title: 'Eigenbeleg für Blockchain-Zahlungen',
	lead1: 'Ein Eigenbeleg ist ein Beleg, den Sie selbst für Ihre eigenen Zahlungen ausstellen, wenn niemand eine Rechnung schickt: Netzwerkgebühren, Storage-Deposits, Zahlungen an Peer-to-Peer-Netzwerke. Er ist ',
	lead2: 'keine Rechnung',
	lead3: '. Ob Ihr Steuerberater ihn annimmt, entscheidet er.',
	tagline: 'Kostenlos und quelloffen. Alles in Ihrem Browser, nichts auf unseren Servern.',
	forWhom: 'Für alle, die auf NEAR, Akash, Filecoin, Doichain oder Bitcoin bezahlen (Ethereum und Base mit eigenem Alchemy-Schlüssel), Speicher über Filecoin Pay oder Aleph Cloud mit Credits nutzen, für Hosting, Speicher oder Verträge, und dafür einen Beleg für die Buchhaltung brauchen.',
	sampleDoc: 'Eigenbeleg',
	sampleFee: '0,0012 NEAR',
	sampleZero: '0,00 €',
	sampleDeposit: '0,05 NEAR',
	sampleRate: 'Kurs 00:00 UTC',
	sampleValue: '0,10 €',
	sampleTitle: 'So sieht das Ergebnis aus',
	sampleText: 'Je Transaktion ein Eigenbeleg mit Hash, Von/An, allen Bewegungen, QR-Code zum Explorer und Unterschriftszeile. Je Adresse ein Kontoauszug mit Anfangssaldo, Buchungen und Endsaldo, gegen die Chain geprüft. Beides als PDF/A, dazu eine CSV für die Tabelle.',
	privacy: 'Die Seite liest die Chain, holt die Kurse und erstellt die PDFs in diesem Browser. Name und Anschrift verlassen das Gerät nie, und kein Server von uns sieht Ihre Adressen. Der Quellcode ist offen (AGPL-3.0), jeder kann prüfen, was die Seite tut.',
	install: 'Die Seite lässt sich als App installieren (im Browser-Menü „Installieren“ oder „Zum Home-Bildschirm“) und startet dann auch ohne Netz.',
	hAgents: 'Für Agenten: dieselben Dokumente per API, bezahlt per x402',
	agentsText: 'Wer einen Agenten für sich arbeiten lässt, nutzt die API. Sie prüft die Anfrage, liest, bewertet und zeichnet mit demselben Code wie diese Seite. Der Agent zahlt je Anfrage per x402: in USDC auf NEAR, ohne Gas, oder in DOI auf Doichain (die Dokumente kommen dann nach dem Block, etwa 10 Minuten). USDC auf Base und Ethereum, wo die API es anbietet; was sie gerade nimmt, steht in /llms.txt. Die Vorschau ist kostenlos, und abgebucht wird nur, wenn die Chain gelesen werden konnte. Auf Wunsch schickt die API die Dateien zusätzlich per E-Mail, etwa an das Postfach eines Dokumentenmanagementsystems.',
	hPay: 'Womit Agenten zahlen',
	payNet: 'Netz',
	payAsset: 'Asset',
	payHow: 'Wie',
	payPrice: 'Preis je Anfrage',
	payNearHow: 'Eine signierte Delegate-Action; unser Relayer trägt das Gas',
	payEvmHow: 'Eine signierte EIP-3009-Überweisung; unser Relayer trägt das Gas; nur wo angeboten',
	payDoiHow: 'Eine signierte Doichain-Transaktion oder per QR-Code aus der Wallet; die Dokumente nach 1 Bestätigung (rund 10 Minuten)',
	payEthHow: 'Wie Base; teurer, weil das Gas auf Ethereum ein Vielfaches kostet; nur wo angeboten',
	payNearPrice: priced(NEAR, 'de'),
	payBasePrice: priced(BASE, 'de'),
	payEthPrice: priced(ETH, 'de'),
	payDoiPrice: DOI,
	payNote: `Die 402-Antwort nennt alle Wege, die die laufende API gerade nimmt, der Agent wählt einen; dieselbe Liste steht in /llms.txt. Bezahlt wird nur auf dem Mainnet. Alle Preise inkl. ${VAT} % USt; 1 USDC ist an den US-Dollar gebunden, der Euro-Betrag ist ein Richtwert zum EZB-Kurs vom ${d}.${m}.${y}; für DOI gibt es keinen veröffentlichten Kurs. Rechnung auf Anforderung.`,
	businessOnly: 'Die bezahlte API ist nur für Unternehmer (§ 14 BGB), zu unseren AGB. Privatpersonen erstellen dieselben Dokumente kostenlos auf dieser Seite.',
	subscriptionNote: `Wer die Kontoauszüge jeden Monat braucht, abonniert sie: einmal zahlen, und ab dem 2. jedes Monats kommt der Auszug für den Vormonat per E-Mail, etwa ins Postfach des Dokumentenmanagementsystems. Ein Jahr auf einmal (${usdc(timesMonths(NEAR), 'de')}, auf Ethereum, wo angeboten, ${usdc(timesMonths(ETH), 'de')}), oder 1 bis 12 Monate im Voraus zum normalen Preis je Anfrage (POST /eigenbeleg/subscribe/<Monate>). Dafür hebt die API Chain, Adressen, Aussteller (mit Logo, wenn eines mitgeschickt wurde) und E-Mail-Adresse verschlüsselt auf, bis der letzte Auszug verschickt ist oder Sie über den Link in jeder Mail beenden; Restmonate werden nicht erstattet. Das Abo wird in USDC bezahlt, nicht in DOI. Ob die laufende API das Abo anbietet, steht in /llms.txt.`,
	agentsPrompt: 'So beauftragen Sie zum Beispiel Claude oder einen anderen Agenten, der x402 kann; Zeitraum, Adresse und Aussteller sind Beispiele, setzen Sie Ihre ein:',
	copy: 'In die Zwischenablage',
	copied: 'Kopiert',
	prompt: `Besorge mir die Eigenbelege und den Kontoauszug für Oktober 2026 für meine NEAR-Adresse wolkenfabrik.near von https://eigenbeleg.le-space.de. Lies zuerst https://eigenbeleg.le-space.de/llms.txt und zeig mir die kostenlose Vorschau, bevor du zahlst. Aussteller: Wolkenfabrik Hosting GmbH, Musterstraße 1, 12345 Beispielstadt. Zahle höchstens ${usdc(NEAR, 'de')}.`,
	agentsCurl: 'Was die API ist, was sie kostet und wie man zahlt, sagt sie selbst:',
	agentsMore: 'Der Agent aus dem Quellcode kauft innerhalb seines Budgets, prüft die PDFs und legt eine Quittung ab. Beauftragen lässt er sich auch auf dem',
	hSkills: 'Als Skill für Claude Code und andere Agenten',
	skillsText: 'Dieselben Schritte gibt es als Agent Skills im offenen Format von agentskills.io: „eigenbeleg-api“ kauft die Dokumente über die API, „eigenbeleg-local“ baut sie kostenlos auf dem eigenen Rechner, ohne dass Name und Anschrift ihn verlassen. In Claude Code:',
	skillsMore: 'Andere Agenten, die SKILL.md lesen, nehmen die Ordner aus',
	skillsSh: ', oder über die skills.sh-CLI:',
	navGuide: 'Anleitung',
	navAgents: 'Für Agenten',
	navApi: 'API (llms.txt)',
	navHelp: 'Hilfe',
	navSecurity: 'Sicherheit',
	hHelp: 'Hilfe & Support',
	navTerms: 'AGB',
	hTerms: 'Allgemeine Geschäftsbedingungen (API)',
	navPrivacy: 'Datenschutz',
	navImprint: 'Impressum',
	hPrivacy: 'Datenschutzerklärung',
	licence: 'Le Space UG · AGPL-3.0-or-later',
	build: 'Stand',
	sourcesSummary: 'Welche Dienste Ihr Browser dabei fragt',
	sourcesIntro: 'Ihr Browser fragt nur diese Dienste, direkt. Sie sehen Ihre IP-Adresse und, wo angegeben, die Adressen, die Sie eintragen; Name und Anschrift nie.',
	learnsAddresses: 'erfährt Ihre Adressen',
	learnsAssets: 'erfährt nur die Währung',
	navSections: 'Abschnitte',
	navMenu: 'Menü öffnen',
	navClose: 'Menü schließen',
	langLabel: 'Sprache',
	githubLabel: 'Quellcode auf GitHub',
	hForm: 'Eigenbeleg erstellen',
	hHow: 'So geht’s',
	navCreate: 'Erstellen',
	navHow: 'So geht’s',
	stepAddress: 'Adresse',
	stepPeriod: 'Zeitraum',
	stepPayer: 'Aussteller',
	stepResult: 'Ergebnis',
	moreSettings: 'Mehr Einstellungen: Belegnummern und was auf den Beleg kommt',
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
	kindStorage: 'Storage-Deposits (NEAR: Hinterlegung für ein Token-Konto)',
	sampleStorage: 'Storage-Deposits',
	kindTransfer: 'Überweisungen',
	kindCall: 'Vertragsaufrufe mit Deposit',
	kindSwap: 'Käufe von Aleph-Credits (Zahlung mit ALEPH auf Ethereum oder Base)',
	kindSwapDex: 'Tausch an einer DEX (NEAR gegen wNEAR, wNEAR gegen einen Token)',
	documents: 'Welche Dokumente (die CSV kommt immer mit)',
	docEigenbelege: 'Eigenbelege (je Transaktion einer)',
	docKontoauszug: 'Kontoauszug (je Adresse: Anfangssaldo, Buchungen, Endsaldo)',
	docBeide: 'Beide',
	logo: 'Logo der Blockchain auf den Dokumenten (klein, neben dem Titel)',
	chart: 'Diagramm auf dem Kontoauszug (Kontostand oder Verbrauch je Tag)',
	currency: 'Währung der Dokumente',
	docLang: 'Sprache der Dokumente',
	docLangNote: 'Deutsch für die deutsche Buchhaltung. Englisch: dieselben Dokumente mit englischen Wörtern, Dezimalpunkt und ISO-Datum, auch die Namen auf Englisch (Self-Issued Receipt, Account Statement). Für fremdsprachige Belege kann ein deutsches Finanzamt eine Übersetzung verlangen (§ 87 AO).',
	currencyNote: 'EUR, wenn Sie nichts anderes wählen. In einer anderen Währung ist jeder Wert der Euro-Kurs des Tages mal dem amtlichen Kurs der Währung vom selben Tag (EZB-Referenzkurs, auch für USD; für RUB die Bank von Russland); jede Position nennt beide.',
	number: 'Erste Belegnummer (optional, die weiteren zählen hoch)',
	statementNumber: 'Nummer des Kontoauszugs (optional)',
	payer: 'Aussteller (steht auf dem Eigenbeleg, bleibt in diesem Browser)',
	name: 'Name',
	postal: 'Anschrift',
	postalPlaceholder: 'Musterstraße 1\n12345 Beispielstadt',
	remember: 'Name, Anschrift und Logo auf diesem Gerät merken',
	issuerLogo: 'Eigenes Logo (optional; PNG oder JPEG, höchstens 512 kB) – steht oben rechts auf jedem Eigenbeleg, nicht auf dem Kontoauszug',
	logoRemove: 'Logo entfernen',
	logoInfo: '{width} × {height} Pixel, bleibt in diesem Browser',
	logoAlt: 'Ihr Logo, wie es auf den Dokumenten steht',
	badLogo: 'Dieses Bild kann nicht als Logo verwendet werden ({error}). Erlaubt sind PNG und JPEG bis 512 kB und 2048 Pixel je Seite, höchstens sechsmal so breit wie hoch und doppelt so hoch wie breit.',
	logoNotKept: 'Der Browser hat Name, Anschrift und Logo nicht gespeichert (kein Platz oder Speichern gesperrt). Die Dokumente werden trotzdem erstellt.',
	rememberAccounts: 'Blockchain, Netz und Adressen auf diesem Gerät merken',
	withKey: ' – nur mit Alchemy-Schlüssel',
	nbSummary: 'NEAR: eigener NearBlocks-Schlüssel (optional)',
	nbNote: 'Ein Monat mit sehr vielen Transaktionen kann das kostenlose Limit von NearBlocks je IP-Adresse überschreiten; die Seite meldet das dann. Mit Ihrem eigenen Schlüssel von nearblocks.io gilt Ihr Limit. Er geht von Ihrem Browser nur an NearBlocks, nie an uns.',
	nbKey: 'NearBlocks-Schlüssel (API Key)',
	rememberNbKey: 'Schlüssel auf diesem Gerät merken',
	badNbKey: 'Das sieht nicht aus wie ein NearBlocks-Schlüssel (8 bis 200 Zeichen ohne Leerzeichen). Er wird nirgendwohin geschickt.',
	keySummary: 'Ethereum und Base: mit Ihrem eigenen Alchemy-Schlüssel',
	keyNote: 'Ethereum und Base liest die Seite über Alchemy, und das geht nur mit einem Schlüssel. Legen Sie sich einen kostenlosen Account bei alchemy.com an und tragen Sie den Schlüssel hier ein: Er geht von Ihrem Browser nur an Alchemy, nie an uns. Alchemy sieht dabei Ihre IP-Adresse, die Adressen und Ihren Schlüssel. Ohne Schlüssel bleiben die beiden Blockchains in der Liste ausgegraut. Tipp: Tragen Sie im Alchemy-Dashboard eigenbeleg.le-space.de als erlaubte Domain des Schlüssels ein, dann nützt er niemand anderem.',
	alchemyKey: 'Alchemy-Schlüssel (API Key)',
	rememberKey: 'Schlüssel auf diesem Gerät merken',
	badKey: 'Das sieht nicht aus wie ein Alchemy-Schlüssel (8 bis 128 Zeichen: Buchstaben, Ziffern, _ und -). Er wird nirgendwohin geschickt.',
	needKey: 'Für Ethereum und Base brauchen Sie Ihren eigenen Alchemy-Schlüssel: unter „Ethereum und Base“ eintragen.',
	monthlyOnlyFilecoinPay: 'Filecoin Pay: je Zahler-Adresse (0x… oder f410f…) und abgeschlossenem Monat ein Verbrauchsauszug des Guthabens im Zahlungsvertrag: Anfangs- und Endbestand, Ein- und Auszahlungen und jede Abrechnung einer Rail an ihren Speicheranbieter, mit Euro-Wert. Einen Eigenbeleg gibt es dafür nicht: Eine Abrechnung ist keine einzelne Zahlung. Gelesen wird nur USDFC; eine Abrechnung bezahlt bis zu dem Zeitpunkt, den sie nennt, und deckt darum nicht genau den Monat.',
	reference: 'Ihr Referenzwert für DOI',
	referenceEur: 'Euro je DOI',
	referenceFrom: 'gilt ab',
	referenceNote: 'DOI hat keinen veröffentlichten Kurs. Tragen Sie Ihren eigenen Wert ein, steht er als „Referenzwert, kein Börsenkurs“ mit Ihrem Namen auf den Dokumenten. Bleibt das Feld leer, gilt der Standardwert von 0,04 Euro je DOI für den ganzen Zeitraum, als solcher benannt. In einer anderen Währung mal dem Euro-Kurs dieser Währung vom Tag.',
	badReference: 'Der Referenzwert ist eine Zahl größer als null, zum Beispiel 0,05, und braucht das Datum, ab dem er gilt.',
	monthlyOnly: 'Aleph Cloud: je Adresse und abgeschlossenem Monat ein Verbrauchsauszug (Credits; Euro-Wert zum USD-Preis je Credit und EZB-Kurs des Tages) und ein Eigenbeleg je Kauf von Credits, mit dem Hash der Zahlung. Für den Verbrauch selbst gibt es keinen Eigenbeleg: er ist keine einzelne Zahlung.',
	missingChain: 'Ihre Blockchain fehlt? Ein Pull Request ist willkommen, wie steht in',
	missingChainOr: ', oder schreiben Sie an',
	hackTitle: 'NEAR Hackathon 2026',
	hackText: 'Entstanden beim Hackathon, jetzt in der Test- und Erprobungsphase. Bitte prüfen Sie jedes Dokument und melden Sie Unstimmigkeiten an eigenbeleg@le-space.de.',
	hackSmall: 'TESTPHASE · AGPL-3.0',
	pilotConfirm: 'Mir ist bekannt, dass eigenbeleg in der Test- und Erprobungsphase ist und die Dokumente Fehler enthalten können. Ich prüfe sie vor der Verwendung selbst und melde Unstimmigkeiten an eigenbeleg@le-space.de.',
	pilotTerms: 'Bedingungen (AGB, Ziffer 9a)',
	pilotNeeded: 'Bitte bestätigen Sie zuerst den Hinweis zur Testphase.',
	pilotCheck: 'Testphase: Bitte prüfen Sie jedes Dokument (Beträge, Daten, Transaktions-Hashes, Kurse), bevor Sie es verwenden, und melden Sie Unstimmigkeiten an eigenbeleg@le-space.de.',
	hackClose: 'Hinweis schließen',
	btnCreate: 'Lesen und erstellen',
	btnReading: 'Lese die Chain …',
	progressRead: 'Lese die Chain … {account} ({n}/{of})',
	progressRates: 'Hole die Tageskurse …',
	progressDraw: 'Zeichne die PDFs …',
	hResult: 'Ergebnis',
	signHint: 'Drucken, prüfen und unterschreiben: Ein Eigenbeleg gilt erst mit Ihrer Unterschrift.',
	source: 'Quellcode',
	srcWeb: 'Web-App (PWA)',
	srcSkills: 'Skills',
	srcAgent: 'Agent',
	srcBlocks: 'Bausteine (Reader, Kurse, PDF)',

	pickKind: 'Bitte mindestens eine Art wählen.',
	needPayer: 'Bitte Name und Anschrift ausfüllen: Sie stehen auf dem Eigenbeleg und bleiben in diesem Browser.',
	refused: 'Bitte prüfen: {error}',
	unreadable: 'Die Chain oder die Kurse sind gerade nicht lesbar, bitte später noch einmal ({error}).',
	unreadableKeyed: 'Alchemy hat nicht geantwortet oder die Anfrage abgelehnt ({error}). Ein falscher oder abgelaufener Schlüssel sieht im Browser genauso aus: bitte den Schlüssel prüfen, sonst später noch einmal.',
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
	// What search engines and share cards read (apps/web/seo.js); the tab's title too.
	metaTitle: 'Self-issued receipts for blockchain payments – free, in your browser',
	metaDescription: 'Self-issued receipts (Eigenbelege) as German bookkeeping knows them, for blockchain payments: network fees and storage deposits as PDF/A and CSV, with the day’s euro rate. All in the browser, free: name, postal address and addresses go to no server of ours.',
	cardDescription: 'Network fees and storage deposits as PDF/A and CSV, with the day’s euro rate. All in the browser, free: name, postal address and addresses go to no server of ours.',
	cardAlt: 'Le Space eigenbeleg: self-issued receipts for blockchain payments, as PDF/A and CSV.',
	title: 'Self-issued receipts for blockchain payments',
	lead1: 'A self-issued receipt (Eigenbeleg) is a receipt you write for your own payments when nobody sends an invoice: network fees, storage deposits, payments to peer-to-peer networks. It is ',
	lead2: 'not an invoice',
	lead3: '. Whether your tax adviser accepts it is their call. The documents are in German, as German bookkeeping needs them, or in English if you choose.',
	tagline: 'Free and open source. All in your browser, nothing on our servers.',
	forWhom: 'For everyone who pays on NEAR, Akash, Filecoin, Doichain or Bitcoin (Ethereum and Base with their own Alchemy key), or uses storage through Filecoin Pay or Aleph Cloud with credits, for hosting, storage or contracts, and needs a receipt for the books.',
	sampleDoc: 'Self-Issued Receipt',
	sampleFee: '0.0012 NEAR',
	sampleZero: '0.00 EUR',
	sampleDeposit: '0.05 NEAR',
	sampleRate: 'Rate 00:00 UTC',
	sampleValue: '0.10 EUR',
	sampleTitle: 'What you get',
	sampleText: 'One self-issued receipt per transaction, with the hash, from/to, every movement, a QR code to the explorer and a signature line. One account statement per address, with opening balance, bookings and closing balance, checked against the chain. Both as PDF/A, plus a CSV for the spreadsheet.',
	privacy: 'The page reads the chain, fetches the rates and makes the PDFs in this browser. Name and address never leave the device, and no server of ours sees your addresses. The source code is open (AGPL-3.0), so anyone can check what the page does.',
	install: 'The page installs as an app (browser menu: "Install" or "Add to Home Screen") and then starts without a network too.',
	hAgents: 'For agents: the same documents through the API, paid with x402',
	agentsText: 'Whoever has an agent work for them uses the API. It checks the request, reads, values and draws with the same code as this page. The agent pays per request with x402: in USDC on NEAR, without gas, or in DOI on Doichain (the documents then come after the block, about 10 minutes). USDC on Base and Ethereum where the API offers it; what it takes right now is in /llms.txt. The preview is free, and nothing is charged unless the chain could be read. On request the API also mails the files, say to a document management system\'s inbox.',
	hPay: 'What agents pay with',
	payNet: 'Network',
	payAsset: 'Asset',
	payHow: 'How',
	payPrice: 'Price per request',
	payNearHow: 'One signed delegate action; our relayer pays the gas',
	payEvmHow: 'One signed EIP-3009 transfer; our relayer pays the gas; only where offered',
	payDoiHow: 'A signed Doichain transaction, or from a wallet by QR code; the documents after 1 confirmation (about 10 minutes)',
	payEthHow: 'As on Base; dearer, because gas on Ethereum costs many times more; only where offered',
	payNearPrice: priced(NEAR, 'en'),
	payBasePrice: priced(BASE, 'en'),
	payEthPrice: priced(ETH, 'en'),
	payDoiPrice: DOI,
	payNote: `The 402 names every way the running API takes right now, and the agent picks one; /llms.txt has the same list. Payment is on mainnet only. All prices include ${VAT}% German VAT; 1 USDC is pegged to the US dollar, and the euro amount is a guide at the ECB rate of ${Number(d)} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m) - 1]} ${y}; DOI has no published rate. Invoice on request.`,
	businessOnly: 'The paid API is for businesses only (§ 14 BGB, German Civil Code), under our terms of business. Private persons make the same documents for free on this page.',
	subscriptionNote: `Whoever needs the statements every month subscribes: pay once, and from the 2nd of each month the statement for the month before arrives by e-mail, say in the document management system's inbox. A year at once (${usdc(timesMonths(NEAR), 'en')}, on Ethereum, where offered, ${usdc(timesMonths(ETH), 'en')}), or 1 to 12 months in advance at the normal price per request (POST /eigenbeleg/subscribe/<months>). For that the API keeps chain, addresses, issuer (with the logo, if one was sent) and e-mail address encrypted until the last statement is sent or you cancel through the link in every mail; the remaining months are not refunded. The subscription is paid in USDC, not in DOI. Whether the running API offers the subscription, /llms.txt says.`,
	agentsPrompt: 'This is how you brief Claude, say, or another agent that speaks x402; period, address and issuer are examples, put in your own:',
	copy: 'Copy to clipboard',
	copied: 'Copied',
	prompt: `Get me the self-issued receipts (Eigenbelege) and the account statement for October 2026 for my NEAR address wolkenfabrik.near from https://eigenbeleg.le-space.de. Read https://eigenbeleg.le-space.de/llms.txt first and show me the free preview before paying. Issuer: Wolkenfabrik Hosting GmbH, Musterstraße 1, 12345 Beispielstadt. Pay at most ${usdc(NEAR, 'en')}.`,
	agentsCurl: 'What the API is, what it costs and how to pay, it says itself:',
	agentsMore: 'The agent in the source code buys within its budget, checks the PDFs and keeps a receipt. It can also be hired on the',
	hSkills: 'As a skill for Claude Code and other agents',
	skillsText: 'The same steps exist as Agent Skills in the open format of agentskills.io: “eigenbeleg-api” buys the documents through the API, “eigenbeleg-local” builds them for free on your own machine, and name and address never leave it. In Claude Code:',
	skillsMore: 'Other agents that read SKILL.md take the folders from',
	skillsSh: ', or through the skills.sh CLI:',
	navGuide: 'Guide',
	navAgents: 'For agents',
	navApi: 'API (llms.txt)',
	navHelp: 'Help',
	navSecurity: 'Security',
	hHelp: 'Help & support',
	navTerms: 'Terms',
	hTerms: 'Terms of business (API)',
	navPrivacy: 'Privacy',
	navImprint: 'Imprint',
	hPrivacy: 'Privacy policy',
	licence: 'Le Space UG · AGPL-3.0-or-later',
	build: 'Build',
	sourcesSummary: 'Which services your browser asks',
	sourcesIntro: 'Your browser asks only these services, directly. They see your IP address and, where said, the addresses you enter; never name or postal address.',
	learnsAddresses: 'learns your addresses',
	learnsAssets: 'learns only the currency',
	navSections: 'Sections',
	navMenu: 'Open the menu',
	navClose: 'Close the menu',
	langLabel: 'Language',
	githubLabel: 'Source code on GitHub',
	hForm: 'Create a self-issued receipt',
	hHow: 'How it works',
	navCreate: 'Create',
	navHow: 'How it works',
	stepAddress: 'Address',
	stepPeriod: 'Period',
	stepPayer: 'Issuer',
	stepResult: 'Result',
	moreSettings: 'More settings: document numbers and what goes on the receipt',
	chain: 'Blockchain',
	network: 'Network of the payments',
	addresses: 'Own addresses (one per line, up to ten)',
	period: 'Period (finished days only, at most 92)',
	month: 'Month',
	range: 'From – to',
	from: 'From',
	to: 'To',
	kinds: 'What goes on the receipt',
	kindFee: 'Network fees',
	kindStorage: 'Storage deposits (NEAR: the deposit a token account needs)',
	sampleStorage: 'Storage deposits',
	kindTransfer: 'Transfers',
	kindCall: 'Contract calls with a deposit',
	kindSwap: 'Purchases of Aleph credits (paid with ALEPH on Ethereum or Base)',
	kindSwapDex: 'Swaps at a DEX (NEAR for wNEAR, wNEAR for a token)',
	documents: 'Which documents (the CSV always comes along)',
	docEigenbelege: 'Self-issued receipts (one per transaction)',
	docKontoauszug: 'Account statement (per address: opening balance, bookings, closing balance)',
	docBeide: 'Both',
	logo: 'The chain’s logo on the documents (small, beside the title)',
	chart: 'A chart on the account statement (balance or usage per day)',
	currency: 'Currency of the documents',
	docLang: 'Language of the documents',
	docLangNote: 'German for German bookkeeping. English: the same documents with English words, a decimal point and ISO dates, the names in English too (Self-Issued Receipt, Account Statement). For documents in another language a German tax office may ask for a translation (§ 87 AO).',
	currencyNote: 'EUR unless you choose another. In another currency every value is the day’s euro rate times the currency’s official rate of the same day (ECB reference rate, for USD too; for RUB the Bank of Russia); every position names both.',
	number: 'First receipt number (optional; the others count up)',
	statementNumber: 'Statement number (optional)',
	payer: 'Issuer (printed on the receipt, stays in this browser)',
	name: 'Name',
	postal: 'Postal address',
	postalPlaceholder: 'Musterstraße 1\n12345 Beispielstadt',
	remember: 'Remember name, address and logo on this device',
	issuerLogo: 'Your own logo (optional; PNG or JPEG, at most 512 kB) – printed top right on every receipt, not on the account statement',
	logoRemove: 'Remove the logo',
	logoInfo: '{width} × {height} pixels, stays in this browser',
	logoAlt: 'Your logo as it is printed on the documents',
	badLogo: 'This picture cannot be used as a logo ({error}). Allowed are PNG and JPEG up to 512 kB and 2048 pixels a side, at most six times as wide as high and twice as high as wide.',
	logoNotKept: 'The browser did not keep name, address and logo (no room, or storage is blocked). The documents are made all the same.',
	rememberAccounts: 'Remember chain, network and addresses on this device',
	withKey: ' – only with an Alchemy key',
	nbSummary: 'NEAR: your own NearBlocks key (optional)',
	nbNote: 'A month with very many transactions can exceed NearBlocks’ free limit per IP address; the page says so then. With your own key from nearblocks.io your limit applies. It goes from your browser to NearBlocks only, never to us.',
	nbKey: 'NearBlocks key (API key)',
	rememberNbKey: 'Remember the key on this device',
	badNbKey: 'That does not look like a NearBlocks key (8 to 200 characters, no spaces). It is sent nowhere.',
	keySummary: 'Ethereum and Base: with your own Alchemy key',
	keyNote: 'The page reads Ethereum and Base through Alchemy, which needs a key. Create a free account at alchemy.com and enter the key here: it goes from your browser to Alchemy only, never to us. Alchemy sees your IP address, the addresses and your key. Without a key the two chains stay greyed out in the list. Tip: in the Alchemy dashboard, allow-list eigenbeleg.le-space.de as the key’s domain, so it is of no use to anyone else.',
	alchemyKey: 'Alchemy key (API key)',
	rememberKey: 'Remember the key on this device',
	badKey: 'That does not look like an Alchemy key (8 to 128 characters: letters, digits, _ and -). It is sent nowhere.',
	needKey: 'Ethereum and Base need your own Alchemy key: enter it under “Ethereum and Base”.',
	monthlyOnlyFilecoinPay: 'Filecoin Pay: per payer address (0x… or f410f…) and finished month one usage statement of the balance in the payment contract: opening and closing balance, what was paid in and taken out, and each settlement of a rail to its storage provider, with its euro value. There is no self-issued receipt for it: a settlement is no single payment. Only USDFC is read; a settlement pays up to the moment it names, so it need not cover exactly the month.',
	reference: 'Your reference value for DOI',
	referenceEur: 'Euro per DOI',
	referenceFrom: 'holds from',
	referenceNote: 'DOI has no published rate. If you enter your own value, the documents name it as a reference value, not an exchange rate, with your name. Left empty, the default of 0.04 euro per DOI holds for the whole period, named as such. In another currency it is taken times the euro in it on the day.',
	badReference: 'The reference value is a number above zero, for example 0.05, and needs the day it holds from.',
	monthlyOnly: "Aleph Cloud: per address and finished month one usage statement (credits, euro value at the USD price per credit and the day's ECB rate) and one self-issued receipt per purchase of credits, with the payment's hash. Usage itself gets no self-issued receipt: it is no single payment.",
	missingChain: 'Your chain is missing? A pull request is welcome; how is in',
	missingChainOr: ', or write to',
	hackTitle: 'NEAR Hackathon 2026',
	hackText: 'Built at the hackathon, now in a test and trial phase. Please check every document and report discrepancies to eigenbeleg@le-space.de.',
	hackSmall: 'TEST PHASE · AGPL-3.0',
	pilotConfirm: 'I know that eigenbeleg is in a test and trial phase and that the documents may contain errors. I check them myself before using them and report discrepancies to eigenbeleg@le-space.de.',
	pilotTerms: 'Terms (section 9a)',
	pilotNeeded: 'Please confirm the note on the test phase first.',
	pilotCheck: 'Test phase: please check every document (amounts, dates, transaction hashes, rates) before using it, and report discrepancies to eigenbeleg@le-space.de.',
	hackClose: 'Close this note',
	btnCreate: 'Read and create',
	btnReading: 'Reading the chain …',
	progressRead: 'Reading the chain … {account} ({n}/{of})',
	progressRates: 'Fetching the day rates …',
	progressDraw: 'Drawing the PDFs …',
	hResult: 'Result',
	signHint: 'Print, check and sign: a self-issued receipt counts only with your signature.',
	source: 'Source code',
	srcWeb: 'Web app (PWA)',
	srcSkills: 'Skills',
	srcAgent: 'Agent',
	srcBlocks: 'Building blocks (readers, rates, PDF)',

	pickKind: 'Please pick at least one kind.',
	needPayer: 'Please fill in name and address: they are printed on the receipt and stay in this browser.',
	refused: 'Please check: {error}',
	unreadable: 'The chain or the rates cannot be read right now; please try again later ({error}).',
	unreadableKeyed: 'Alchemy did not answer or refused the request ({error}). A wrong or expired key looks the same in a browser: please check the key, otherwise try again later.',
	nothing: 'No positions in this period.',
	sumEigenbelege: 'Self-issued receipts',
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
	dlEigenbelege: 'Self-issued receipts (PDF/A, {n})',
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

/** The language the address names (`?lang=de` or `?lang=en`), or null. @param {string} [search] the address's query */
export function urlLang(search = globalThis.location?.search ?? '') {
	const l = new URLSearchParams(search).get('lang');
	return l === 'de' || l === 'en' ? l : null;
}

/**
 * The address's language (each has its own address, for search engines and
 * for a link someone shares), else the saved choice, else the browser's
 * language: German for de-*, English otherwise.
 *
 * @returns {Lang}
 */
export function detectLang() {
	const named = urlLang();
	if (named) return named;
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
