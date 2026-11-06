# eigenbeleg-agent

**Eigenbelege and Kontoauszüge for blockchain accounts: a paid API and a small agent that write the receipts and statements nobody else will.**

When a company pays on a blockchain, often nobody sends it an invoice. Network fees go to a peer-to-peer network; a storage deposit goes to a protocol contract. No organisation stands behind them that could issue an invoice. German bookkeeping still wants a receipt (Beleg) for every booking. The usual answer is an **Eigenbeleg**: a receipt the payer writes for their own payment and signs, saying what was paid, when, to whom, how much, and why there is no receipt from the other side.

This repository writes two documents from public blockchain data, both laid out the way a bank lays them out:

- an **Eigenbeleg per transaction**: one receipt with its own number for each payment to the network, with the full hash, who paid whom (full addresses), every movement of the transaction and its explorer link as a QR code;
- a **Kontoauszug** (account statement) per own account and period: opening balance, every booking with debit, credit and running balance, closing balance – **checked against the balance the chain reports** – and the sums a bookkeeper needs, for every chain supported (NEAR, Akash, Filecoin).

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

1. `npm test`: about 50 tests pass (the booking format, the NEAR, Akash and Filecoin readers, rates, the PDF/CSV, the API with its x402 paywall and the free preview, the agent, the web UI's wallet signer).
2. `npm run demo`: the agent runs two jobs against the API in the same process (the first asks for both documents, `document: beide`), without a paywall (the API says so on every response). The NEAR data comes from a recorded fixture of a **public** account, Aurora's relayer on 1 Nov 2026, which pays only network fees, so the demo works offline.
   - **Job 1** ends with `Got 25 Eigenbeleg(e) EB-2026-001 – EB-2026-025 … check passed.` and `Kontoauszug: KA-2026-11-01 (NEAR 25 → 24.98…, reconciled)`. Open:
     - `out/demo/EB-2026-001.pdf`: 25 Eigenbelege, one page per transaction (a network fee each), with hash, Von/An, movements, QR code, amount and a signature line;
     - `out/demo/KA-2026-11-01.pdf`: the Kontoauszug of the day, with opening balance, 25 bookings with running balance, closing balance and the check against the chain (in the demo a recorded archival node answers);
     - `out/demo/EB-2026-001.csv`: every movement for a spreadsheet;
     - `out/demo/EB-2026-001.receipt.json`: the agent's receipt (what it bought, the price, the checks it ran).
   - **Job 2** asks for Solana, which has no building block. The agent buys nothing. It writes a draft under `out/demo/proposals/chain-solana/`: `PLAN.md`, a package skeleton, contract tests that fail until someone writes the reader, and `PR.md`. Then it prints the `git` and `gh pr create --draft` commands. It runs none of them.

The demo's EUR rate is fixed (1.92 €/NEAR); the API itself uses the day's rate (below).

## Try the hosted API (NEAR testnet)

A public instance runs at **https://eigenbeleg.le-space.de** (testnet payments, open source, AGPL).

```bash
curl -s https://eigenbeleg.le-space.de/
```
You should see the service, its price (`$0.10`, USDC on `near:testnet` to `eigenbeleg-api.testnet`), the building blocks (`near`, `akash`, `filecoin`), the licence and the source link.

```bash
curl -s https://eigenbeleg.le-space.de/blocks/near/check
```
You should see `"ok":true`: the NEAR building block, checked against live data.

```bash
curl -si -X POST https://eigenbeleg.le-space.de/eigenbeleg -H 'content-type: application/json' -d '{"chain":"near","network":"mainnet","addresses":["relay.aurora"],"period":{"from":"2026-11-01","to":"2026-11-01"},"payer":{"name":"Wolkenfabrik Hosting GmbH","address":"Musterstraße 1\n12345 Beispielstadt"}}'
```
You should see `HTTP/2 402` and a `payment-required` header (base64 JSON, x402 v2). Before paying, the request was checked: change `chain` to `dogecoin` and you get a `400` instead.

With a funded testnet account (next section), the agent pays it: add `--api https://eigenbeleg.le-space.de` to `npm run agent`. A run like this on 6 Nov 2026: [`73J2MB…bedV`](https://testnet.nearblocks.io/txns/73J2MBmkf9BuBJfK2jsMyqPY1pGDM6PyKtWcp5BnbedV).

## Pay for it with x402 on NEAR testnet

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
4. `cp .env.example .env` and set `PAY_TO` and `RELAYER_ACCOUNT_ID` to the API account and `AGENT_ACCOUNT_ID` to the agent account. The keys are read from the near-cli keychain, or from `RELAYER_SECRET_KEY` / `AGENT_SECRET_KEY`. They are never printed or logged.
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

**PingPay, for mainnet.** With `PAYWALL=ping` the same route sits behind [PingPay Agent Pay](https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator) instead (`@pingpay/agentpay-middleware`): agents pay in USDC on Base or another origin chain, and NEAR Intents settles to the NEAR account set in the Ping dashboard. NEAR Intents has no testnet, so this mode is for mainnet only (minimum about 0.20 USDC).

## In the browser: the web UI

A small page for people: fill in the form, see a free preview, pay 0.10 USDC with a NEAR browser wallet, download the Eigenbelege, the Kontoauszug per address and the CSV. Same API, same price, same rules. Concept: [docs/web-ui.md](docs/web-ui.md); how the wallet's signature pays: [docs/delegate-actions.md](docs/delegate-actions.md).

1. Open **https://eigenbeleg.le-space.de/ui/** (testnet payments). You see the form with the chains from `GET /blocks`, in German, or in English if your browser is set to another language; **English** / **Deutsch** at the top right switches. The PDFs stay German.

   Locally instead: build the page and start the API (steps 1–4 above for the accounts and `.env`), then open http://127.0.0.1:4402/ui/:
   ```bash
   npm run web:build
   ```
   ```bash
   npm run api
   ```
2. Choose the chain and the network of **your** payments, enter your addresses and a month or a range, pick the documents (**Eigenbelege**, the default; **Kontoauszug**; or **Beide**, one price), and click **Vorschau (kostenlos)**. You see how many Eigenbelege it will be and their numbers (`EB-2026-001 – EB-2026-025`), the positions, the EUR total, the quantities, and per address the Kontoauszug's opening and closing balance (✓ when reconciled with the chain). The preview never gets your name or address.
3. Below it you see the price from the API's 402, e.g. `Preis für die Eigenbelege: 0,10 USDC an eigenbeleg-api.testnet (near:testnet)`. Click **Wallet verbinden** and choose Meteor or Intear (the wallets that can sign a delegate action on testnet). Only now does the page load the wallet code, in a sandboxed iframe.
4. Fill in name and postal address, click **Kaufen**, and approve the one USDC transfer in the wallet. The account in the wallet pays; it needs testnet USDC ([faucet.circle.com](https://faucet.circle.com)) but no NEAR for gas.
5. You see the downloads for what you picked: **Eigenbelege (PDF/A, n)** and/or **Kontoauszug <address> (PDF/A)** for each address, and always **Alle Bewegungen (CSV)**, and the NEAR transaction of your payment as a link to testnet NearBlocks.

A run like this on 6 Nov 2026 with the Meteor web wallet: [`DJePEa…YtgM`](https://testnet.nearblocks.io/txns/DJePEaGxPS4ePyjJfa6NJ36wobLKSCpJNaS75wDBtYgM). The payer `cleanwheat4638.testnet` held 1 USDC and **0 NEAR**; it was registered with the USDC contract first (`storage_deposit`, step 2 above, paid by another account). The transaction is signed by the relayer `eigenbeleg-api.testnet` and carries one `Delegate` action with the `ft_transfer` of 0.10 USDC.

No browser wallet? The section *Keine passende Wallet?* shows the `npm run agent` command for the same request.

For development, `npm run web:dev` serves the page with hot reload on Vite's port and passes API calls to `API_URL` (default `http://127.0.0.1:4402`). Without a NearBlocks API key (`NEARBLOCKS_API_KEY`), busy mainnet accounts can hit NearBlocks' rate limit; the preview then says so.

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
| **Rate source** (Kraken day VWAP for the asset in EUR; CoinGecko where Kraken has no day) | The rate can be looked up again. |
| "Dies ist keine Rechnung …" and a signature line | It is your document, not ours. |

## What the Kontoauszug contains

One statement per own account and period (`KA-2026-11-01`), like a bank's: the holder's address top left, statement number, period, chain and date top right, then one section per asset (NEAR, USDC, AKT, FIL, …):

- **Kontostand am … (Beginn)**, then every booking: Buchungstag (with time), Vorgang (kind, to or from whom, short hash, the Eigenbeleg's number where there is one), **Soll**, **Haben**, running **Saldo**, EUR value at the day's rate;
- **Summe** of debits and credits, **Kontostand am … (Ende)**;
- **the check**: on NEAR, the balances before and after the period are read from the **archival node** at the exact block, and the closing balance must equal opening balance plus bookings – shown green as *abgestimmt*, or the difference in red. On Akash and Filecoin, whose public nodes keep no old balances, opening and closing balance are derived from today's balance less every movement since, and the statement says so;
- outgoing, incoming and network fees (expense) in EUR.

It says plainly that it was made by the account holder from public chain data and is **no document of a bank**.

Both files are **PDF/A-2b** (fonts embedded, sRGB output intent, XMP metadata) for archiving. [veraPDF](https://verapdf.org) checks them with `PASS … 2b`:

```bash
docker run --rm -v "$PWD/out/demo:/data" verapdf/cli:latest --flavour 2b --format text /data/EB-2026-001.pdf /data/KA-2026-11-01.pdf
```

**What goes on it.** By default only payments to the network itself: network fees, and storage deposits to protocol contracts. A transfer to another account may well be to a company that does invoice, so it stays off unless you add it (`includeKinds: ["fee","storage","transfer"]`). Some movements are never on it: transfers between your own addresses, incoming payments, failed transactions (only their fee counts), staking, escrow deposits that are not a final amount yet, and tokens without a trusted price (airdropped spam tokens are common). All of these are in the CSV, with the reason.

**The CSV** has semicolons, decimal commas, UTF-8 with BOM and CRLF line ends, so a German Excel opens it as it is. There is one line per movement: number, position, date, time, chain, network, own address, kind, direction, counterparty, asset, token contract, quantity, rate, EUR value, rate source, hash, explorer link, whether it is on the Eigenbeleg, and the reason when it is not. Cells that a spreadsheet would read as a formula are defused.

## API

| | |
| --- | --- |
| `GET /` | What the service is, the price and how to pay (JSON) |
| `GET /blocks` | The building blocks by chain, with version and data source |
| `GET /blocks/<chain>/check` | A live check of that block against public data (cached 10 min) |
| `POST /eigenbeleg` | The Eigenbelege and the Kontoauszug, behind the paywall |
| `POST /eigenbeleg/preview` | Free: the summary (Eigenbeleg numbers, positions, total, Kontoauszug balances) for the same body **without** `payer` (a body with `payer` is refused); 10 per minute per IP |
| `GET /ui/` | The web UI, when `npm run web:build` has run |

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
  "includeKinds": ["fee", "storage"]
}
```

`document` says what you get, and you get only that: `eigenbelege` (the default; one page per transaction), `kontoauszug` (one per address), or `beide` when you ask for both. `format`: `pdf` gives one document as the file (a Kontoauszug as PDF for one address); `json` gives what `document` names – the Eigenbelege as `pdf` (base64), the statements as `kontoauszuegePdf` – plus the CSV and a summary (Eigenbeleg numbers, totals, each statement's balances and whether they reconciled); `csv` gives the CSV. `period` is `{ month }` or `{ from, to }`, at most 92 days, finished days only (a period reaching today ends yesterday). The request is checked **before** a price is named: a wrong chain, address or period gets a `400`, not a `402`.

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

**On the NEAR AI Agent Market.** Listed on [market.near.ai](https://market.near.ai), the agent can be hired for a price in USDC. `npm run agent:market` (with `MARKET_TOKEN`, the listing's agent token) goes through the awarded jobs once. For each one it starts the job, reads the job from the brief's first ```` ```json ```` block, buys the Eigenbeleg from the API through x402 and submits a Markdown deliverable with the summary, the payment's NEAR transaction and the CSV. A brief without a JSON job gets a question back. The brief is data from a stranger: it is parsed and checked like any API request and never followed as an instruction. So the agent earns on the market and spends on the API, each within its own limits.

## Deploy

The API (and the web UI it serves) runs as one container with a read-only root filesystem:

```bash
docker network create edge     # once; the reverse proxy (Caddy) is on it
cp .env.example deploy/.env    # fill in, see below; never committed
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
```

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
| `PAYWALL` | `near` (x402 on NEAR), `ping` (PingPay, mainnet only), `none` (development: free, and says so) | no |
| `PAY_NETWORK` | `near:testnet` or `near:mainnet`: where the payment is made (not which chain is read) | no |
| `PRICE` | price per request in USDC, e.g. `$0.10` | no |
| `PAY_TIMEOUT_SECONDS` | how far ahead a signed payment may expire (default 300; browser wallets such as Meteor sign 200 blocks ahead) | no |
| `PAY_TO` | the NEAR account that receives the USDC; it must be registered with the USDC contract (`storage_deposit`) | no |
| `RELAYER_ACCOUNT_ID` | the NEAR account that submits the payer's signed delegate action and pays its gas; needs a little NEAR | no |
| `RELAYER_SECRET_KEY` | the relayer's full-access key (`ed25519:…`) | **yes** |
| `NEAR_CREDENTIALS_DIR` | instead of `RELAYER_SECRET_KEY`: a directory with `<network>/<RELAYER_ACCOUNT_ID>.json` in the near-cli format (`private_key`), mounted read-only | **yes** (the file) |
| `NEAR_RPC_URL` | the RPC the x402 facilitator uses (default `rpc.<network>.fastnear.com`) | no |
| `PING_API_KEY` | PingPay key (`PAYWALL=ping`); the NEAR recipient is set in the Ping dashboard | **yes** |
| `PING_FACILITATOR_URL`, `PING_AMOUNT_OUT` | PingPay facilitator, destination amount in USDC base units (≥ 200000) | no |
| `NEARBLOCKS_API_KEY` | optional, for NearBlocks' higher rate limits | **yes** |
| `SOURCE_URL` | where users of this instance get its source (AGPL-3.0-or-later section 13); your fork if you changed it | no |
| `TRUST_PROXY` | behind a proxy: whose `X-Forwarded-*` to trust (Express syntax, e.g. `uniquelocal`), so the x402 resource URL is https | no |
| `HOST`, `PORT` | listen address; the image uses `0.0.0.0:3000` | no |

Testnet vs mainnet: `PAY_NETWORK` decides where customers pay; the chain data read is chosen per request (`network` in the body). For the hackathon instance: `PAYWALL=near`, `PAY_NETWORK=near:testnet`.

**Outbound hosts** the API calls (HTTPS only):

| Host | For |
| --- | --- |
| `api.nearblocks.io`, `api-testnet.nearblocks.io` | NEAR account history (chain-near) |
| `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com` | NEAR balances at a block (Kontoauszug), storage refunds |
| `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com` (or `NEAR_RPC_URL`) | x402 verification and settlement: chain state, submitting the relayed payment |
| `api.kraken.com`, `api.coingecko.com` | EUR day rates |
| `akash-rpc.publicnode.com`, `akash-rest.publicnode.com`, `console-api.akash.network` | Akash history and balance (chain-cosmos) |
| `filfox.info` | Filecoin history and balance (chain-filecoin) |
| `pay.pingpay.io` | only with `PAYWALL=ping` |

The addresses of a request go to the data sources of its chain, and nowhere else. The payer's name and postal address never leave the server: they appear only in the documents sent back. Links in the documents (`nearblocks.io`, `testnet.nearblocks.io`, `mintscan.io`, `filfox.info`, the source repository) are never called by the server.

## Where NEAR comes in

- **Payment rail**: x402 `exact` on NEAR. A NEP-366 meta transaction carries one NEP-141 USDC `ft_transfer`; a relayer pays the gas, so the paying agent holds only USDC. The USDC settles to a plain NEAR account in one transaction, which the receipt links.
- **Data**: the NEAR building block reads any account through the NearBlocks API, both native NEAR and NEP-141 tokens, as exact base units, never through a float.
- **Mainnet path**: PingPay Agent Pay lets agents pay from Base and other chains, settling to NEAR through NEAR Intents.
- **AI**: optional notes from NEAR AI Cloud when the agent drafts a missing block.

## Privacy

The payer's name and address live only for the request. Nothing is stored, and logs hold method, path, status and duration only. There are no request bodies in the logs, and there is no database.

**In the web UI**, the page loads only its own files until you click *Wallet verbinden*. Then your browser loads the code of the wallet you pick from that wallet's provider and runs it isolated in an iframe:
- Meteor from `raw.githubusercontent.com` (GitHub);
- Intear from `wallet.intear.tech`.

GitHub or the wallet provider sees your IP address. To sign, the wallet may open its own page (`wallet.meteorwallet.app`, `wallet.intear.tech`). It learns your NEAR account and the one payment you sign, and may talk to NEAR RPC nodes of its choice. Your name and postal address go only to this API, never to the wallet. The UI says this next to the button, before anything is loaded. The free preview takes no name or address at all. Fixtures are public chain data of protocol accounts; every name and address in examples is made up (*Wolkenfabrik Hosting GmbH*, *Musterstraße 1*).

## Building blocks

| Package | What |
| --- | --- |
| `packages/ledger-core` | The neutral booking format `eigenbeleg.ledger/1` (one entry per movement, from one own address), and decimal arithmetic on strings |
| `packages/chain-near` | NEAR via NearBlocks API v3: NEAR sent and received, gas fee per signed transaction, NEP-141 transfers; spam tokens listed but never valued |
| `packages/chain-cosmos` | Akash: node `tx_search` plus the Akash Console indexer for older history; escrow deposits as their own kind |
| `packages/chain-filecoin` | Filecoin via Filfox: FIL sends and receipts, miner tip plus burnt fee as one network fee, USDFC (valued at the USD stablecoin rate) |
| `packages/rates` | EUR per asset and UTC day: Kraken day VWAP, CoinGecko fallback |
| `packages/eigenbeleg` | The document, the PDF/A-2b and the CSV |
| `apps/api` | The HTTP API and the paywall (`near` / `ping` / `none`) |
| `apps/agent` | The agent, its x402 payer, the PR drafts |
| `apps/web` | The web UI (Vite): form, preview, NEAR Connect wallet, x402 payment in the browser |

A new chain is a package (AGPL-3.0-or-later, like the others) that exports `block = { chain, networks, version, source, read, probe, isAddress }`; `read` returns ledger entries. `npm run agent` for that chain drafts exactly this.

## What was built during the hackathon

Everything in this repository was written for NEAR HACKATHON from 6 Nov 2026 (see the git history), with one exception. The readers under `packages/chain-cosmos/src/vendor/` (Akash) and `packages/chain-filecoin/src/vendor/` (Filecoin) are Le Space's own pre-hackathon code from [Belege](https://github.com/Le-Space/belege) (Oct 2026). They carry the same licence as Belege, AGPL-3.0-or-later, and count as baseline; the adapters around them are new. Libraries used: `pdf-lib`, `@noble/hashes`, `@scure/base`, `@pdf-lib/fontkit`, DejaVu fonts, `express`, `@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/near`, `@pingpay/agentpay-middleware`, and a CC0 sRGB profile ([Compact-ICC-Profiles](https://github.com/saucecontrol/Compact-ICC-Profiles)).

## Limits

- NEAR: NEAR that reaches an account through another transaction's inner receipts (a staking pool paying out) is not read yet. Gas is NearBlocks' transaction fee: the tokens burnt by the transaction and its receipts.
- The EUR rate is the day's average for the UTC day, not the minute of the payment.
- Testnet Eigenbelege are marked TESTNET and use the mainnet asset's rate for illustration only.

## Licence and attribution

[AGPL-3.0-or-later](LICENSE), © 2026 Le Space UG (haftungsbeschränkt), the same licence as [Belege](https://github.com/Le-Space/belege). Every source file says so in its `SPDX-License-Identifier` line.

What this means in practice:

- **Using it** (running the demo, the agent, or generating your own Eigenbelege) puts no duty on you.
- **Changing it** is allowed; changed versions stay under the AGPL.
- **Running it as a service for others**: anyone who runs the API, changed or not, for users over a network must offer those users the complete source of the version they run, changes included (AGPL section 13). The API does this itself. `GET /` answers with a `source` link, set with `SOURCE_URL` (default: this repository). Point it at your fork if you changed something.

Chain data powered by [NearBlocks.io](https://nearblocks.io) APIs. Rates from Kraken and CoinGecko. Third-party parts keep their own licences: DejaVu fonts (Bitstream Vera licence) and the CC0 sRGB profile; the npm dependencies are MIT or Apache-2.0.
