# Web UI: everything in the browser

Status: built in `apps/web` (issue #5, 6 Nov 2026). Replaces the first version,
which sent the request to the API and paid 0.10 USDC with a NEAR browser wallet
(x402); that version is in the git history up to `a103ca0`, and its payment flow
lives on in the API for agents ([delegate-actions.md](delegate-actions.md)).

## Goal

People get their Eigenbelege, Kontoauszüge and the CSV **without giving a
server of ours anything**: not their name, not their postal address, not their
blockchain addresses. The page reads the chain, values in EUR and draws the
documents on their device. It is free, installs as an app (PWA), and runs from
any static host.

Agents keep the paid API (x402). Both run **the same code**:
`@eigenbeleg/pipeline` checks the request, reads, values and draws, in Node for
the API and in the browser for the page. Nothing is written twice; the plan to
share these building blocks with Le Space Belege as well is #6.

## User flow

1. **Angaben:** chain and network of the payments, own addresses (up to ten),
   a month or a range (finished days, at most 92), which kinds go on the
   Eigenbeleg, which documents (Eigenbelege, Kontoauszug, both), the first
   numbers (optional), name and postal address of the issuer. *Name und
   Anschrift auf diesem Gerät merken* keeps those two in `localStorage`, only
   when ticked; unticking deletes them. The same for chain, network and the
   addresses with their own *merken*. A note under the addresses says where a
   missing chain goes: a pull request ([CONTRIBUTING.md](../CONTRIBUTING.md))
   or eigenbelege@le-space.de.
2. **Lesen und erstellen:** the page runs `parseRequest` (the API's check: a
   wrong address or period is said here, before anything is read) and then
   `generate`, loaded on this first click with its PDF code and fonts.
3. **Ergebnis:** the summary (Eigenbeleg numbers, positions, total, quantities,
   per address opening → closing balance, ✓ when reconciled with the chain) and
   the downloads: Eigenbelege (PDF/A), Kontoauszug per address (PDF/A), CSV.

German by default, English for a browser set to another language, a switch in
the header (kept in `localStorage` only when clicked). The documents stay German.

## What the browser asks

`dataSources()` in the pipeline lists every host and what it learns; the page
shows the list under *Welche Dienste Ihr Browser dabei fragt*, and the build
makes the Content-Security-Policy's `connect-src` from it, so the page can reach
no other host. A test holds the list against every URL in the packages.

| Host | For | Learns besides the IP |
|---|---|---|
| api.nearblocks.io, api-testnet.nearblocks.io | NEAR transactions | the addresses |
| archival-rpc.mainnet/testnet.fastnear.com | NEAR balances (Kontoauszug) | the addresses |
| akash-rpc / akash-rest.publicnode.com | Akash transactions and balances | the addresses |
| the Akash proxy (`VITE_AKASH_INDEXER`) | older Akash history (Akash Console indexer) | the addresses |
| filfox.info | Filecoin | the addresses |
| api2.aleph.im | Aleph Cloud credits | the addresses |
| eth-mainnet.g.alchemy.com, base-mainnet.g.alchemy.com | Ethereum and Base, only with the person's own Alchemy key ([#25](https://github.com/Le-Space/eigenbeleg-agent/issues/25)) | the addresses, and the key |
| data-api.ecb.europa.eu | EUR per USD (Aleph credits) | the currency only |
| api.coingecko.com, api.kraken.com | EUR rates (the price at 00:00 UTC, `@le-space/rates`) | the currency only |

All of these send `Access-Control-Allow-Origin` (checked 6 Nov 2026), except the
Akash Console indexer; for it, [`deploy/akash-proxy`](../deploy/akash-proxy) is a
Cloudflare Worker that forwards only the two read paths, answers only our
origins and keeps nothing. Without it, Akash is read as far back as the public
node keeps it.

Rate limits are per user now (each browser its own IP). The NEAR readers retry
a 429, a 5xx and a failed fetch with backoff; in a browser a rate-limited
answer without CORS headers arrives as a failed fetch. Very busy NEAR accounts
(thousands of transactions a day) can still hit NearBlocks' free limit; the page
says so.

## Build and serving

- `apps/web`: Vite, plain JS, `base: './'`, so the same `dist/` runs at `/ui/` on
  the API host, on a static host and on an IPFS path gateway.
- The page loads about 135 kB of script (the Ethereum and Base reader is in it since #25); the readers, pdf-lib and fontkit (about 1.2 MB)
  and the fonts (DejaVu 1.7 MB, Noto Sans Arabic 0.2 MB) load on the first
  *Lesen und erstellen*.
- **Ethereum and Base** (#25) are in the chain list but greyed out until the
  person enters their own Alchemy key under *Ethereum und Base*. The key is read
  from the field on each run and handed to the pipeline as a dependency
  (`blocksFor({ alchemyKey })`, `generate(req, { alchemyKey })`), never put in the
  request body, and kept in `localStorage` only with its own *merken*. It goes
  from the browser to Alchemy only; the privacy policy says so.
- **A NearBlocks key of the person's own** (#5), the same way, under *NEAR:
  eigener NearBlocks-Schlüssel* (shown for NEAR only): `generate(req,
  { nearblocksKey })` puts it in the `Authorization` header of the NearBlocks
  requests (NearBlocks allows that header for browsers), for a month beyond
  the free limit per IP.
- `@le-space/pdf` (under `@le-space/eigenbeleg`) takes its fonts and sRGB
  profile through `#load-asset`: files in Node, `fetch` in the browser
  (package.json `imports`, condition `browser`; Vite copies the files next to
  the page with `?url`). The fonts are fetched from the page's own origin, so
  the CSP needs no further host.
- CSP: `default-src 'self'; script-src 'self'; connect-src 'self' <data sources>;
  worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none';
  form-action 'none'` – as `<meta>` in `index.html` and as `dist/csp.txt`, which
  the API sends as a header with `frame-ancestors 'none'`.
- PWA as in Le Space Belege: `manifest.webmanifest`, the signet as icons (192,
  512, maskable 512), `sw.js` caching only the page's own files, never a data
  source's answer. On install it loads every file of the build (about 3.3 MB: the
  page, the PDF code, the fonts; the build writes the list and a cache name from
  the files' hash into `sw.js`), so the installed app starts and draws documents
  offline; reading a chain still needs the network. A new version takes over
  once the page's tabs are closed or reloaded.
- Legal: the privacy policy is in the page (`#datenschutz`, folded; German and
  English in the markup, written for what this page does: served from our
  server without access logs, the data sources, localStorage, the API). The
  Impressum is the one on le-space.de (`#impressum` / `#imprint` open it there),
  so no second copy has to be kept current.
- The API serves `dist/` at `/ui/` (`GET /` sends browsers there) and the share
  cards; `__PUBLIC_URL__` in the share tags is the API's origin, or
  `VITE_PUBLIC_URL` at build time for a static host.

## Tests

- `packages/pipeline/test/browser.test.js`: a recorded NEAR day runs in Node and
  in Chromium (Vite, Playwright); summary, both PDFs and the CSV are byte for
  byte the same.
- `packages/pipeline/test/sources.test.js`: the listed data sources are exactly
  the hosts the packages fetch from.
- `apps/web/test/web.test.js`: the form becomes the request the API would check;
  no wallet, no x402, no call to an API route in the page's code; German and
  English have the same texts.
- `deploy/akash-proxy/test/worker.test.js`: the proxy's paths, origins and
  rate limit.

## Out of scope

- Reading Belege's books or wallets; sharing the building blocks with Belege is
  #6.
- A proxy that reads NearBlocks with our key for everyone (open question 3 in
  #5); the page takes the person's own key instead.
- Paying the API from the page so that our server reads Alchemy for the user:
  that would send the addresses and the payer to our server, which the page
  avoids by design (#25).
