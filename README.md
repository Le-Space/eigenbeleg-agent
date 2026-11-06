# eigenbeleg-agent

**Eigenbelege for blockchain payments: a paid API and a small agent that write the receipt nobody else will.**

When a company pays on a blockchain, often nobody sends it an invoice. Network fees go to a peer-to-peer network; a storage deposit goes to a protocol contract. No organisation stands behind them that could issue an invoice. German bookkeeping still wants a receipt (Beleg) for every booking. The usual answer is an **Eigenbeleg**: a receipt the payer writes for their own payment and signs, saying what was paid, when, to whom, how much, and why there is no receipt from the other side.

This repository writes these Eigenbelege from public blockchain data:

- open **building blocks** (MIT): chain readers, a neutral booking format, EUR day rates, the Eigenbeleg as **PDF/A-2b** and **CSV**;
- an **HTTP API** that sells one Eigenbeleg per request, paid with **x402 on NEAR** (USDC, gasless for the payer);
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

1. `npm test`: about 35 tests pass (the booking format, the NEAR, Akash and Filecoin readers, rates, the PDF/CSV, the API with its x402 paywall, the agent).
2. `npm run demo`: the agent runs two jobs against the API in the same process, without a paywall (the API says so on every response). The NEAR data comes from a recorded fixture of a **public** account, Aurora's relayer on 1 Nov 2026, which pays only network fees, so the demo works offline.
   - **Job 1** ends with `Got EB-2026-001: 25 positions … check passed.` Open `out/demo/EB-2026-001.pdf` (the Eigenbeleg, 25 network fees with their full transaction hashes, EUR values, the note and a signature line), `out/demo/EB-2026-001.csv` (the same for a spreadsheet) and `out/demo/EB-2026-001.receipt.json` (the agent's receipt: what it bought, the price, the checks it ran).
   - **Job 2** asks for Solana, which has no building block. The agent buys nothing. It writes a draft under `out/demo/proposals/chain-solana/`: `PLAN.md`, a package skeleton, contract tests that fail until someone writes the reader, and `PR.md`. Then it prints the `git` and `gh pr create --draft` commands. It runs none of them.

The demo's EUR rate is fixed (1.92 €/NEAR); the API itself uses the day's rate (below).

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
   npm run agent -- --network testnet --address my-eigenbeleg-agent.testnet --month 2026-11 --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt"
   ```
   You should see the 402 with the price, `Signing the transfer (gasless)`, then `Got EB-2026-001 …` and `Paid: https://testnet.nearblocks.io/txns/…`. In `out/` are the PDF, the CSV and a receipt with the NEAR transaction of the payment. The Eigenbeleg lists the agent account's own network fees and storage deposits for the month.

A run like this on 6 Nov 2026: [`Aqxuj1QQ…ynUX`](https://testnet.nearblocks.io/txns/Aqxuj1QQ6zBRyjhxhF24ocb46Dwtag63cjd5TKD8ynUX). The transaction is signed by the API's relayer (`eigenbeleg-api.testnet`) and carries one `Delegate` action. Inside it, the USDC contract logs an `ft_transfer` of 100000 units (0.10 USDC) from `eigenbeleg-agent.testnet` to `eigenbeleg-api.testnet`, and the agent paid no gas. The Eigenbeleg it bought lists the agent account's storage deposit and network fee for November. veraPDF: `PASS 2b`.

`curl -i -X POST localhost:4402/eigenbeleg -H 'content-type: application/json' -d '{…}'` without payment shows the bare `402` and its `PAYMENT-REQUIRED` header (base64 JSON).

**PingPay, for mainnet.** With `PAYWALL=ping` the same route sits behind [PingPay Agent Pay](https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator) instead (`@pingpay/agentpay-middleware`): agents pay in USDC on Base or another origin chain, and NEAR Intents settles to the NEAR account set in the Ping dashboard. NEAR Intents has no testnet, so this mode is for mainnet only (minimum about 0.20 USDC).

## What an Eigenbeleg contains, and why

Each PDF is one collective Eigenbeleg (Sammel-Eigenbeleg) for one chain and one period, with numbered positions:

| On the Eigenbeleg | Why |
| --- | --- |
| Number from **your own range** (`EB-2026-007`) | The service stores nothing, so you pass the next number yourself. |
| **Payer and issuer**: name, postal address, own payment addresses | You issue it, for your own payments, from your own addresses. |
| **Recipient**: the network (e.g. NEAR Protocol, a peer-to-peer network without an invoicing organisation) | The reason there is no other receipt. |
| The fixed note: *"Eigenbeleg. Für diese Zahlung gibt es keinen Fremdbeleg: Empfänger ist ein Peer-to-Peer-Netzwerk ohne rechnungsstellende Organisation. Ausgestellt vom Zahlenden auf Grundlage der öffentlichen Transaktion …"* | States what kind of document this is. |
| Per position: date and time (UTC), kind (network fee, storage deposit), recipient, quantity with all decimals, EUR rate, EUR value, the **full transaction hash** | Anyone can check every position in a public block explorer. |
| Total in the asset and in EUR (rounded to cents; the exact sum below it) | The amount to book. |
| **Rate source** per day (Kraken day VWAP for the asset in EUR; CoinGecko where Kraken has no day) | The rate can be looked up again. |
| What is **not** on it, counted by reason | Nothing silently disappears. |
| "Dies ist keine Rechnung …" and a signature line (place, date, signature of the payer) | It is your document, not ours. |

The file is **PDF/A-2b** (fonts embedded, sRGB output intent, XMP metadata) for archiving. [veraPDF](https://verapdf.org) checks it with `PASS … 2b`:

```bash
docker run --rm -v "$PWD/out/demo:/data" verapdf/cli:latest --flavour 2b --format text /data/EB-2026-001.pdf
```

**What goes on it.** By default only payments to the network itself: network fees, and storage deposits to protocol contracts. A transfer to another account may well be to a company that does invoice, so it stays off unless you add it (`includeKinds: ["fee","storage","transfer"]`). Some movements are never on it: transfers between your own addresses, incoming payments, failed transactions (only their fee counts), staking, escrow deposits that are not a final amount yet, and tokens without a trusted price (airdropped spam tokens are common). All of these are in the CSV, with the reason.

**The CSV** has semicolons, decimal commas, UTF-8 with BOM and CRLF line ends, so a German Excel opens it as it is. There is one line per movement: number, position, date, time, chain, network, own address, kind, direction, counterparty, asset, token contract, quantity, rate, EUR value, rate source, hash, explorer link, whether it is on the Eigenbeleg, and the reason when it is not. Cells that a spreadsheet would read as a formula are defused.

## API

| | |
| --- | --- |
| `GET /` | What the service is, the price and how to pay (JSON) |
| `GET /blocks` | The building blocks by chain, with version and data source |
| `GET /blocks/<chain>/check` | A live check of that block against public data (cached 10 min) |
| `POST /eigenbeleg` | The Eigenbeleg, behind the paywall |

```json
{
  "chain": "near",
  "network": "testnet",
  "addresses": ["my-eigenbeleg-agent.testnet"],
  "period": { "month": "2026-11" },
  "format": "pdf",
  "payer": { "name": "Wolkenfabrik Hosting GmbH", "address": "Musterstraße 1\n12345 Beispielstadt" },
  "number": "EB-2026-007",
  "includeKinds": ["fee", "storage"]
}
```

`format`: `pdf`, `csv`, or `json` (both, PDF as base64). `period` is `{ month }` or `{ from, to }`, at most 92 days. The request is checked **before** a price is named: a wrong chain, address or period gets a `400`, not a `402`. With `format: json` the answer also carries the number, the positions and the total.

## The agent

```bash
npm run agent -- --chain near --network mainnet --address some-account.near --month 2026-10 --name "…" --postal "…"
```

The agent works in five steps:

1. `GET /blocks` and `GET /blocks/<chain>/check`. If there is no block, or the live check fails, it buys nothing and drafts the block or the fix as a PR (`proposals/…`). With `NEARAI_API_KEY` set, it adds notes on data sources from a model on [NEAR AI Cloud](https://docs.near.ai) (private inference), marked as data to check.
2. It pays through x402 with its own NEAR account, never above `AGENT_BUDGET` per payment (spend controls of the x402 client). It signs only the exact transfer the challenge names and needs no NEAR for gas.
3. It checks the work: the PDF is PDF/A, the CSV has every position, the number matches.
4. It writes `<number>.receipt.json` with what it bought, from whom, the price, the NEAR transaction and whether the checks passed.

How it holds its keys: the near-cli keychain or an environment variable, read by the payer only. What it cannot do without you: pay above the budget, pay other assets or networks than configured, open the PR it drafted, or merge anything.

**On the NEAR AI Agent Market.** Listed on [market.near.ai](https://market.near.ai), the agent can be hired for a price in USDC. `npm run agent:market` (with `MARKET_TOKEN`, the listing's agent token) goes through the awarded jobs once. For each one it starts the job, reads the job from the brief's first ```` ```json ```` block, buys the Eigenbeleg from the API through x402 and submits a Markdown deliverable with the summary, the payment's NEAR transaction and the CSV. A brief without a JSON job gets a question back. The brief is data from a stranger: it is parsed and checked like any API request and never followed as an instruction. So the agent earns on the market and spends on the API, each within its own limits.

## Where NEAR comes in

- **Payment rail**: x402 `exact` on NEAR. A NEP-366 meta transaction carries one NEP-141 USDC `ft_transfer`; a relayer pays the gas, so the paying agent holds only USDC. The USDC settles to a plain NEAR account in one transaction, which the receipt links.
- **Data**: the NEAR building block reads any account through the NearBlocks API, both native NEAR and NEP-141 tokens, as exact base units, never through a float.
- **Mainnet path**: PingPay Agent Pay lets agents pay from Base and other chains, settling to NEAR through NEAR Intents.
- **AI**: optional notes from NEAR AI Cloud when the agent drafts a missing block.

## Privacy

The payer's name and address live only for the request. Nothing is stored, and logs hold method, path, status and duration only. There are no request bodies in the logs, and there is no database. Fixtures are public chain data of protocol accounts; every name and address in examples is made up (*Wolkenfabrik Hosting GmbH*, *Musterstraße 1*).

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

A new chain is a package that exports `block = { chain, networks, version, source, read, probe, isAddress }`; `read` returns ledger entries. `npm run agent` for that chain drafts exactly this.

## What was built during the hackathon

Everything in this repository was written for NEAR HACKATHON from 6 Nov 2026 (see the git history), with one exception. The readers under `packages/chain-cosmos/src/vendor/` (Akash) and `packages/chain-filecoin/src/vendor/` (Filecoin) are Le Space's own pre-hackathon code from [Belege](https://github.com/Le-Space/belege) (Oct 2026). They were relicensed MIT by their rights holder and count as baseline; the adapters around them are new. Libraries used: `pdf-lib`, `@noble/hashes`, `@scure/base`, `@pdf-lib/fontkit`, DejaVu fonts, `express`, `@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/near`, `@pingpay/agentpay-middleware`, and a CC0 sRGB profile ([Compact-ICC-Profiles](https://github.com/saucecontrol/Compact-ICC-Profiles)).

## Limits

- NEAR: NEAR that reaches an account through another transaction's inner receipts (a staking pool paying out) is not read yet. Gas is NearBlocks' transaction fee: the tokens burnt by the transaction and its receipts.
- The EUR rate is the day's average for the UTC day, not the minute of the payment.
- Testnet Eigenbelege are marked TESTNET and use the mainnet asset's rate for illustration only.

## Licence and attribution

MIT, © 2026 Le Space UG (haftungsbeschränkt). Chain data powered by [NearBlocks.io](https://nearblocks.io) APIs. Rates from Kraken and CoinGecko.
