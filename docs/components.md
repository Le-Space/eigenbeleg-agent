# Components: what runs where, and what it talks to

Status: 13 Nov 2026, mainnet payments only (a production build refuses testnet, `apps/api/src/release.js`). Hosted at https://eigenbeleg.le-space.de. The testnet accounts below are from the development setup.
The web UI runs the same pipeline in the browser and talks to none of this (see below and [web-ui.md](web-ui.md)).

## One process on our side

Everything Le Space runs is **one Node.js process** (`apps/api/src/server.js`),
in one container. "Web server", "facilitator" and "relayer" are parts of it,
not separate services:

| Part | Code | Does |
|---|---|---|
| Web server (Express) | `apps/api/src/app.js` | `GET /`, `/llms.txt`, `/blocks`, `/health`; `POST /eigenbeleg/preview` (free); `POST /eigenbeleg` (paid); serves the UI's static files at `/ui/` |
| Pipeline | `packages/pipeline` | checks the request, runs readers, rates and documents; the same package the web UI runs in the browser |
| Paywall (x402 resource server) | `@x402/express`, `apps/api/src/paywall.js` | answers 402 with `PAYMENT-REQUIRED`; on a request with `PAYMENT-SIGNATURE` asks the facilitator to verify, lets the route run, then asks it to settle; sends `PAYMENT-RESPONSE` |
| Facilitator (in-process) | `@x402/near` `exact` facilitator | checks the signed delegate (signature, one `ft_transfer`, token, recipient, amount, nonce, expiry, USDC balance); on settle hands it to the relayer |
| Relayer | `createFacilitatorNearSigner` with `RELAYER_ACCOUNT_ID` and its key | wraps the payer's signed delegate into its own NEAR transaction, signs it with its key, pays the gas, waits for the `ft_transfer` receipt |
| Chain readers | `@le-space/chains` (npm, from Le-Space/belege), wired by `packages/pipeline/src/blocks.js` | read the payments of the addresses on the Eigenbeleg, and the balances for the Kontoauszug |
| Rates | `@le-space/rates` (npm), named by `packages/pipeline/src/rates.js` | EUR per asset and day: the price at 00:00 UTC |
| Documents | `@le-space/eigenbeleg` and `@le-space/pdf` (npm, from Le-Space/belege) | Eigenbelege and Kontoauszug as PDF/A-2b, CSV |
| On-chain payment | `packages/onchain-pay` | a plain payment on a Bitcoin-like chain through ElectrumX: its URI, a signed transaction from a key, sending it, recognising it at the recipient, the connection to a server on the valid chain; the network (Doichain, Bitcoin) is a parameter. For paying in DOI, [#61](https://github.com/Le-Space/eigenbeleg-agent/issues/61) |
| Payment in a chain's own coin | `apps/api/src/onchain.js` | DOI beside USDC on `POST /eigenbeleg`, off without `DOI_PAY_TO`: a step in front of the x402 middleware ties the payer's signed transaction to the request, broadcasts it and answers `202` until its block; the x402 scheme `onchain` takes the step's verdict as verification and marks the payment redeemed on settle. With `DOI_XPUB` instead, a request can ask for an address of its own (derived from the account's extended public key; the server holds no key that spends), which a wallet pays from a QR code and where the payment is found without a txid. Keeps txid, amount, time and a hash of the request per payment, and the orders' addresses. A production build charges the published price (`COIN_PRICES`) |

On testnet the relayer and the recipient are the same account,
`eigenbeleg-api.testnet` (`RELAYER_ACCOUNT_ID` = `PAY_TO`). They can be two
accounts. The relayer's key is the only secret the process holds.

The UI (`apps/web`) is static files served by the same process. It runs in the
user's browser and does the whole run there: it asks the data sources directly
(NearBlocks, FastNEAR, PublicNode, Filfox, Kraken, CoinGecko; Akash's indexer
through the Cloudflare Worker in `deploy/akash-proxy`) and draws the files on
the device. It sends nothing to the API, has no wallet and pays nothing.

