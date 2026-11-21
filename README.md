# eigenbeleg-agent

**Eigenbelege and Kontoauszüge for blockchain accounts: a paid API and a small agent that write the receipts and statements nobody else will.**

When a company pays on a blockchain, often nobody sends it an invoice. Network fees go to a peer-to-peer network; a storage deposit goes to a protocol contract. No organisation stands behind them that could issue an invoice. German bookkeeping still wants a receipt (Beleg) for every booking. The usual answer is an **Eigenbeleg**: a receipt the payer writes for their own payment and signs, saying what was paid, when, to whom, how much, and why there is no receipt from the other side.

This repository writes two documents from public blockchain data, both laid out the way a bank lays them out:

- an **Eigenbeleg per transaction**: one receipt with its own number for each payment to the network, with the full hash, who paid whom (full addresses), every movement of the transaction and its explorer link as a QR code;
- a **Kontoauszug** (account statement) per own account and period: opening balance, every booking with debit, credit and running balance, closing balance – **checked against the balance the chain reports** – and the sums a bookkeeper needs, for every chain supported (NEAR, Akash, Filecoin). Above the bookings a small diagram: the balance over the period, or, on a Verbrauchsauszug (Aleph credits, Filecoin Pay), what was consumed per day and resource.

It consists of:

- open **building blocks** (AGPL-3.0-or-later): chain readers, a neutral booking format, EUR day rates, the documents as **PDF/A-2b** and **CSV**;
- an **HTTP API** that sells them per request, paid with **x402 on NEAR** (USDC, gasless for the payer);
- a minimal **agent** that takes a job, checks the building block is current, pays the API within its budget, checks the result and keeps a receipt of what it bought. For a chain it cannot serve, it drafts the missing building block as a pull request with tests instead of buying anything.

An Eigenbeleg is **never an invoice**, and it is never written for someone else: the payer issues it for their own payments. Whether and up to what amount your tax adviser accepts Eigenbelege is their call.

