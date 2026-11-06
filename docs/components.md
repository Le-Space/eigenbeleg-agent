# Components: what runs where, and what it talks to

Status: 6 Nov 2026, testnet payments. Hosted at https://eigenbeleg.le-space.de.

## One process on our side

Everything Le Space runs is **one Node.js process** (`apps/api/src/server.js`),
in one container. "Web server", "facilitator" and "relayer" are parts of it,
not separate services:

| Part | Code | Does |
|---|---|---|
| Web server (Express) | `apps/api/src/app.js` | `GET /`, `/blocks`, `/health`; `POST /eigenbeleg/preview` (free); `POST /eigenbeleg` (paid); serves the UI at `/ui/` |
| Paywall (x402 resource server) | `@x402/express`, `apps/api/src/paywall.js` | answers 402 with `PAYMENT-REQUIRED`; on a request with `PAYMENT-SIGNATURE` asks the facilitator to verify, lets the route run, then asks it to settle; sends `PAYMENT-RESPONSE` |
| Facilitator (in-process) | `@x402/near` `exact` facilitator | checks the signed delegate (signature, one `ft_transfer`, token, recipient, amount, nonce, expiry, USDC balance); on settle hands it to the relayer |
| Relayer | `createFacilitatorNearSigner` with `RELAYER_ACCOUNT_ID` and its key | wraps the payer's signed delegate into its own NEAR transaction, signs it with its key, pays the gas, waits for the `ft_transfer` receipt |
| Chain readers | `packages/chain-*` | read the payments of the addresses on the Eigenbeleg, and the balances for the Kontoauszug |
| Rates | `packages/rates` | EUR per asset and day |
| Documents | `packages/eigenbeleg` | Eigenbelege and Kontoauszug as PDF/A-2b, CSV |

On testnet the relayer and the recipient are the same account,
`eigenbeleg-api.testnet` (`RELAYER_ACCOUNT_ID` = `PAY_TO`). They can be two
accounts. The relayer's key is the only secret the process holds.

The UI (`apps/web`) is static files served by the same process. It runs in the
user's browser.

## Who connects to what

```
Browser (UI at /ui/)
 ├─ same origin ─────────────▶ our API: /blocks, /eigenbeleg/preview, /eigenbeleg
 └─ after "Wallet verbinden"
     NEAR Connect ─ loads ───▶ wallet executor script (Meteor: raw.githubusercontent.com; Intear: wallet.intear.tech)
     wallet (Meteor) ────────▶ its own servers and a NEAR RPC: block height, access-key nonce
                               (the wallet signs; it sends nothing to the chain itself)

Our API process
 ├─ facilitator + relayer ───▶ NEAR RPC rpc.testnet.fastnear.com (NEAR_RPC_URL)
 │                              view_account, view_access_key, ft_balance_of, storage_balance_of,
 │                              block height; send_tx (the relayer's transaction) and its outcome
 ├─ chain reader NEAR ───────▶ NearBlocks API (api.nearblocks.io / api-testnet.nearblocks.io): transactions
 │                          └▶ archival RPC (archival-rpc.<network>.fastnear.com): balances for the Kontoauszug
 ├─ chain reader Akash ──────▶ akash-rpc/akash-rest.publicnode.com, console-api.akash.network
 ├─ chain reader Filecoin ───▶ filfox.info
 └─ rates ───────────────────▶ api.kraken.com (VWAP of the day), api.coingecko.com (fallback)
```

Two different "networks" are in play and need not match:

- **The network being read** (`network` in the request): where the payments on
  the Eigenbeleg were made, e.g. NEAR mainnet. Read through NearBlocks and the
  archival RPC.
- **The network being paid on** (`PAY_NETWORK`): where the 0.10 USDC moves,
  now `near:testnet`. Only the facilitator and relayer touch it, through
  `NEAR_RPC_URL`.

## One paid request, step by step

1. The browser posts the request without a payment. The paywall answers 402 with
   price, token, `payTo` and network. Nothing is read from any chain yet.
2. The wallet builds and signs the delegate action (one `ft_transfer`). For the
   nonce and the expiry it asks a NEAR RPC itself. The page checks the result.
3. The browser posts again with `PAYMENT-SIGNATURE`.
4. The facilitator verifies against NEAR RPC: access key, nonce, expiry, USDC
   balance, recipient registered. Nothing is sent yet.
5. The route reads the chain (NearBlocks, archival RPC), the rates (Kraken), and
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