## Who connects to what

```
Browser (UI at /ui/, a PWA)
 ├─ same origin ─────────────▶ only the page's own files (HTML, JS, fonts, icons)
 ├─ chain readers ───────────▶ NearBlocks API, FastNEAR archival RPC, PublicNode (Akash), Filfox, Aleph API
 │                          └▶ Cloudflare Worker (deploy/akash-proxy) ─▶ console-api.akash.network
 └─ rates ───────────────────▶ api.kraken.com, api.coingecko.com, data-api.ecb.europa.eu

Agent (x402 client)
 └─ ────────────────────────▶ our API: /llms.txt, /blocks, /eigenbeleg/preview, /eigenbeleg

Our API process
 ├─ facilitator + relayer ───▶ NEAR RPC rpc.testnet.fastnear.com (NEAR_RPC_URL)
 │                              view_account, view_access_key, ft_balance_of, storage_balance_of,
 │                              block height; send_tx (the relayer's transaction) and its outcome
 ├─ chain reader NEAR ───────▶ NearBlocks API (api.nearblocks.io / api-testnet.nearblocks.io): transactions
 │                          └▶ archival RPC (archival-rpc.<network>.fastnear.com): balances for the Kontoauszug
 ├─ chain reader Akash ──────▶ akash-rpc/akash-rest.publicnode.com, console-api.akash.network
 ├─ chain reader Filecoin ───▶ filfox.info
 ├─ Aleph Cloud credits ─────▶ api2.aleph.im
 ├─ Ethereum, Base ──────────▶ eth-mainnet/base-mainnet.g.alchemy.com (only with ALCHEMY_KEY)
 └─ rates ───────────────────▶ api.coingecko.com (price at 00:00 UTC), api.kraken.com (fallback: the daily open), data-api.ecb.europa.eu (USD)
```

Two different "networks" are in play and need not match:

- **The network being read** (`network` in the request): where the payments on
  the Eigenbeleg were made, e.g. NEAR mainnet. Read through NearBlocks and the
  archival RPC.
- **The network being paid on** (`PAY_NETWORK`): where the 0.10 USDC moves,
  now `near:testnet`. Only the facilitator and relayer touch it, through
  `NEAR_RPC_URL`.

## One paid request, step by step

1. The agent posts the request without a payment. The paywall answers 402 with
   price, token, `payTo` and network. Nothing is read from any chain yet.
2. The agent's wallet or key builds and signs the delegate action (one `ft_transfer`). For the
   nonce and the expiry it asks a NEAR RPC itself. The page checks the result.
3. The agent posts again with `PAYMENT-SIGNATURE`.
4. The facilitator verifies against NEAR RPC: access key, nonce, expiry, USDC
   balance, recipient registered. Nothing is sent yet.
5. The route reads the chain (NearBlocks, archival RPC), the rates (CoinGecko, Kraken), and
   draws the files. If that fails: 502, nothing is settled.
6. Settle: the relayer sends one transaction `eigenbeleg-api.testnet →
   payer` with one `Delegate` action through NEAR RPC and waits for the inner
   `ft_transfer` to succeed. If it fails: 402, the files are not sent.
7. The response goes out with the files and `PAYMENT-RESPONSE` (transaction
   hash).

## What each account needs

| Account | Needs |
|---|---|
| Payer (e.g. a Meteor account) | USDC, a registration with the USDC contract, a full-access key in its wallet. **No NEAR.** |
| Relayer (`RELAYER_ACCOUNT_ID`) | a little NEAR for gas; its key in the container (`RELAYER_SECRET_KEY` or a mounted key file) |
| Recipient (`PAY_TO`) | a registration with the USDC contract |

## What is not ours

NEAR RPC, NearBlocks, the archival RPC, Kraken, CoinGecko, the wallets and their
executor scripts are run by others. If NearBlocks rate-limits (429), the preview
and the paid route answer 502 and nothing is charged; `NEARBLOCKS_API_KEY`
raises the limit. If the NEAR RPC is down, verification fails and nothing is
charged.
