# Contributing

Thank you for helping. The thing most people want to add is **a chain**: the
page and the API serve NEAR, Akash and Filecoin today, and every other chain
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

A chain is one package, `packages/chain-<name>`, and one line in the pipeline.
Copy the smallest one, [`packages/chain-filecoin`](packages/chain-filecoin),
and keep its shape:

1. **`src/index.js` exports a `block`:**
   ```js
   export const block = {
   	name: '@eigenbeleg/chain-<name>',
   	chain: '<name>',            // the id in requests and the web UI
   	networks: ['mainnet'],      // where payments can be read
   	assets: ['XYZ'],            // what the chain's fees and deposits are paid in
   	source: 'Which API; where the reader comes from',
   	version: '0.1.0',
   	read,                       // ({ account, from, to, fetch }) → ledger entries
   	statement,                  // ({ account, from, to, fetch }) → balances for the Kontoauszug
   	probe,                      // ({ fetch }) → a live check against public data (GET /blocks/<chain>/check)
   	isAddress                   // (string) → boolean, before anything is fetched
   };
   ```
   `read` returns entries in the neutral booking format of
   [`@eigenbeleg/ledger-core`](packages/ledger-core) (`entry(...)`: chain,
   network, account, hash, height, time, type `sent` | `received` | `fee`,
   kind `fee` | `storage` | `transfer` | `call` | …, asset, contract,
   decimals, a signed amount, counterparty, method, memo, success). `statement` gives opening and closing
   balances; where the chain has no archival node, derive them from today's
   balance less the movements since (`derivedStatement`), as Akash and
   Filecoin do, and say so with `method: 'derived'`.
2. **Browser-ready.** No `Buffer`, no `node:*` imports, no code that only runs
   in Node: the same reader runs in the page. Bytes and hashes come from
   `@eigenbeleg/ledger-core/bytes` and `@noble/hashes`. `fetch` is always a
   parameter with `globalThis.fetch` as default, so tests can record and
   replay answers.
3. **Tests from recorded answers,** `test/<name>.test.js`: a recorded day of a
   **public** account (never a person's), with the reader's output checked
   entry by entry; a wrong address refused by `isAddress`; retries where the
   source rate-limits. Tests run offline.
4. **Register the block** in
   [`packages/pipeline/src/blocks.js`](packages/pipeline/src/blocks.js)
   (`BLOCKS`), and **list every host** the reader fetches from in
   [`packages/pipeline/src/sources.js`](packages/pipeline/src/sources.js) with
   what it learns (`addresses` or `assets`): the page shows this list and builds
   its Content-Security-Policy from it, and a test fails when a URL in the
   package is not listed.
5. **Rates.** EUR day rates come from [`packages/rates`](packages/rates)
   (Kraken, then CoinGecko). A new asset needs its Kraken pair or CoinGecko id
   there.
6. **Name the chain for people** in `apps/web/src/main.js` (`CHAIN_NAMES`), the
   explorer link for the documents in the reader, and a line in the README's
   building-blocks table.
7. `npm test`, including the browser test (`packages/pipeline/test/browser.test.js`:
   Node and Chromium give the same bytes). Add your chain to the fixture run
   only if you recorded a public account for it.

If you would rather not write the reader yourself: the agent in
[`apps/agent`](apps/agent) drafts a package skeleton with failing contract
tests for a chain it cannot serve (`npm run demo` shows it for Solana). Open
that draft as a pull request and say what you could not fill in.

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
  (`@eigenbeleg/pipeline`); the chain readers are shared with Le Space Belege
  (#6). Before writing something new, look whether it exists in one of the
  packages.
- Every new file starts with `// SPDX-License-Identifier: AGPL-3.0-or-later`.
  By contributing you agree that your contribution is licensed under the
  AGPL-3.0-or-later, like the rest.
- Commit messages say what changed and why; a pull request says how it was
  tested.

## Where to ask

Issues on GitHub, or eigenbelege@le-space.de.
