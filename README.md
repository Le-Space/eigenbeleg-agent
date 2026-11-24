# eigenbeleg-agent

**Self-issued receipts (*Eigenbelege*) and account statements (*Kontoauszüge*) for blockchain accounts: a paid API and a small agent that write the receipts and statements nobody else will.**

When a company pays on a blockchain, often nobody sends it an invoice. Network fees go to a peer-to-peer network; a storage deposit goes to a protocol contract. No organisation stands behind them that could issue an invoice. German bookkeeping still wants a receipt (Beleg) for every booking. The usual answer is a **self-issued receipt** (*Eigenbeleg*): a receipt the payer writes for their own payment and signs, saying what was paid, when, to whom, how much, and why there is no receipt from the other side.

This repository writes two documents from public blockchain data, both laid out the way a bank lays them out, as **PDF/A-2b** and **CSV** ([what they contain, and why](docs/documents.md)):

- a **self-issued receipt per transaction**: one receipt with its own number for each payment to the network, with the full hash, who paid whom (full addresses), every movement of the transaction and its explorer link as a QR code;
- an **account statement** (*Kontoauszug*) per own account and period: opening balance, every booking with debit, credit and running balance, closing balance – **checked against the balance the chain reports** – and the sums a bookkeeper needs. Above the bookings a small diagram: the balance over the period, or, on a usage statement (*Verbrauchsauszug*: Aleph credits, Filecoin Pay), what was consumed per day and resource.

A self-issued receipt is **never an invoice**, and it is never written for someone else: the payer issues it for their own payments. Whether and up to what amount your tax adviser accepts self-issued receipts is their call.

