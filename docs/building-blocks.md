# Building blocks

Back to the [README](../README.md).

| Package | What |
| --- | --- |
| [`@le-space/ledger`](https://github.com/Le-Space/belege/tree/main/packages/ledger) (npm) | The booking format `le-space.ledger/1` (one entry per movement, from one own address), decimal arithmetic on strings, bytes without `Buffer`. Shared with Le Space Belege (#6) |
| [`@le-space/chains`](https://github.com/Le-Space/belege/tree/main/packages/chains) (npm) | The readers: NEAR via NearBlocks API v3 and the FastNEAR archival RPC; Akash via the node's `tx_search` plus the Akash Console indexer; Filecoin via Filfox (FIL, USDFC); Aleph Cloud credits via the Aleph API; Doichain via public ElectrumX servers; Bitcoin via the Esplora API at mempool.space; Ethereum and Base via Alchemy. Also Nym for Belege |
| [`@le-space/rates`](https://github.com/Le-Space/belege/tree/main/packages/rates) (npm) | EUR per asset and UTC day: the price at 00:00 UTC (CoinGecko, else Kraken's daily open); the ECB reference rate for USD and the rule for Aleph credits (`aleph-credits`); with `currency`, the rate in another currency (× ECB reference rate, USD too; RUB: Bank of Russia), and `perEuro` alone for a reference value in EUR |
| [`@le-space/eigenbeleg`](https://github.com/Le-Space/belege/tree/main/packages/eigenbeleg) (npm) | The self-issued receipt and the account statement (Aleph credits as a usage statement): what they say, as PDF/A-2b and CSV; the euro valuation of entries. Shared with Le Space Belege (#6) |
| [`@le-space/pdf`](https://github.com/Le-Space/belege/tree/main/packages/pdf) (npm) | PDF/A-2b on pdf-lib with text in any script (DejaVu, Noto Sans Arabic; DejaVu Sans Mono for hashes): the fonts and the sRGB profile read from files in Node, fetched in a browser (Vite copies them next to the page) |
| `packages/pipeline` | One request start to end (check, read, value, draw), the blocks (what the self-issued receipt makes of each chain: the fee to the network, an Akash escrow its own kind, which assets are priced; Aleph Cloud credits as a monthly usage statement, `readers/aleph.js`; Ethereum and Base with ETH, USDC and ALEPH, the token Aleph Cloud is paid with, only in the API with `ALCHEMY_KEY`, `keyed.js`; the Akash, Filecoin and EVM readers themselves are `@le-space/chains`), the rate's name on the document, and the list of data sources: the same code in the API and in the web UI; tested in Node and Chromium |
| `apps/api` | The HTTP API and the paywall (`near` / `ping` / `none`) |
| `apps/agent` | The agent, its x402 payer, the PR drafts |
| `apps/web` | The web UI, a PWA (Vite): runs the pipeline in the browser; no wallet, no payment, nothing sent to the API |
| `deploy/akash-proxy` | A Cloudflare Worker: CORS for the Akash Console indexer, the one source a browser cannot read |

A new chain is a reader in `@le-space/chains` (Le-Space/belege, `packages/chains`, AGPL-3.0-or-later) and a block in `packages/pipeline/src/blocks.js` (`{ chain, networks, version, source, read, statement, probe, isAddress }`); `read` returns ledger entries. `npm run agent` for that chain drafts the reader; [CONTRIBUTING.md](../CONTRIBUTING.md) says how.

Which of them runs where, and what each part talks to: [components.md](components.md).
