# API

Back to the [README](../README.md).

## Try the hosted API

A public instance runs at **https://eigenbeleg.le-space.de** (mainnet payments only: USDC on NEAR and DOI on Doichain, `/llms.txt` says what it takes; open source, AGPL). The paid API is for **businesses only** (§ 14 BGB), under the terms of business at [`/ui/#agb`](https://eigenbeleg.le-space.de/ui/#agb); prices include 19% German VAT, an invoice comes on request. Private persons use the web UI, free. Prices: by the document asked for: the Eigenbelege 0.005 USDC per request on NEAR (and Base), 0.10 USDC on Ethereum, 0.25 DOI on Doichain; the Kontoauszug 0.10 USDC, 1.00 USDC on Ethereum, 5 DOI; both (`beide`) the sum. A year's subscription is 12 × that, in USDC (a Kontoauszug, the default: 1.20 USDC, on Ethereum 12.00 USDC) ([`packages/pipeline/src/prices.js`](../packages/pipeline/src/prices.js), the one list the API, `/llms.txt` and the page use).

```bash
curl -s https://eigenbeleg.le-space.de/
```
You should see the service, its prices per payment network with the recipients, the building blocks (`near`, `akash`, `filecoin`, `doichain`, `bitcoin`, `filecoin-pay`, `aleph`; `ethereum` and `base` where it has an Alchemy key), the licence and the source link.

```bash
curl -s https://eigenbeleg.le-space.de/blocks/near/check
```
You should see `"ok":true`: the NEAR building block, checked against live data.

```bash
curl -si -X POST https://eigenbeleg.le-space.de/eigenbeleg -H 'content-type: application/json' -d '{"chain":"near","network":"mainnet","addresses":["relay.aurora"],"period":{"from":"2026-11-01","to":"2026-11-01"},"payer":{"name":"Wolkenfabrik Hosting GmbH","address":"Musterstraße 1\n12345 Beispielstadt"}}'
```
You should see `HTTP/2 402` and a `payment-required` header (base64 JSON, x402 v2). Before paying, the request was checked: change `chain` to `dogecoin` and you get a `400` instead.

With a mainnet account holding USDC, the agent pays it: add `--api https://eigenbeleg.le-space.de` to `npm run agent` (a real payment; `AGENT_BUDGET` caps it). To try payments without real money, use the test route on the hosted API: `--api https://eigenbeleg.le-space.de/testnet --network testnet` pays in testnet USDC for testnet addresses only ([the test route](deploy.md#the-test-route-in-production-too)), or run your own API on testnet ([x402.md](x402.md#your-own-api-on-near-testnet)).

## Routes

| | |
| --- | --- |
| `GET /` | What the service is, the price and how to pay (JSON). A browser (`Accept: text/html`) is redirected to `/ui/` instead; `curl`, `fetch` and agents get the JSON (and a pointer to `/llms.txt`) |
| `GET /blocks` | The building blocks by chain, with version and data source |
| `GET /blocks/<chain>/check` | A live check of that block against public data (cached 10 min) |
| `POST /eigenbeleg` | The self-issued receipts and the account statement, behind the paywall |
| `POST /eigenbeleg/preview` | Free: the summary (self-issued receipt numbers, positions, total, account statement balances) for the same body **without** `payer` (a body with `payer` is refused); 10 per minute per IP |
| `POST /eigenbeleg/subscribe` | A subscription ([#20](https://github.com/Le-Space/eigenbeleg-agent/issues/20)): twelve monthly account statements by mail, paid once; the same body with `email` and without `period`. Only where the instance offers mail and subscriptions |
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

## The request body

`chart` (`true` unless given) draws the diagram above a statement's bookings; `false` leaves it out. `issuerLogo` (optional) is the payer's own logo, a PNG or JPEG file as plain base64 text: drawn top right in the head of every self-issued receipt as a letterhead, fitted into 200 × 70 pt, beside or without the chain's mark (`logo`); an account statement or usage statement carries none (`@le-space/eigenbeleg` 0.6.0). At most 512 kB and 2048 pixels a side, at most 6 times as wide as high and twice as high as wide; no SVG, GIF or CMYK; a transparent PNG is laid on white, a JPEG loses its EXIF. It is never logged and is used for that one answer; the preview checks it and draws nothing. A subscription with self-issued receipts (`document` `eigenbelege` or `beide`) keeps it, encrypted with its other details, until the last statement or the cancellation; one of statements alone keeps none, as no statement draws it. A picture sent with the preview is kept for 24 hours where the instance has `LOGO_DIR` (or `SUBSCRIPTION_DIR`): the preview answers with `issuerLogoId` and `issuerLogoUntil`, and the paid request or the subscription takes `issuerLogoId` instead of the picture. The file is encrypted with a key made from that id, and an hourly sweep deletes it after a day. On the web UI the file is chosen beside name and address and never leaves the browser; on the command line it is `--issuer-logo FILE`. `document` says what you get, and you get only that: `eigenbelege` (the default; one page per transaction), `kontoauszug` (one per address), or `beide` when you ask for both. `format`: `pdf` gives one document as the file (an account statement as PDF for one address); `json` gives what `document` names – the self-issued receipts as `pdf` (base64), the statements as `kontoauszuegePdf` – plus the CSV and a summary (self-issued receipt numbers, totals, each statement's balances and whether they reconciled); `csv` gives the CSV. `period` is `{ month }` or `{ from, to }`, at most 92 days, finished days only (a period reaching today ends yesterday). `logo` (`false` unless given) draws the chain's mark beside the title: very small on a self-issued receipt, larger on an account statement or usage statement (NEAR, Akash, Filecoin, Aleph; `@le-space/eigenbeleg` 0.6.0). The request is checked **before** a price is named: a wrong chain, address or period gets a `400`, not a `402`.

## By mail

With `email` in the body the files also go as attachments to that address once the payment is settled (stable names and subject, for a document management system's inbox); the address is used for that one mail. `language` (`en`, the default, or `de`) is the language of that mail and of the subscription's mails; the documents' own is `documentLanguage` (`de`, the default, or `en`). Only where the instance has `SMTP_URL`.

## The subscription

[#20](https://github.com/Le-Space/eigenbeleg-agent/issues/20): `POST /eigenbeleg/subscribe` takes the same body with `email` and without `period` (`document` is `kontoauszug` by default; `eigenbelege` or `beide` work too) and sells twelve months at once, at `PRICE_SUBSCRIPTION` or twelve times the price of the document (1.20 USDC for a Kontoauszug at $0.10, 0.06 USDC for the Eigenbelege); `POST /eigenbeleg/subscribe/<months>` sells 1 to 12 months in advance, always at months × the price of one request. From the 2nd of each month the API makes the statement for the month before and mails it; the answer and every mail carry a cancel link that deletes the subscription (no refund of the remaining months). The subscription is the one thing the API keeps: chain, network, addresses, payer, e-mail address and options, one encrypted file each (`SUBSCRIPTION_KEY`, AES-256-GCM) in a volume, until the last statement or the cancellation. A failed run is retried hourly; after three days the subscriber gets a mail about it, once. The agent subscribes with `npm run agent -- --subscribe … --email …` (`--months 3` for three months in advance) and keeps the cancel link in `subscription-<id>.json`.