Built at **NEAR HACKATHON** (Nov 2026) by [Le Space UG](https://le-space.de). Tracks: Real-World Money (main), Agent Economy.

---

## Try it in two minutes (no keys, no wallet)

Needs Node.js 20 or newer.

```bash
npm install
npm test
npm run demo
```

What you should see:

1. `npm test`: about 55 tests pass (the booking format, the NEAR, Akash, Filecoin and Aleph blocks, rates, the PDF/CSV, the API with its x402 paywall and the free preview, the agent, the web UI's wallet signer).
2. `npm run demo`: the agent runs two jobs against the API in the same process (the first asks for both documents, `document: beide`), without a paywall (the API says so on every response). The NEAR data comes from a recorded fixture of a **public** account, Aurora's relayer on 1 Nov 2026, which pays only network fees, so the demo works offline.
   - **Job 1** ends with `Got 25 Eigenbeleg(e) EB-2026-001 – EB-2026-025 … check passed.` and `Kontoauszug: KA-2026-11-01 (NEAR 25 → 24.98…, reconciled)`. Open:
     - `out/demo/EB-2026-001.pdf`: 25 Eigenbelege, one page per transaction (a network fee each), with hash, Von/An, movements, QR code, amount and a signature line;
     - `out/demo/KA-2026-11-01.pdf`: the Kontoauszug of the day, with opening balance, 25 bookings with running balance, closing balance and the check against the chain (in the demo a recorded archival node answers);
     - `out/demo/EB-2026-001.csv`: every movement for a spreadsheet;
     - `out/demo/EB-2026-001.receipt.json`: the agent's receipt (what it bought, the price, the checks it ran).
   - **Job 2** asks for Solana, which has no building block. The agent buys nothing. It writes a draft under `out/demo/proposals/chain-solana/`: `PLAN.md`, a package skeleton, contract tests that fail until someone writes the reader, and `PR.md`. Then it prints the `git` and `gh pr create --draft` commands. It runs none of them.

The demo's EUR rate is fixed (1.92 €/NEAR); the API itself uses the day's rate (below).

## Try the hosted API

A public instance runs at **https://eigenbeleg.le-space.de** (mainnet payments in real USDC, open source, AGPL). The paid API is for **businesses only** (§ 14 BGB), under the terms of business at [`/ui/#agb`](https://eigenbeleg.le-space.de/ui/#agb); prices include 19% German VAT, an invoice comes on request. Private persons use the web UI, free. Prices: 0.10 USDC per request on NEAR and Base, 1.00 USDC on Ethereum; a year's subscription 12 × that ([`packages/pipeline/src/prices.js`](packages/pipeline/src/prices.js), the one list the API, `/llms.txt` and the page use).

```bash
curl -s https://eigenbeleg.le-space.de/
```
You should see the service, its prices per payment network with the recipients, the building blocks (`near`, `akash`, `filecoin`, `filecoin-pay`, `aleph`), the licence and the source link.

```bash
curl -s https://eigenbeleg.le-space.de/blocks/near/check
```
You should see `"ok":true`: the NEAR building block, checked against live data.

```bash
curl -si -X POST https://eigenbeleg.le-space.de/eigenbeleg -H 'content-type: application/json' -d '{"chain":"near","network":"mainnet","addresses":["relay.aurora"],"period":{"from":"2026-11-01","to":"2026-11-01"},"payer":{"name":"Wolkenfabrik Hosting GmbH","address":"Musterstraße 1\n12345 Beispielstadt"}}'
```
You should see `HTTP/2 402` and a `payment-required` header (base64 JSON, x402 v2). Before paying, the request was checked: change `chain` to `dogecoin` and you get a `400` instead.

With a mainnet account holding USDC, the agent pays it: add `--api https://eigenbeleg.le-space.de` to `npm run agent` (a real payment; `AGENT_BUDGET` caps it). To try payments without real money, use the test route on the hosted API: `--api https://eigenbeleg.le-space.de/testnet --network testnet` pays in testnet USDC for testnet addresses only ("Test route" under "Deploy"), or run your own API on testnet (next section).

## Pay for it with x402 on NEAR testnet (your own API, development)

This is the real flow: the API asks for 0.10 USDC, and the agent signs one USDC transfer and gets the Eigenbelege.

```
agent ── POST /eigenbeleg ──────────────────────────▶ API
agent ◀─ 402 + PAYMENT-REQUIRED (0.10 USDC to eigenbeleg-api.testnet, near:testnet)
agent: budget ok? sign a NEP-366 delegate action for exactly one USDC ft_transfer
agent ── POST /eigenbeleg + PAYMENT-SIGNATURE ──────▶ API
                         API's facilitator: verify signature, nonce, balance, recipient
                         relayer submits the meta transaction (pays the gas)
                         waits until the ft_transfer receipt succeeded on NEAR
agent ◀─ 200 + PDF/CSV + PAYMENT-RESPONSE (NEAR transaction hash)
```

What is delegated to whom, step by step: [docs/delegate-actions.md](docs/delegate-actions.md). Which part runs where and talks to which NEAR endpoint: [docs/components.md](docs/components.md).

This follows the x402 v2 `exact` scheme for NEAR ([spec](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_near.md), package `@x402/near`). The payer needs **USDC but no NEAR**. The API's relayer pays the gas, and the USDC goes straight to the API's NEAR account. If the API fails after the payment was verified (the chain cannot be read, say), it answers with an error and **does not settle**, so the payer is not charged.

You need two testnet accounts: one for the API (receives USDC, relays) and one for the agent (pays).

1. Create them with [near-cli-rs](https://github.com/near/near-cli-rs). The faucet funds each with 10 testnet NEAR, and the keys go to `~/.near-credentials/testnet/`:
   ```bash
   near account create-account sponsor-by-faucet-service my-eigenbeleg-api.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
   ```
   ```bash
   near account create-account sponsor-by-faucet-service my-eigenbeleg-agent.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
   ```
2. Register both with testnet USDC (`3e2210e1…b8af`, Circle's USDC on NEAR testnet), once each:
   ```bash
   near contract call-function as-transaction 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_deposit json-args '{"account_id":"my-eigenbeleg-api.testnet","registration_only":true}' prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as my-eigenbeleg-api.testnet network-config testnet sign-with-legacy-keychain send
   ```
   Then the same for the agent account.
3. Get testnet USDC for the agent from [faucet.circle.com](https://faucet.circle.com) (network NEAR Testnet).
4. `cp .env.example .env`, set `PAY_NETWORKS=near:testnet` and `EIGENBELEG_DEV_TESTNET=1` (testnet payments are a development setting; a production build refuses them, see "Deploy"), `PAY_TO` and `RELAYER_ACCOUNT_ID` to the API account and `AGENT_ACCOUNT_ID` to the agent account. The keys are read from the near-cli keychain, or from `RELAYER_SECRET_KEY` / `AGENT_SECRET_KEY`. They are never printed or logged.
5. Start the API, then run the agent:
   ```bash
   npm run api
   ```
   ```bash
   npm run agent -- --network testnet --address my-eigenbeleg-agent.testnet --month 2026-11 --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt" --document beide
   ```
   You should see the 402 with the price, `Signing the transfer (gasless)`, then `Got … Eigenbeleg(e)`, `Kontoauszug: … reconciled` and `Paid: https://testnet.nearblocks.io/txns/…`. In `out/` are the Eigenbelege, the Kontoauszug, the CSV and a receipt with the NEAR transaction of the payment.

A run like this on 6 Nov 2026: [`Aqxuj1QQ…ynUX`](https://testnet.nearblocks.io/txns/Aqxuj1QQ6zBRyjhxhF24ocb46Dwtag63cjd5TKD8ynUX). The transaction is signed by the API's relayer (`eigenbeleg-api.testnet`) and carries one `Delegate` action. Inside it, the USDC contract logs an `ft_transfer` of 100000 units (0.10 USDC) from `eigenbeleg-agent.testnet` to `eigenbeleg-api.testnet`, and the agent paid no gas. The Eigenbeleg it bought lists the agent account's storage deposit and network fee for November. veraPDF: `PASS 2b`.

`curl -i -X POST localhost:4402/eigenbeleg -H 'content-type: application/json' -d '{…}'` without payment shows the bare `402` and its `PAYMENT-REQUIRED` header (base64 JSON).

**Base and Ethereum.** With `eip155:8453` or `eip155:1` in `PAY_NETWORKS` the 402 also offers USDC on Base and on Ethereum (`@x402/evm`, scheme `exact`): the payer signs an EIP-3009 `transferWithAuthorization` to `PAY_TO_EVM`, and the API's EVM relayer (`EVM_RELAYER_KEY`, a little ETH on each network) submits it and pays the gas. On Ethereum that gas costs more than a cheap document, so `PRICE_EIP155_1` sets Ethereum's own price. The agent pays on these networks with `AGENT_EVM_KEY`.

**PingPay, for mainnet.** With `PAYWALL=ping` the same route sits behind [PingPay Agent Pay](https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator) instead (`@pingpay/agentpay-middleware`): agents pay in USDC on Base or another origin chain, and NEAR Intents settles to the NEAR account set in the Ping dashboard. NEAR Intents has no testnet, so this mode is for mainnet only (minimum about 0.20 USDC).

## In the browser: the web UI

For people, free: the page does **everything in your browser**. It reads the chain from the public data sources itself, fetches the EUR rates, and draws the Eigenbelege, the Kontoauszug and the CSV on your device, with the same code the API runs ([`@eigenbeleg/pipeline`](packages/pipeline)). Nothing goes to a server of ours: not your name, not your address, not your blockchain addresses. It installs as an app (PWA) and runs from any static host. Plan: [#5](https://github.com/Le-Space/eigenbeleg-agent/issues/5); concept: [docs/web-ui.md](docs/web-ui.md).

1. Open **https://eigenbeleg.le-space.de/ui/**. You see what the page makes (an example Eigenbeleg), the form, and below it *Für Agenten* with the price and a prompt to brief an agent; the footer links the guide, `/llms.txt`, the data sources and the source code. German, or English if your browser is set to another language; **English** / **Deutsch** at the top right switches (the PDFs stay German). *Welche Dienste Ihr Browser dabei fragt* lists every host the page will ask and what each learns.

   Locally instead:
   ```bash
   npm run web:build
   ```
   ```bash
   PAYWALL=none npm run api
   ```
   then open http://127.0.0.1:4402/ui/ (the API only serves the files here).
2. Choose the chain and network of **your** payments, enter your addresses and a month or a range, pick the documents (**Eigenbelege**, **Kontoauszug** or **Beide**), and fill in name and postal address (they are printed on the documents and stay in the page; tick *merken* to keep them on this device, and the other *merken* keeps chain, network and addresses). A missing chain: [CONTRIBUTING.md](CONTRIBUTING.md) or eigenbeleg@le-space.de.
3. Click **Lesen und erstellen**. The first time, the page loads its PDF code and fonts (about 1.6 MB, then cached). You see how many Eigenbelege it made and their numbers, the positions, the EUR total, the quantities and, per address, the Kontoauszug's opening and closing balance (✓ when reconciled with the chain).
4. Download **Eigenbelege (PDF/A, n)**, **Kontoauszug <address> (PDF/A)** per address, and **Alle Bewegungen (CSV)**.

Your browser asks NearBlocks and the FastNEAR archival RPC (NEAR), PublicNode and, through our [Akash CORS proxy](deploy/akash-proxy) when it is set up, the Akash Console indexer (Akash), Filfox (Filecoin), the Filecoin Pay index at Goldsky and Blockscout (Filecoin Pay), the Aleph API (Aleph Cloud), and Kraken, CoinGecko and the ECB (rates). They see your IP address and, except the rate services, the addresses you enter. **Ethereum and Base** need your own Alchemy key (free at alchemy.com), entered under *Ethereum und Base* in the form: it goes from your browser to Alchemy only, never to us, and is kept on your device only if you tick its *merken* ([#25](https://github.com/Le-Space/eigenbeleg-agent/issues/25)). Very busy NEAR accounts can hit NearBlocks' free rate limit; the page then says so and you try a shorter period or later, or enter your own NearBlocks key under *NEAR: eigener NearBlocks-Schlüssel*, which goes to NearBlocks only.

For development, `npm run web:dev` serves the page with hot reload. Build settings: `VITE_AKASH_INDEXER` (the Akash proxy's URL), `VITE_PUBLIC_URL` (for the share cards on a static host).

## In the terminal: the local run

The same pipeline from a shell, for free, nothing sent to us: the chain is read from its public data source, the rates from CoinGecko, Kraken and the ECB, the PDFs are drawn here. Name and postal address stay on the machine.

```bash
npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 --preview
```

```bash
npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt" --document beide --out ./out
```

`--preview` prints counts, the EUR total and each Kontoauszug's balances; the full run writes `EB-….pdf`, `KA-….pdf`, `EB-….csv` and `EB-….summary.json` to `--out`. Ethereum and Base work with your own Alchemy key (`--alchemy-key` or `ALCHEMY_KEY`), which goes to Alchemy only. `npm run local -- --help` lists every option; `apps/cli` is the code, `plugin/skills/eigenbeleg-local` the skill that tells an agent how to run it.

## What an Eigenbeleg contains, and why

One Eigenbeleg per transaction, as Belege writes them (`EB-2026-007`, `EB-2026-008`, … counted up from the number you pass):

| On the Eigenbeleg | Why |
| --- | --- |
| Number from **your own range** | The service stores nothing, so you pass the first number yourself. |
| **Payer and issuer**: name, postal address, own payment addresses | You issue it, for your own payments, from your own addresses. |
| The fixed note: *"Eigenbeleg. Für diese Zahlung gibt es keinen Fremdbeleg: Empfänger ist ein Peer-to-Peer-Netzwerk ohne rechnungsstellende Organisation. Ausgestellt vom Zahlenden auf Grundlage der öffentlichen Transaktion …"* | States what kind of document this is. |
| The transaction: date and time (UTC), the **full hash**, **Von** (your address) and **An** (the full recipient address), the explorer link and a **QR code** of it | Anyone can check it from paper. |
| **Every movement** of the transaction (payment, gas; what is not on the Eigenbeleg greyed, with the reason), quantity with all decimals, EUR rate, EUR value | Nothing of the transaction is left out. |
| Amount in EUR (rounded to cents; the exact value below it), "Was wurde bezahlt", "Warum kein Fremdbeleg" | The amount to book and the reason. |
| **Rate source** (the price at 00:00 UTC of the day: CoinGecko, else Kraken's daily open; `@le-space/rates`, the same rule as Le Space Belege) | The rate can be looked up again. |
| "Dies ist keine Rechnung …" and a signature line | It is your document, not ours. |

## What the Kontoauszug contains

One statement per own account and period (`KA-2026-11-01`), like a bank's: the holder's address top left, statement number, period, chain and date top right, then one section per asset (NEAR, USDC, AKT, FIL, …):

- **Kontostand am … (Beginn)**, then every booking: Buchungstag (with time), Vorgang (kind, to or from whom, short hash, the Eigenbeleg's number where there is one), **Soll**, **Haben**, running **Saldo**, EUR value at the day's rate;
- **Summe** of debits and credits, **Kontostand am … (Ende)**;
- **the check**: on NEAR, the balances before and after the period are read from the **archival node** at the exact block, and the closing balance must equal opening balance plus bookings – shown green as *abgestimmt*, or the difference in red. On Akash and Filecoin, whose public nodes keep no old balances, opening and closing balance are derived from today's balance less every movement since, and the statement says so;
- outgoing, incoming and network fees (expense) in EUR.

It says plainly that it was made by the account holder from public chain data and is **no document of a bank**.

**Aleph Cloud credits** get the same layout as a **Verbrauchsauszug** (`VA-2026-08-01`, one per Ethereum address and whole finished month): opening balance, purchases and transfers of credits, the consumption per day and resource (storage in one line, each instance or program in its own, named from its message), closing balance. A *Monatsübersicht* at the top gives the month in sums, as the books take it: consumption per resource and in all, credits bought, transfers in and out, in credits and EUR; the JSON summary has them as `monthly` ([#24](https://github.com/Le-Space/eigenbeleg-agent/issues/24)). The balances are Aleph's balance now less its summary since (derived). Credits have no market rate: each day's consumption is valued at the USD price per credit of the last purchase on or before that day (else Aleph's list price, 1 USD per 1,000,000 credits) and the ECB's USD rate of the day (`@le-space/rates/aleph-credits`); the statement says so. Consumption from a prepaid balance is no single payment, so there is no Eigenbeleg for it; the CSV lists every line with that reason. The **purchase of credits** is one: `document: "eigenbelege"` (or `beide`) gives an Eigenbeleg per purchase in the month, *Kauf von Guthaben (Credits)*, credits × Aleph's USD price per credit at the ECB rate of the day, with the token and chain it was paid with and the paying transaction's hash linked on Etherscan or Basescan; the credits received are on it as the incoming movement ([#23](https://github.com/Le-Space/eigenbeleg-agent/issues/23)).

Both files are **PDF/A-2b** (fonts embedded, sRGB output intent, XMP metadata) for archiving. [veraPDF](https://verapdf.org) checks them with `PASS … 2b`:

```bash
docker run --rm -v "$PWD/out/demo:/data" verapdf/cli:latest --flavour 2b --format text /data/EB-2026-001.pdf /data/KA-2026-11-01.pdf
```

**What goes on it.** By default only payments to the network itself: network fees, and storage deposits to protocol contracts. A transfer to another account may well be to a company that does invoice, so it stays off unless you add it (`includeKinds: ["fee","storage","transfer"]`; each block lists the kinds its chain has as `kinds` in `GET /blocks` – storage deposits exist on NEAR only). Some movements are never on it: transfers between your own addresses, incoming payments, failed transactions (only their fee counts), staking, escrow deposits that are not a final amount yet, and tokens without a trusted price (airdropped spam tokens are common). All of these are in the CSV, with the reason.

**The CSV** has semicolons, decimal commas, UTF-8 with BOM and CRLF line ends, so a German Excel opens it as it is. There is one line per movement: number, position, date, time, chain, network, own address, kind, direction, counterparty, asset, token contract, quantity, rate, EUR value, rate source, hash, explorer link, whether it is on the Eigenbeleg, and the reason when it is not. Cells that a spreadsheet would read as a formula are defused.

## API

| | |
| --- | --- |
| `GET /` | What the service is, the price and how to pay (JSON). A browser (`Accept: text/html`) is redirected to `/ui/` instead; `curl`, `fetch` and agents get the JSON (and a pointer to `/llms.txt`) |
| `GET /blocks` | The building blocks by chain, with version and data source |
| `GET /blocks/<chain>/check` | A live check of that block against public data (cached 10 min) |
| `POST /eigenbeleg` | The Eigenbelege and the Kontoauszug, behind the paywall |
| `POST /eigenbeleg/preview` | Free: the summary (Eigenbeleg numbers, positions, total, Kontoauszug balances) for the same body **without** `payer` (a body with `payer` is refused); 10 per minute per IP |
| `POST /eigenbeleg/subscribe` | A subscription ([#20](https://github.com/Le-Space/eigenbeleg-agent/issues/20)): twelve monthly Kontoauszüge by mail, paid once; the same body with `email` and without `period`. Only where the instance offers mail and subscriptions |
| `POST /eigenbeleg/subscribe/<months>` | The same for 1 to 12 months in advance, at months × the price of one request |
| `GET /eigenbeleg/subscribe/<id>/cancel?token=…` | The link in every subscription mail: deletes the subscription |
| `GET /ui/` | The web UI (a static PWA that talks to none of these routes), when `npm run web:build` has run |
| `GET /health` | `ok`, the paywall's mode, and which build answers: `version`, `commit`, `built` (the commit's instant). `GET /` names the same, `/openapi.json` carries them as `info.version`, `x-commit`, `x-built`. The page's footer shows the same commit: page and API are one image |
| `GET /llms.txt` | For agents: what is sold, the price, the x402 steps and the body, as plain text |
| `GET /openapi.json` | For tools: the API as OpenAPI 3.1, with the body's JSON Schema, this instance's chains and its price (`x-payment-info`). Every 402 of `POST /eigenbeleg` carries the same schema and an example (the x402 `bazaar` extension), so a client learns what to send from the 402 itself |
| `GET /ui/?lang=de`, `GET /ui/?lang=en` | The page in one language under its own address, the text in the markup: for search engines (canonical, `hreflang`, structured data) and for a link someone shares. `/ui/` itself adapts to the reader |
| `GET /robots.txt`, `GET /sitemap.xml` | For crawlers, when the UI is built: what may be read (not the cancel links of subscriptions) and the page's three addresses |

```json
{
  "chain": "near",
  "network": "testnet",
  "addresses": ["my-eigenbeleg-agent.testnet"],
  "period": { "month": "2026-11" },
  "format": "pdf",
  "document": "eigenbelege",
  "payer": { "name": "Wolkenfabrik Hosting GmbH", "address": "Musterstraße 1\n12345 Beispielstadt" },
  "number": "EB-2026-007",
  "statementNumber": "KA-2026-11",
  "includeKinds": ["fee", "storage"],
  "logo": false,
  "chart": true
}
```

`chart` (`true` unless given) draws the diagram above a statement's bookings; `false` leaves it out. `issuerLogo` (optional) is the payer's own logo, a PNG or JPEG file as plain base64 text: drawn top right in the head of every document, fitted into 120 × 40 pt, beside or without the chain's mark (`logo`). At most 512 kB and 2048 pixels a side, at most 6 times as wide as high and twice as high as wide; no SVG, GIF or CMYK; a transparent PNG is laid on white, a JPEG loses its EXIF. It is used for that one answer and neither stored nor logged; the preview and the subscription take none. On the web UI the file is chosen beside name and address and never leaves the browser; on the command line it is `--issuer-logo FILE`. `document` says what you get, and you get only that: `eigenbelege` (the default; one page per transaction), `kontoauszug` (one per address), or `beide` when you ask for both. `format`: `pdf` gives one document as the file (a Kontoauszug as PDF for one address); `json` gives what `document` names – the Eigenbelege as `pdf` (base64), the statements as `kontoauszuegePdf` – plus the CSV and a summary (Eigenbeleg numbers, totals, each statement's balances and whether they reconciled); `csv` gives the CSV. `period` is `{ month }` or `{ from, to }`, at most 92 days, finished days only (a period reaching today ends yesterday). `logo` is accepted (`true` or `false`) but has no effect for now: the chain's mark beside the title waits for `@le-space/eigenbeleg` to draw it again. The request is checked **before** a price is named: a wrong chain, address or period gets a `400`, not a `402`.

**By mail.** With `email` in the body the files also go as attachments to that address once the payment is settled (stable names and subject, for a document management system's inbox); the address is used for that one mail. `language` (`en`, the default, or `de`) is the language of that mail and of the subscription's mails; the documents are German either way. Only where the instance has `SMTP_URL`.

**The subscription** ([#20](https://github.com/Le-Space/eigenbeleg-agent/issues/20)). `POST /eigenbeleg/subscribe` takes the same body with `email` and without `period` (`document` is `kontoauszug` by default; `eigenbelege` or `beide` work too) and sells twelve months at once, at `PRICE_SUBSCRIPTION` or twelve times the price (1.20 USDC at $0.10); `POST /eigenbeleg/subscribe/<months>` sells 1 to 12 months in advance, always at months × the price of one request. From the 2nd of each month the API makes the statement for the month before and mails it; the answer and every mail carry a cancel link that deletes the subscription (no refund of the remaining months). The subscription is the one thing the API keeps: chain, network, addresses, payer, e-mail address and options, one encrypted file each (`SUBSCRIPTION_KEY`, AES-256-GCM) in a volume, until the last statement or the cancellation. A failed run is retried hourly; after three days the subscriber gets a mail about it, once. The agent subscribes with `npm run agent -- --subscribe … --email …` (`--months 3` for three months in advance) and keeps the cancel link in `subscription-<id>.json`.

## The agent

```bash
npm run agent -- --chain near --network mainnet --address some-account.near --month 2026-10 --name "…" --postal "…" --document beide
```

The agent works in five steps:

1. `GET /blocks` and `GET /blocks/<chain>/check`. If there is no block, or the live check fails, it buys nothing and drafts the block or the fix as a PR (`proposals/…`). With `NEARAI_API_KEY` set, it adds notes on data sources from a model on [NEAR AI Cloud](https://docs.near.ai) (private inference), marked as data to check.
2. It pays through x402 with its own NEAR account, never above `AGENT_BUDGET` per payment (spend controls of the x402 client). It signs only the exact transfer the challenge names and needs no NEAR for gas.
3. It checks the work: the PDFs are PDF/A, the CSV has every position and every Eigenbeleg number, and every Kontoauszug the chain could check is reconciled.
4. It writes `<number>.receipt.json` with what it bought, from whom, the price, the NEAR transaction and whether the checks passed.

How it holds its keys: the near-cli keychain or an environment variable, read by the payer only. What it cannot do without you: pay above the budget, pay other assets or networks than configured, open the PR it drafted, or merge anything.

**As a skill.** The same steps as an [Agent Skill](https://agentskills.io) for Claude Code, Codex, Gemini CLI and other agents that read `SKILL.md`: [`plugin/skills/eigenbeleg-api`](plugin/skills/eigenbeleg-api/SKILL.md) buys through the API; [`plugin/skills/eigenbeleg-local`](plugin/skills/eigenbeleg-local/SKILL.md) runs the pipeline on the user's own machine instead, for free and with nothing sent to us ([#29](https://github.com/Le-Space/eigenbeleg-agent/issues/29)). In Claude Code, this repository is a plugin marketplace whose one plugin is the [`plugin/`](plugin) folder (the skills, their README and licence, nothing that installs packages):

```bash
claude plugin marketplace add Le-Space/eigenbeleg-agent
```

```bash
claude plugin install eigenbeleg@le-space
```

Any other agent takes the folders under `plugin/skills/` into its skills directory, or installs them with the [skills.sh](https://skills.sh) CLI, which finds both without any registration on our side:

```bash
npx skills add Le-Space/eigenbeleg-agent
```

The API skill names one host, `eigenbeleg.le-space.de`, tells the agent to read `/llms.txt` first and to preview before it pays, and says plainly that the payer's name and address go to the API for the documents; the local skill names only the chain's data sources. A test in `plugin/test` holds every skill to the format, to those hosts, to no key or address of a real person, and the plugin folder to what [Anthropic's directory](https://claude.com/docs/plugins/pre-submission-checklist) asks.

**On the NEAR AI Agent Market.** Once listed on [market.near.ai](https://market.near.ai) (the listing comes with the mainnet start), the agent can be hired for a price in USDC. `npm run agent:market` (with `MARKET_TOKEN`, the listing's agent token) goes through the awarded jobs once. For each one it starts the job, reads the job from the brief's first ```` ```json ```` block, buys the Eigenbeleg from the API through x402 and submits a Markdown deliverable with the summary, the payment's NEAR transaction and the CSV. A brief without a JSON job gets a question back. The brief is data from a stranger: it is parsed and checked like any API request and never followed as an instruction. So the agent earns on the market and spends on the API, each within its own limits.

## Deploy

The API (and the web UI it serves) runs as one container with a read-only root filesystem. The host needs no git checkout and builds nothing: after the tests on `main` pass, [`image.yml`](.github/workflows/image.yml) publishes `ghcr.io/le-space/eigenbeleg-agent:main` (and a tag per commit), and Watchtower on the host picks it up within 5 minutes. The page's Akash proxy URL is baked in at build time from the repository variable `AKASH_INDEXER` (Settings → Variables; the Worker's URL once [`deploy/akash-proxy`](deploy/akash-proxy) is deployed); unset, the page reads Akash without the Console indexer.

Once, on the host, in a folder of its own:

1. Copy [`deploy/compose.yaml`](deploy/compose.yaml) there as `compose.yaml`, and `.env.example` as `.env`; fill in `.env` (see below; never committed).
2. Run:

```bash
docker network create edge     # once; the reverse proxy (Caddy) is on it
docker compose up -d
```

See: `docker compose ps` lists `eigenbeleg` and `eigenbeleg-watchtower`. After the next merge to `main`, `docker logs eigenbeleg-watchtower` says it found a new image and restarted `eigenbeleg`. To update by hand: `docker compose pull && docker compose up -d`. To go back to an earlier version, set the image to its commit tag (`ghcr.io/le-space/eigenbeleg-agent:<12-char sha>`) and stop Watchtower. To build locally instead: `docker build -t eigenbeleg-api:local .`

Watchtower ([nicholas-fedor/watchtower](https://github.com/nicholas-fedor/watchtower), the maintained fork; the original containrrr project is archived) needs the Docker socket and so can control Docker on the host; it is limited to containers labelled `com.centurylinklabs.watchtower.enable`, here only `eigenbeleg`. The package on ghcr.io must be public (GitHub, package settings) so the host pulls without a login.

`deploy/compose.yaml` runs the service `eigenbeleg` this way:
- read-only root filesystem, `/tmp` as tmpfs, all capabilities dropped, `no-new-privileges`, 256 MB memory;
- as the non-root user `node`, with no published ports;
- only on the external network `edge`, where the proxy reaches it as `eigenbeleg:3000`.

The image holds only the API's production dependencies (no agent, no Playwright) and the web UI, built in a first stage with Vite and served at `/ui/`, and has a `HEALTHCHECK` on `GET /health`.

A Caddy site for it:

```
eigenbeleg.example.com {
	reverse_proxy eigenbeleg:3000
}
```

**Storage.** The API writes nothing to disk and keeps nothing beyond the request. It reads its fonts and colour profile from the image, and the relayer's key file if one is mounted. The only in-memory state is short-lived: the live check of a building block (10 min), the x402 duplicate-settlement guard (until a payment's block window has passed), and the day's EUR rates during one request.

**Environment** (`.env.example` lists them all):

| Variable | Meaning | Secret |
| --- | --- | --- |
| `PAYWALL` | `x402` (x402 `exact`, USDC, on the networks in `PAY_NETWORKS`; `near` is its old name), `ping` (PingPay, mainnet only), `none` (development: free, and says so) | no |
| `PAY_NETWORKS` | where customers may pay, comma-separated: `near:mainnet`, `eip155:8453` (Base), `eip155:1` (Ethereum), and for development `near:testnet`; the 402 offers them all (not which chain is read). No default: it must be set. `PAY_NETWORK` with one network still works | no |
| `TESTNET_PAY_TO`, `TESTNET_RELAYER_ACCOUNT_ID`, `TESTNET_RELAYER_SECRET_KEY`, `TESTNET_NEAR_RPC_URL` | the test route `POST /testnet/eigenbeleg` (testnet data for testnet USDC, production too): its recipient, relayer and RPC, NEAR testnet accounts only; unset: the route is off | no |
| `EIGENBELEG_DEV_TESTNET` | `1`: allow `near:testnet` in `PAY_NETWORKS`. Development and tests only: a production build refuses to start when it is set | no |
| `EIGENBELEG_PRODUCTION` | `1`: treat this process as a production build outside the image (the image is one anyway). It can only switch production on | no |
| `PRICE` | price per request in USDC, e.g. `$0.10`; `PRICE_EIP155_1` etc. set one network's own price (Ethereum's gas costs the relayer more) | no |
| `SMTP_URL`, `MAIL_FROM` | optional: the files by mail when a request asks (`email`); the SMTP account as a URL and the sender. Without them the API offers no mail | **yes** |
| `SUBSCRIPTION_KEY`, `SUBSCRIPTION_DIR` | optional: subscriptions (needs mail). The key (16+ characters) encrypts the one file per subscription in the directory (the compose volume `/var/lib/eigenbeleg`); losing the key loses them. Without the key no subscriptions | **yes** |
| `PRICE_SUBSCRIPTION` | the year's price on `POST /eigenbeleg/subscribe`; default twelve times `PRICE` (per network: `PRICE_SUBSCRIPTION_EIP155_1` etc.). The route per months is always months × `PRICE` | no |
| `PAY_TO_EVM` | the 0x address that receives the USDC on Base and Ethereum | no |
| `EVM_RELAYER_KEY` | 0x private key of the account that submits the payer's EIP-3009 transfer on Base and Ethereum and pays its gas (a little ETH on each) | **yes** |
| `EVM_RPC_EIP155_8453`, `EVM_RPC_EIP155_1` | an RPC per EVM network; else Alchemy with `ALCHEMY_KEY`, else the chain's public RPC | no |
| `PAY_TIMEOUT_SECONDS` | how far ahead a signed payment may expire (default 300; browser wallets such as Meteor sign 200 blocks ahead) | no |
| `PAY_TO` | the NEAR account that receives the USDC; it must be registered with the USDC contract (`storage_deposit`) | no |
| `RELAYER_ACCOUNT_ID` | the NEAR account that submits the payer's signed delegate action and pays its gas; needs a little NEAR | no |
| `RELAYER_SECRET_KEY` | the relayer's full-access key (`ed25519:…`) | **yes** |
| `NEAR_CREDENTIALS_DIR` | instead of `RELAYER_SECRET_KEY`: a directory with `<network>/<RELAYER_ACCOUNT_ID>.json` in the near-cli format (`private_key`), mounted read-only | **yes** (the file) |
| `NEAR_RPC_URL` | the RPC the x402 facilitator uses (default `rpc.<network>.fastnear.com`) | no |
| `PING_API_KEY` | PingPay key (`PAYWALL=ping`); the NEAR recipient is set in the Ping dashboard | **yes** |
| `PING_FACILITATOR_URL`, `PING_AMOUNT_OUT` | PingPay facilitator, destination amount in USDC base units (≥ 200000) | no |
| `NEARBLOCKS_API_KEY` | optional, for NearBlocks' higher rate limits | **yes** |
| `ALCHEMY_KEY` | optional: with it the API also serves Ethereum and Base (ETH, USDC, ALEPH and the gas) through Alchemy; without it, it does not offer them. The key goes to Alchemy only, never into an answer, a document or a log. The web UI never gets this key: there, people enter their own | **yes** |
| `SOURCE_URL` | where users of this instance get its source (AGPL-3.0-or-later section 13); your fork if you changed it | no |
| `PUBLIC_URL` | this instance's public origin, e.g. `https://eigenbeleg.le-space.de`, for the share cards (Open Graph, X) on `/ui/`; unset: taken from the request's Host and `X-Forwarded-Proto` | no |
| `TRUST_PROXY` | behind a proxy: whose `X-Forwarded-*` to trust (Express syntax, e.g. `uniquelocal`), so the x402 resource URL is https | no |
| `HOST`, `PORT` | listen address; the image uses `0.0.0.0:3000` | no |

Testnet vs mainnet: `PAY_NETWORKS` decides where customers pay; the chain data read is chosen per request (`network` in the body). For production: `PAY_NETWORKS=near:mainnet,eip155:8453,eip155:1` with `PAY_TO`, `PAY_TO_EVM` and both relayers.

**Production takes mainnet payments only.** The image is a production build: its last stage writes `apps/api/production` (owned by root, on a read-only filesystem, so `.env` cannot remove it), and with it the API refuses to start, saying why, when `PAY_NETWORKS` is unset or names `near:testnet`, when `PAYWALL=none`, when `NEAR_RPC_URL` or an `EVM_RPC_*` points at a test network or at this machine, or when `EIGENBELEG_DEV_TESTNET` is set. A checkout is a development build: there `near:testnet` needs `EIGENBELEG_DEV_TESTNET=1`. The rules are in [`apps/api/src/release.js`](apps/api/src/release.js), the test that starts the server as a production build with a testnet network and sees it refuse in [`apps/api/test/release.test.js`](apps/api/test/release.test.js). See: `docker logs eigenbeleg` starts with `production (mainnet payments only)`.

**The test route, in production too.** `POST /testnet/eigenbeleg` sells the same documents for testnet USDC, but only for testnet addresses (`"network": "testnet"`; anything else is a `400` before the 402), every PDF marked TESTNET and every file name `TEST-`. It has its own paywall with `near:testnet` only, its own recipient and relayer (`TESTNET_PAY_TO`, `TESTNET_RELAYER_ACCOUNT_ID`, `TESTNET_RELAYER_SECRET_KEY`, `TESTNET_NEAR_RPC_URL`; `….testnet` accounts only), and never shares a 402 with the main route, so testnet USDC never buys a mainnet document. Limits: 30 requests an hour per IP (402s included), periods up to 31 days, 20 mails a day in all (subject `[TESTNET]`), no subscription; `GET /testnet/blocks` too, so a client takes `…/testnet` as its API base. Without `TESTNET_PAY_TO` the route answers 404. It is for developing and testing clients and new features against the running code: no contract, no invoice, no value.

This API is its own x402 facilitator on every network: the NEAR relayer submits delegate actions, the EVM relayer submits `transferWithAuthorization`; no third party sees or settles the payments.

**Being found.** The 402 says what the route takes (the `bazaar` discovery extension), and `/openapi.json` and `/llms.txt` describe the API. A catalogue such as the x402 Bazaar lists a route when a facilitator that keeps one settles a payment for it; because this API settles its own payments, it is in no such catalogue by itself. Listing it there would mean settling through that facilitator, which then sees every payment: a decision, not a setting.

**Outbound hosts** the API calls (HTTPS only):

| Host | For |
| --- | --- |
| `api.nearblocks.io`, `api-testnet.nearblocks.io` | NEAR account history (`@le-space/chains/near`) |
| `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com` | NEAR balances at a block (Kontoauszug), storage refunds |
| `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com` (or `NEAR_RPC_URL`) | x402 verification and settlement: chain state, submitting the relayed payment |
| `api.kraken.com`, `api.coingecko.com` | EUR day rates |
| `akash-rpc.publicnode.com`, `akash-rest.publicnode.com`, `console-api.akash.network` | Akash history and balance (`@le-space/chains/cosmos`) |
| `filfox.info` | Filecoin history and balance (`@le-space/chains/filecoin`) |
| `api.goldsky.com`, `filecoin.blockscout.com` | Filecoin Pay: settlements and balance from the makers' index, what was paid in and taken out from the contract's events (`@le-space/chains/filecoin-pay`) |
| `api2.aleph.im` | Aleph Cloud credit history and balance (`@le-space/chains/aleph`) |
| `data-api.ecb.europa.eu` | EUR per USD, for Aleph credits |
| `eth-mainnet.g.alchemy.com`, `base-mainnet.g.alchemy.com` | only with `ALCHEMY_KEY`: Ethereum and Base history and balances (`@le-space/chains/evm`) |
| `pay.pingpay.io` | only with `PAYWALL=ping` |

The addresses of a request go to the data sources of its chain, and nowhere else. The payer's name and postal address never leave the server: they appear only in the documents sent back. Links in the documents (`nearblocks.io`, `testnet.nearblocks.io`, `mintscan.io`, `filfox.info`, the source repository) are never called by the server.

## Where NEAR comes in

- **Payment rail**: x402 `exact` on NEAR. A NEP-366 meta transaction carries one NEP-141 USDC `ft_transfer`; a relayer pays the gas, so the paying agent holds only USDC. The USDC settles to a plain NEAR account in one transaction, which the receipt links.
- **Data**: the NEAR building block reads any account through the NearBlocks API, both native NEAR and NEP-141 tokens, as exact base units, never through a float.
- **Mainnet path**: PingPay Agent Pay lets agents pay from Base and other chains, settling to NEAR through NEAR Intents.
- **AI**: optional notes from NEAR AI Cloud when the agent drafts a missing block.

## Privacy

The payer's name and address live only for the request. Nothing is stored, and logs hold method, path, status and duration only. There are no request bodies in the logs, and there is no database. The one exception is a **subscription** ([#20](https://github.com/Le-Space/eigenbeleg-agent/issues/20)), which the API has to keep for a year: chain, network, addresses, payer, e-mail address and options, encrypted on disk, deleted after the last statement or on the cancel link; log lines name its id only.

**In the web UI** nothing reaches this API: the page reads, values and draws in the browser, and asks only the data sources it lists (its Content-Security-Policy allows no other host). Name and postal address never leave the page. The free preview takes no name or address at all. Fixtures are public chain data of protocol accounts; every name and address in examples is made up (*Wolkenfabrik Hosting GmbH*, *Musterstraße 1*).

## Building blocks

| Package | What |
| --- | --- |
| [`@le-space/ledger`](https://github.com/Le-Space/belege/tree/main/packages/ledger) (npm) | The booking format `le-space.ledger/1` (one entry per movement, from one own address), decimal arithmetic on strings, bytes without `Buffer`. Shared with Le Space Belege (#6) |
| [`@le-space/chains`](https://github.com/Le-Space/belege/tree/main/packages/chains) (npm) | The readers: NEAR via NearBlocks API v3 and the FastNEAR archival RPC; Akash via the node's `tx_search` plus the Akash Console indexer; Filecoin via Filfox (FIL, USDFC); Aleph Cloud credits via the Aleph API; Ethereum and Base via Alchemy. Also Bitcoin and Nym for Belege |
| [`@le-space/rates`](https://github.com/Le-Space/belege/tree/main/packages/rates) (npm) | EUR per asset and UTC day: the price at 00:00 UTC (CoinGecko, else Kraken's daily open); the ECB reference rate for USD and the rule for Aleph credits (`aleph-credits`) |
| [`@le-space/eigenbeleg`](https://github.com/Le-Space/belege/tree/main/packages/eigenbeleg) (npm) | The Eigenbeleg and the Kontoauszug (Aleph credits as a Verbrauchsauszug): what they say, as PDF/A-2b and CSV; the euro valuation of entries. Shared with Le Space Belege (#6) |
| [`@le-space/pdf`](https://github.com/Le-Space/belege/tree/main/packages/pdf) (npm) | PDF/A-2b on pdf-lib with text in any script (DejaVu, Noto Sans Arabic; DejaVu Sans Mono for hashes): the fonts and the sRGB profile read from files in Node, fetched in a browser (Vite copies them next to the page) |
| `packages/pipeline` | One request start to end (check, read, value, draw), the blocks (what the Eigenbeleg makes of each chain: the fee to the network, an Akash escrow its own kind, which assets are priced; Aleph Cloud credits as a monthly Verbrauchsauszug, `readers/aleph.js`; Ethereum and Base with ETH, USDC and ALEPH, the token Aleph Cloud is paid with, only in the API with `ALCHEMY_KEY`, `keyed.js`; the Akash, Filecoin and EVM readers themselves are `@le-space/chains`), the rate's name on the document, and the list of data sources: the same code in the API and in the web UI; tested in Node and Chromium |
| `apps/api` | The HTTP API and the paywall (`near` / `ping` / `none`) |
| `apps/agent` | The agent, its x402 payer, the PR drafts |
| `apps/web` | The web UI, a PWA (Vite): runs the pipeline in the browser; no wallet, no payment, nothing sent to the API |
| `deploy/akash-proxy` | A Cloudflare Worker: CORS for the Akash Console indexer, the one source a browser cannot read |

A new chain is a reader in `@le-space/chains` (Le-Space/belege, `packages/chains`, AGPL-3.0-or-later) and a block in `packages/pipeline/src/blocks.js` (`{ chain, networks, version, source, read, statement, probe, isAddress }`); `read` returns ledger entries. `npm run agent` for that chain drafts the reader; [CONTRIBUTING.md](CONTRIBUTING.md) says how.

## What was built during the hackathon

Everything in this repository was written for NEAR HACKATHON from 6 Nov 2026 (see the git history), with one exception. The Akash and Filecoin readers (now `@le-space/chains`, shared with [Belege](https://github.com/Le-Space/belege), AGPL-3.0-or-later) are Le Space's own pre-hackathon code (Oct 2026) and count as baseline; the NEAR reader, the booking format and the documents were written here and moved to the shared packages afterwards (#6); the pipeline was written here and stays here. Libraries used: `pdf-lib`, `@noble/hashes`, `@scure/base`, `@pdf-lib/fontkit`, DejaVu fonts, `express`, `@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/near`, `@pingpay/agentpay-middleware`, and a CC0 sRGB profile ([Compact-ICC-Profiles](https://github.com/saucecontrol/Compact-ICC-Profiles)).

## Limits

- NEAR: NEAR that reaches an account through another transaction's inner receipts (a staking pool paying out) is not read yet. Gas is NearBlocks' transaction fee: the tokens burnt by the transaction and its receipts.
- The EUR rate is the day's average for the UTC day, not the minute of the payment.
- Testnet Eigenbelege are marked TESTNET and use the mainnet asset's rate for illustration only.

## Help, support and security

- Help with the page, the API or a document: eigenbeleg@le-space.de; payments, invoices and credits: support@le-space.de. What to send (and what never) is on the page: [Hilfe & Support](https://eigenbeleg.le-space.de/ui/#hilfe).
- Legal matters (invoices, defects, the provider, privacy): contact@le-space.de, as in the [Impressum](https://le-space.de/#impressum).
- Le Space never asks for a seed phrase, a passkey, a private key or a token.
- Security weaknesses: privately to security@le-space.de, never in public. The policy (process, rules, scope) is public at [eigenbeleg.le-space.de/security](https://eigenbeleg.le-space.de/security), from [`apps/api/src/security-page.js`](apps/api/src/security-page.js); [SECURITY.md](SECURITY.md) points there. The API also serves [`/.well-known/security.txt`](https://eigenbeleg.le-space.de/.well-known/security.txt).

## Licence and attribution

[AGPL-3.0-or-later](LICENSE), © 2026 Le Space UG (haftungsbeschränkt), the same licence as [Belege](https://github.com/Le-Space/belege). Every source file says so in its `SPDX-License-Identifier` line.

What this means in practice:

- **Using it** (running the demo, the agent, or generating your own Eigenbelege) puts no duty on you.
- **Changing it** is allowed; changed versions stay under the AGPL.
- **Running it as a service for others**: anyone who runs the API, changed or not, for users over a network must offer those users the complete source of the version they run, changes included (AGPL section 13). The API does this itself. `GET /` answers with a `source` link, set with `SOURCE_URL` (default: this repository). Point it at your fork if you changed something.

**The skill texts** (`plugin/skills/*/SKILL.md`) are prose, not software, and are under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) instead: copy them, change them, put them into your own skills or directories, as long as you name Le Space as the source ([`plugin/LICENSE.md`](plugin/LICENSE.md)). Each one says so in its `license` line. The tests under `plugin/test` and every script the skills point at stay under the AGPL.

Chain data powered by [NearBlocks.io](https://nearblocks.io) APIs. Rates from CoinGecko and Kraken. Third-party parts keep their own licences: DejaVu fonts (Bitstream Vera licence) and the CC0 sRGB profile; the npm dependencies are MIT or Apache-2.0.