Built at **NEAR HACKATHON** (Nov 2026) by [Le Space UG](https://le-space.de). Tracks: Real-World Money (main), Agent Economy.

---

## Three ways to use it

**In the browser, free.** Open **https://eigenbeleg.le-space.de/ui/**, choose chain and network, enter your addresses, a month and your name and postal address, and click **Lesen und erstellen**. The page reads, values and draws everything in your browser; nothing goes to a server of ours. → [docs/web-ui.md](docs/web-ui.md)

**The hosted API, paid with x402.** For businesses (§ 14 BGB) and their agents, under the [terms of business](https://eigenbeleg.le-space.de/ui/#agb). A request without payment gets a `402` with the price:

```bash
curl -si -X POST https://eigenbeleg.le-space.de/eigenbeleg -H 'content-type: application/json' -d '{"chain":"near","network":"mainnet","addresses":["relay.aurora"],"period":{"from":"2026-11-01","to":"2026-11-01"},"payer":{"name":"Wolkenfabrik Hosting GmbH","address":"Musterstraße 1\n12345 Beispielstadt"}}'
```

The agent pays it within its budget (`npm run agent -- --api https://eigenbeleg.le-space.de …`). → [docs/api.md](docs/api.md), [docs/x402.md](docs/x402.md), [docs/agent.md](docs/agent.md)

**In the terminal, free.** The same pipeline on your machine; name and postal address stay there:

```bash
npm install
npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 --preview
```

→ [docs/local-run.md](docs/local-run.md). To see it all offline first, with no keys and no wallet: `npm test` and `npm run demo` ([what you should see](docs/agent.md#the-demo-offline-no-keys-no-wallet)).

## Chains and payments

| | |
| --- | --- |
| **Chains read** | NEAR, Akash, Filecoin, Filecoin Pay, Aleph Cloud credits, Doichain, Bitcoin; Ethereum and Base with an Alchemy key ([building blocks](docs/building-blocks.md)) |
| **Paying the API** | x402: USDC on NEAR (gasless for the payer), DOI on Doichain, and USDC on Base and Ethereum where the instance offers them ([docs/x402.md](docs/x402.md)) |
| **Prices** | 0.10 USDC per request on NEAR (and Base), 1.00 USDC on Ethereum, 5 DOI on Doichain; a year's subscription 12 × that, in USDC ([`packages/pipeline/src/prices.js`](packages/pipeline/src/prices.js)) |

It consists of open **building blocks** (AGPL-3.0-or-later: chain readers, a neutral booking format, EUR day rates, the documents), an **HTTP API** that sells them per request, and a minimal **agent** that takes a job, checks the building block is current, pays the API within its budget, checks the result and keeps a receipt of what it bought. For a chain it cannot serve, it drafts the missing building block as a pull request with tests instead of buying anything.

## Documentation

- [docs/documents.md](docs/documents.md): what a self-issued receipt and an account statement contain, and why; currencies, English documents, the CSV.
- [docs/web-ui.md](docs/web-ui.md): the web UI, how to use it and how it is built.
- [docs/local-run.md](docs/local-run.md): the local run in the terminal, with its options.
- [docs/api.md](docs/api.md): the hosted API, every route, the request body, mail and the subscription.
- [docs/x402.md](docs/x402.md): paying with x402 on NEAR, Base and Ethereum, DOI on Doichain, PingPay; your own API on NEAR testnet.
- [docs/delegate-actions.md](docs/delegate-actions.md): the NEP-366 delegate action, who delegates what to whom.
- [docs/agent.md](docs/agent.md): the agent, the skills for Claude Code and other agents, the NEAR AI Agent Market, the offline demo.
- [docs/components.md](docs/components.md): what runs where, and what it talks to.
- [docs/building-blocks.md](docs/building-blocks.md): the packages, and how a new chain comes in.
- [docs/deploy.md](docs/deploy.md): running the API as a container, its environment, the test route, the hosts it calls.
- [docs/launch.md](docs/launch.md): the launch checklist for mainnet payments.
- [docs/privacy.md](docs/privacy.md): what is kept, and which hosts your browser asks.
- [docs/near.md](docs/near.md): where NEAR comes in.
- [docs/hackathon.md](docs/hackathon.md): what was built during the hackathon.
- [docs/limits.md](docs/limits.md): known limits.
- [docs/demo-video.md](docs/demo-video.md): the demo video's script and how it is recorded.
- [CONTRIBUTING.md](CONTRIBUTING.md): adding a chain.

## Privacy

The payer's name and address live only for the request: no database, no request bodies in the logs. The API keeps only what it was asked to keep (a subscription, a preview's logo for 24 hours), encrypted. In the web UI nothing reaches this API at all. → [docs/privacy.md](docs/privacy.md)

## Limits

What is not read yet on NEAR, how exact the EUR rate is, and how testnet receipts are valued: [docs/limits.md](docs/limits.md)

## Help, support and security

- Help with the page, the API or a document: eigenbeleg@le-space.de; payments, invoices and credits: support@le-space.de. What to send (and what never) is on the page: [Hilfe & Support](https://eigenbeleg.le-space.de/ui/#hilfe).
- Legal matters (invoices, defects, the provider, privacy): contact@le-space.de, as in the [Impressum](https://le-space.de/#impressum).
- Le Space never asks for a seed phrase, a passkey, a private key or a token.
- Security weaknesses: privately to security@le-space.de, never in public. The policy (process, rules, scope) is public at [eigenbeleg.le-space.de/security](https://eigenbeleg.le-space.de/security), from [`apps/api/src/security-page.js`](apps/api/src/security-page.js); [SECURITY.md](SECURITY.md) points there. The API also serves [`/.well-known/security.txt`](https://eigenbeleg.le-space.de/.well-known/security.txt).

## Licence and attribution

[AGPL-3.0-or-later](LICENSE), © 2026 Le Space UG (haftungsbeschränkt), the same licence as [Belege](https://github.com/Le-Space/belege). Every source file says so in its `SPDX-License-Identifier` line.

What this means in practice:

- **Using it** (running the demo, the agent, or generating your own self-issued receipts) puts no duty on you.
- **Changing it** is allowed; changed versions stay under the AGPL.
- **Running it as a service for others**: anyone who runs the API, changed or not, for users over a network must offer those users the complete source of the version they run, changes included (AGPL section 13). The API does this itself. `GET /` answers with a `source` link, set with `SOURCE_URL` (default: this repository). Point it at your fork if you changed something.

**The skill texts** (`plugin/skills/*/SKILL.md`) are prose, not software, and are under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) instead: copy them, change them, put them into your own skills or directories, as long as you name Le Space as the source ([`plugin/LICENSE.md`](plugin/LICENSE.md)). Each one says so in its `license` line. The tests under `plugin/test` and every script the skills point at stay under the AGPL.

Chain data powered by [NearBlocks.io](https://nearblocks.io) APIs. Rates from CoinGecko and Kraken. Third-party parts keep their own licences: DejaVu fonts (Bitstream Vera licence) and the CC0 sRGB profile; the npm dependencies are MIT or Apache-2.0.
