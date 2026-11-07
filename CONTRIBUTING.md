# Contributing

Thank you for helping. The thing most people want to add is **a chain**: the
page and the API serve NEAR, Akash, Filecoin and Aleph Cloud credits today, and every other chain
needs a reader. This file says how a reader is built, what else is welcome, and
the rules of the house. Issues and pull requests in English, please; questions
in German or English to eigenbelege@le-space.de are fine too.

## Before you start

- Open an issue, or write to eigenbelege@le-space.de, with the chain, its
  networks (mainnet, testnet), the assets people pay fees in, and a public data
  source that answers from a browser (it has to send
  `Access-Control-Allow-Origin`; the web UI runs everything in the browser).
  A chain whose only source blocks browsers can still be served through a
  small CORS proxy like [`deploy/akash-proxy`](deploy/akash-proxy), but say so.
- Node.js 20 or newer. `npm install`, then `npm test` (about 65 tests, offline).

## Adding a chain

The readers are shared with Le Space Belege: they live in
[`@le-space/chains`](https://github.com/Le-Space/belege/tree/main/packages/chains)
(repository `Le-Space/belege`, `packages/chains`, published to npm), together
with the booking format [`@le-space/ledger`](https://github.com/Le-Space/belege/tree/main/packages/ledger)
and the rates [`@le-space/rates`](https://github.com/Le-Space/belege/tree/main/packages/rates).
This repository holds what the Eigenbeleg makes of a chain. So a new chain is
two pull requests, and nothing is written twice:

1. **The reader, in `Le-Space/belege`** (`packages/chains/src/<name>.js`, with
   that package's README): a function that reads a wallet's movements from a
   public source and hands out `WalletEntry` or `LedgerEntry` objects
   (`@le-space/ledger`: chain, network, account, hash, height, time, type
   `sent` | `received` | `fee`, kind `fee` | `storage` | `transfer` | `call` |
   …, asset, contract, decimals, a signed amount, counterparty, memo, success).
   Browser-ready: no `Buffer`, no `node:*`, `fetch` and the endpoints handed
   in; bytes and hashes from `@le-space/ledger/bytes` and `@noble/hashes`.
   Tests from recorded answers of a **public** account (never a person's), in
   Node and Chromium. The NEAR reader (`near.js`) is the example that gives
   ledger entries, balances and a live check (`probe`) directly.
2. **The block, here,** in
   [`packages/pipeline/src/blocks.js`](packages/pipeline/src/blocks.js):
   ```js
   {
   	name: '@le-space/chains/<name>',
   	chain: '<name>',            // the id in requests and the web UI
   	networks: ['mainnet'],      // where payments can be read
   	assets: ['XYZ'],            // what the chain's fees and deposits are paid in
   	source: 'Which API',
   	version: CHAINS_VERSION,
   	read,                       // ({ account, network, from, to, fetch, endpoints }) → ledger entries of the period
   	statement,                  // the entries and the balances before and after the period
   	probe,                      // ({ fetch }) → a live check against public data (GET /blocks/<chain>/check)
   	isAddress                   // (string) → boolean, before anything is fetched
   }
   ```
   Optional: `canonical` (one spelling per account), `documents` (when the
   block gives only some, e.g. `['kontoauszug']`), `period: 'month'` (whole
   finished months only) and `statementPrefix` (instead of `KA`); the Aleph
   block uses all four. A block that needs a key (Ethereum and Base: Alchemy)
   goes in [`packages/pipeline/src/keyed.js`](packages/pipeline/src/keyed.js)
   with `needs: 'alchemyKey'`: it is offered only where the server has the key
   (`blocksFor`), never in the page, and the key reaches its reads as a
   parameter.
   Where the reader gives `WalletEntry` objects, an adapter under
   [`packages/pipeline/src/readers/`](packages/pipeline/src/readers) maps them
   with `fromWalletEntry` and says what the Eigenbeleg reads differently (the
   fee goes to the network, which assets are priced; see `akash.js`). Where the
   chain has no archival node, derive the balances from today's balance less
   the movements since (`derivedStatement`), and say so with `method: 'derived'`.
   Tests in `packages/pipeline/test/readers.test.js`.
3. **List every host** the reader fetches from in
   [`packages/pipeline/src/sources.js`](packages/pipeline/src/sources.js) with
   what it learns (`addresses` or `assets`): the page shows this list and builds
   its Content-Security-Policy from it, and a test holds it against the
   readers' endpoints.
4. **Rates.** The day's EUR rate comes from `@le-space/rates` (the price at
   00:00 UTC: CoinGecko, else Kraken). A new asset needs its CoinGecko id or
   Kraken pair in that package's `RATE_SOURCES`; `priceAs` on the entry says
   which asset an entry is valued as.
5. **Name the chain for people** in `apps/web/src/main.js` (`CHAIN_NAMES`), and
   a line in the README's building-blocks table.
6. `npm test`, including the browser test (`packages/pipeline/test/browser.test.js`:
   Node and Chromium give the same bytes). Add your chain to the fixture run
   only if you recorded a public account for it.

If you would rather not write the reader yourself: the agent in
[`apps/agent`](apps/agent) drafts a reader skeleton with failing contract
tests for a chain it cannot serve (`npm run demo` shows it for Solana). Open
that draft as a pull request on `Le-Space/belege` and say what you could not
fill in.

## Other contributions

- Readers for more documents or formats, fixes, translations of the page
  (the documents themselves stay German: they are for German bookkeeping).
- The page's texts live in `apps/web/src/i18n.js`, German and English, with
  the same keys; a test holds them together.

## Rules of the house

- **No personal data** in the repository: no real names, addresses, keys or
  private accounts in fixtures, tests, examples or screenshots. Examples use
  Wolkenfabrik Hosting GmbH, Musterstraße 1, 12345 Beispielstadt, and public
  accounts.
- **No `innerHTML` with text from a chain or a user**, no remote scripts, fonts
  or trackers in the page.
- **Nothing twice:** the API and the page run the same code
  (`@eigenbeleg/pipeline`); readers, booking format and rates are the
  `@le-space/*` packages shared with Le Space Belege (#6), and a test fails
  when `packages/chain-*`, `ledger-core` or `rates` come back here. Before
  writing something new, look whether it exists in one of the packages.
- Every new file starts with `// SPDX-License-Identifier: AGPL-3.0-or-later`.
  By contributing you agree that your contribution is licensed under the
  AGPL-3.0-or-later, like the rest.
- Commit messages say what changed and why; a pull request says how it was
  tested.

## Where to ask

Issues on GitHub, or eigenbelege@le-space.de.
