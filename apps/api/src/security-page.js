// SPDX-License-Identifier: AGPL-3.0-or-later
// The security policy, public at GET /security (the repository is private, so its SECURITY.md is not
// where the public reads it). /.well-known/security.txt points here as its Policy. German first,
// English below; one way to report: security@le-space.de.

export const SECURITY_PATH = '/security';
export const SECURITY_MAIL = 'security@le-space.de';

const mail = `<a href="mailto:${SECURITY_MAIL}">${SECURITY_MAIL}</a>`;

export const SECURITY_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sicherheit · Eigenbeleg</title>
<meta name="description" content="Wie Sie eine Sicherheitslücke in Eigenbeleg melden: privat an ${SECURITY_MAIL}, mit Coordinated Disclosure.">
<style>
:root { color-scheme: light dark; --bg: #faf6ee; --fg: #0f1b2d; --muted: #51606f; --line: #e3dccb; --link: #5b3fd6; --accent: #ffb020; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b0e15; --fg: #e8e4da; --muted: #a3acb8; --line: #2a2f3a; --link: #b7a6ff; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
h1 { font-size: 1.6rem; margin: 0.5rem 0 0.25rem; }
h2 { font-size: 1.15rem; margin: 1.75rem 0 0.4rem; }
a { color: var(--link); }
nav, .muted { color: var(--muted); font-size: 0.9rem; }
.never { border-left: 3px solid var(--accent); padding-left: 0.75rem; }
.draft { border: 1px solid var(--line); border-radius: 8px; padding: 0.5rem 0.75rem; color: var(--muted); }
hr { border: 0; border-top: 1px solid var(--line); margin: 2.5rem 0; }
</style>
</head>
<body>
<main>
<nav><a href="/ui/">Eigenbeleg</a> · <a href="/ui/#hilfe">Hilfe &amp; Support</a> · <a href="#en" hreflang="en">English</a></nav>

<article id="de" lang="de">
<h1>Sicherheit</h1>
<p>Eigenbeleg erstellt Eigenbelege für die Zahlungen eigener Blockchain-Adressen: im Browser unter <a href="/ui/">/ui/</a>, wo nichts das Gerät verlässt außer den Abfragen öffentlicher Chain-Daten, und über eine bezahlte API (x402) für Agenten, deren Server die Relayer-Schlüssel hält, die das Gas einer Zahlung bezahlen.</p>
<p class="never"><strong>Le Space fragt nie nach Seed-Phrase, Passkey, privatem Schlüssel oder Token</strong>, weder per Mail noch im Chat noch in einem Issue. Wer danach fragt, ist nicht von uns.</p>

<h2>Eine Sicherheitslücke melden</h2>
<p>Bitte <strong>nur privat, nie öffentlich</strong>: kein Issue, kein Beitrag, kein Post über etwas, das sich ausnutzen ließe. Schreiben Sie an ${mail}.</p>
<p>In die Meldung gehört, nur mit erfundenen Daten (erfundene Namen, Anschriften und Beträge; Ihre eigenen Testkonten):</p>
<ul>
<li>was Sie gefunden haben und wo (URL, Route, der Stand der Seite unten im Fuß),</li>
<li>wie es sich nachstellen lässt, Schritt für Schritt,</li>
<li>was es jemandem erlaubt und was es Ihrer Meinung nach betrifft,</li>
<li>wenn Sie mögen: wie Sie es beheben würden, und unter welchem Namen Sie genannt werden möchten.</li>
</ul>
<p>Nie hinein gehören echte Belege, Namen, Anschriften, Mails, Seed-Phrasen, Passkeys, Schlüssel oder Tokens, weder Ihre noch die anderer.</p>

<h2>Coordinated Disclosure</h2>
<ol>
<li><strong>Eingang:</strong> Wir bestätigen, dass die Meldung angekommen ist, und sagen, ob wir sie nachstellen können.</li>
<li><strong>Fix:</strong> Wir beheben die Lücke und veröffentlichen den Fix mit der nächsten Version; wir halten Sie auf dem Laufenden und bitten Sie vielleicht, ihn zu prüfen.</li>
<li><strong>Advisory:</strong> Nach dem Fix veröffentlichen wir einen Sicherheitshinweis, mit Dank an Sie unter dem Namen, den Sie wählen (oder ohne, wenn Sie das möchten).</li>
</ol>
<p>Bitte behalten Sie die Lücke für sich, bis der Hinweis veröffentlicht ist. Üblich sind dafür 90 Tage ab der Meldung; dauert der Fix länger oder ist er früher fertig, vereinbaren wir mit Ihnen einen Termin.</p>

<h2>Guter Glaube</h2>
<p>Wir begrüßen Forschung, die in gutem Glauben und nach diesen Regeln erfolgt, behandeln Ihre Meldung vertraulich und arbeiten mit Ihnen daran. So wollen wir handeln; das ist kein rechtlicher Verzicht, und es kann nicht für Dritte wie Stripe, Aleph oder Filecoin sprechen.</p>

<h2>Regeln</h2>
<ul>
<li>Nur eigene Daten und Konten: eigene Adressen, Testkonten, erfundene Namen. Lesen, ändern oder löschen Sie keine fremden Daten; stoßen Sie auf welche, hören Sie auf, behalten Sie nichts und sagen Sie es uns.</li>
<li>Kein Denial of Service: keine Lasttests, kein Fluten, nichts, was den Dienst für andere verlangsamt. Die Limits der API (Vorschau, Test-Route) werden nicht in großem Stil umgangen.</li>
<li>Kein Social Engineering, kein Phishing, kein physischer Zugang: weder gegen Le Space noch gegen seine Leute oder Kunden.</li>
<li>Kein Spam: die Mail-Funktion nicht an fremde Adressen schicken lassen.</li>
<li>Zahlungen nur wie ein gewöhnlicher Kunde: im Mainnet mit eigenem Geld für eine eigene Anfrage, auf der Test-Route (<code>/testnet/eigenbeleg</code>) mit Testnet-USDC. Versuchen Sie nicht, das Gas der Relayer aufzubrauchen.</li>
<li>Keine automatischen Scanner, die viele Anfragen schicken.</li>
</ul>

<h2>Geltungsbereich</h2>
<ul>
<li>eigenbeleg.le-space.de: die Web-Oberfläche unter <code>/ui/</code> und die API (<code>/</code>, <code>/eigenbeleg</code>, <code>/eigenbeleg/preview</code>, <code>/eigenbeleg/subscribe</code>, <code>/testnet/eigenbeleg</code>, <code>/blocks</code>, <code>/llms.txt</code>),</li>
<li>der Quellcode von Eigenbeleg: Web-Oberfläche, API mit Bezahlschranke, Facilitator und Relayern, die Leser der Chains, der Agent und die Skills,</li>
<li>Build und Auslieferung von eigenbeleg.le-space.de.</li>
</ul>
<p>Nicht dazu gehören: die Dienste Dritter, die Eigenbeleg liest (NearBlocks, FastNEAR, Alchemy, CoinGecko, Kraken, Aleph Cloud, Akash), die Blockchains und ihre Contracts, die x402-Bibliotheken selbst (bitte an deren Projekte melden; sagen Sie uns, ob Eigenbeleg betroffen ist), le-space.de und die anderen Projekte von Le Space (jedes hat seine eigene Sicherheitsseite).</p>

<h2>Kein Bounty</h2>
<p>Es gibt kein Bug-Bounty: Le Space zahlt kein Geld für Meldungen. Was wir bieten können, ist unser Dank im Sicherheitshinweis.</p>

<h2>Unterstützte Versionen</h2>
<p>Die aktuelle Version, die eigenbeleg.le-space.de ausliefert.</p>
<p class="muted">Fragen, die keine Sicherheitsfragen sind: <a href="/ui/#hilfe">Hilfe &amp; Support</a>. Maschinenlesbar: <a href="/.well-known/security.txt">/.well-known/security.txt</a> (RFC 9116).</p>
</article>

<hr>

<article id="en" lang="en">
<h1>Security</h1>
<p>Eigenbeleg makes Eigenbelege (self-issued proofs of payment) for the payments of own blockchain addresses: in the browser at <a href="/ui/">/ui/</a>, where nothing leaves the device but the reads of public chain data, and through a paid API (x402) for agents, whose server holds the relayer keys that pay the gas of a payment.</p>
<p class="never"><strong>Le Space never asks for a seed phrase, a passkey, a private key or a token</strong>: not by mail, not in a chat, not in an issue. Anyone who does is not us.</p>

<h2>Reporting a weakness</h2>
<p>Please report it <strong>privately, never in public</strong>: no issue, discussion or post about something that could be exploited. Write to ${mail}.</p>
<p>What belongs in a report, with made-up data only (made-up names, addresses and amounts; your own test accounts):</p>
<ul>
<li>what you found, and where (URL, route, the page's build at the bottom),</li>
<li>how to reproduce it, step by step,</li>
<li>what it lets someone do, and what you think it affects,</li>
<li>if you like, how you would fix it, and how you want to be named.</li>
</ul>
<p>Never include real documents, names, postal addresses, mails, seed phrases, passkeys, keys or tokens, yours or anyone else's.</p>

<h2>Coordinated disclosure</h2>
<ol>
<li><strong>Receipt:</strong> we confirm that the report arrived, and say whether we can reproduce it.</li>
<li><strong>Fix:</strong> we fix it and publish the fix with the next release; we keep you posted, and may ask you to check it.</li>
<li><strong>Advisory:</strong> after the fix is out, we publish a security advisory, with thanks to you by the name you choose (or none, if you prefer).</li>
</ol>
<p>Please keep the weakness to yourself until the advisory is out. The usual time for that is 90 days from the report; if a fix takes longer, or is out sooner, we agree a date with you.</p>

<h2>Good faith</h2>
<p>We welcome research done in good faith within these rules, treat your report confidentially and work with you on it. This is how we intend to act; it is not a legal waiver, and it cannot speak for third parties such as Stripe, Aleph or Filecoin.</p>

<h2>Rules</h2>
<ul>
<li>Use only your own data and accounts: your own addresses, test accounts, made-up names. Do not read, change or delete anyone else's data; if you come across some, stop, do not keep it, and tell us.</li>
<li>No denial of service: no load tests, no flooding, nothing that slows the service down for others. The API's limits (preview, test route) are not to be worked around at scale.</li>
<li>No social engineering, phishing or physical access: not against Le Space, its people or its customers.</li>
<li>No spam: do not use the mail feature to send mail to addresses that are not yours.</li>
<li>Payments only as an ordinary customer: on mainnet with your own funds, for your own request; on the test route (<code>/testnet/eigenbeleg</code>) with testnet USDC. Do not try to drain the relayers' gas.</li>
<li>No automated scanners that send large numbers of requests.</li>
</ul>

<h2>Scope</h2>
<ul>
<li>eigenbeleg.le-space.de: the web UI at <code>/ui/</code> and the API (<code>/</code>, <code>/eigenbeleg</code>, <code>/eigenbeleg/preview</code>, <code>/eigenbeleg/subscribe</code>, <code>/testnet/eigenbeleg</code>, <code>/blocks</code>, <code>/llms.txt</code>),</li>
<li>Eigenbeleg's source code: the web UI, the API with its paywall, facilitator and relayers, the chain readers, the agent and the skills,</li>
<li>the build and delivery of eigenbeleg.le-space.de.</li>
</ul>
<p>Not in scope: the third-party services Eigenbeleg reads (NearBlocks, FastNEAR, Alchemy, CoinGecko, Kraken, Aleph Cloud, Akash), the blockchains and their contracts, the x402 libraries themselves (report to their projects; tell us if Eigenbeleg is affected), le-space.de and the other Le Space projects (each has its own security page).</p>

<h2>No bounty</h2>
<p>There is no bug bounty: Le Space pays no money for reports. What we can offer is our thanks in the advisory.</p>

<h2>Supported versions</h2>
<p>The current version, which eigenbeleg.le-space.de serves.</p>
<p class="muted">Questions that are not about security: <a href="/ui/#hilfe">Help &amp; support</a>. Machine-readable: <a href="/.well-known/security.txt">/.well-known/security.txt</a> (RFC 9116).</p>
</article>
</main>
</body>
</html>
`;
