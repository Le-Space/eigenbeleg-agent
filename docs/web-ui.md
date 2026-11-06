# Web UI for the Eigenbeleg API: concept

Status: approved with option A (2026-11-06), built in `apps/web`. Testnet only.

## Goal

A person (not an agent) gets an Eigenbeleg for their own blockchain payments in a
browser: fill in a form, see what the Eigenbeleg will hold, pay 0.10 USDC with a
NEAR browser wallet, download the PDF/A and the CSV. Same API, same price, same
rules as for agents. No account, no storage, no tracking.

## User flow

```
1 Form ──▶ 2 Preview (free) ──▶ 3 Connect wallet ──▶ 4 Pay (sign) ──▶ 5 Download
           POST /eigenbeleg/preview   NEAR Connect          POST /eigenbeleg (402 → signature → 200)
```

1. **Form.** Chain (from `GET /blocks`), network (from the chosen block's
   `networks`), own addresses (one per line, up to ten), period (a month, or
   from/to up to 92 days), payer name and postal address, Eigenbeleg number
   (optional, defaults to `EB-YYYY-001`), and which kinds go on it
   (`fee`, `storage`, `transfer`, `call`; default as the API), and which
   documents to buy (`document`: Eigenbelege by default, Kontoauszug, or both;
   one price). The preview follows that choice.
   Validation in the browser mirrors `apps/api/src/request.js`, but the server
   is the authority: its 400 message is shown next to the form.
2. **Preview.** "Vorschau" sends the form **without payer name and address** to
   a new free route `POST /eigenbeleg/preview`. It shows: the Eigenbeleg
   numbers (one per transaction, counting up from the given one), number of positions,
   positions not on it (other kinds), the EUR total, the quantities per asset,
   the period actually used (a period reaching today ends yesterday), and per
   address the Kontoauszug's opening and closing balance and whether it is
   reconciled with the chain. If
   there are zero positions, the UI says so and does not offer to pay.
3. **Connect wallet.** Only after the preview, on an explicit click. Lists the
   wallets that can sign a delegate action on the chosen network (see below).
   The connected account is the **payer of the 0.10 USDC**; it does not have to
   be one of the addresses on the Eigenbeleg.
4. **Pay.** "Eigenbeleg kaufen (0,10 USDC)". The browser sends
   `POST /eigenbeleg` (`format: "json"`, so one payment yields both files),
   gets `402` with `PAYMENT-REQUIRED`, shows amount, asset, recipient and
   network, and asks the wallet to sign one `ft_transfer`. It retries with
   `PAYMENT-SIGNATURE`. The API verifies, generates, settles, answers `200`.
5. **Download.** One button per document asked for: the Eigenbelege (one
   PDF/A, a page per transaction) and/or a Kontoauszug PDF/A per own address,
   and always the CSV of all movements (Blob URLs made in
   the browser from the JSON response; nothing is uploaded anywhere). The NEAR
   transaction hash from `PAYMENT-RESPONSE` is shown as a link to the testnet
   explorer. The page reminds the payer to sign the PDF.

If no wallet can sign (none installed, or the user prefers not to), step 3
shows the **agent CLI command** for exactly this request (built from the form,
without the payer data, which the user adds), so the same Eigenbeleg can be
bought with `npm run agent`.

## Screens

One page, three sections that unfold in order (no router):

- **Anfrage** (form) with a short note: what an Eigenbeleg is, that it is not an
  invoice, that the data is not stored.
- **Vorschau** (preview card): positions, total EUR, quantities, period; a
  "Daten ändern" link back to the form. Any change to the form clears the
  preview, so what is paid for is what was previewed.
- **Bezahlen und herunterladen**: wallet button, payment details from the 402,
  status lines (signing, verifying, settling), then the downloads and the
  transaction link. Errors in plain German ("Zahlung abgelehnt: zu wenig USDC").

German UI text; code and comments in English. No external fonts, images or
scripts from a CDN in the page itself; plain CSS, system fonts.

## The free preview route

`POST /eigenbeleg/preview` (exact path, strict routing as today):

- Same body as `POST /eigenbeleg`, but `payer` is **not accepted** (a body with
  `payer` gets 400, so a client cannot leak it here by habit). Validation by
  `request.js`: a `parseRequest(body, { preview: true })` mode that skips the
  payer checks and ignores `format`.
- Runs the same read and valuation as `generate.js`, but builds no PDF/CSV.
  Returns `{ number, chain, network, period, positions, notOnIt, totalEur, quantities }`.
- No storage, logs without bodies (the existing logger), nothing in headers.
- It costs NearBlocks and rate calls, so it gets a small in-memory limit per IP
  (e.g. 10 per minute; 429 above). No cache of results.

## How the browser pays the x402 challenge

What a delegate action is, who signs and who sends it: [delegate-actions.md](delegate-actions.md).

The browser uses the same x402 client as the agent (`@x402/fetch` with
`ExactNearScheme` from `@x402/near/exact/client`), but with its own
`ClientNearSigner` that asks the wallet instead of holding a key:

```js
createSignedDelegateAction({ paymentRequirements: r }) →
  wallet.signDelegateActions({
    network: 'testnet',
    delegateActions: [{ receiverId: r.asset, actions: [functionCall('ft_transfer',
      { receiver_id: r.payTo, amount: r.amount }, 30 Tgas, 1 yoctoNEAR)] }]
  }) → signedDelegateActions[0]   // base64 Borsh SignedDelegate (NEP-366)
```

The wallet picks the nonce and `max_block_height`. The browser checks the
signed delegate before sending it (`decodeSignedDelegateB64`: one action,
`ft_transfer`, right token, recipient, amount, deposit), and the client's spend
control caps a payment at the shown price.

**One server change is needed.** The facilitator rejects a delegate whose
`max_block_height` lies more than `maxTimeoutSeconds` blocks ahead (1 block ≈ 1
s). The route now allows 120 s. Meteor signs with a TTL of 200 blocks, so its
delegates would fail with `…timeout_window_exceeds_max_timeout`. The route gets
`maxTimeoutSeconds: 300` (configurable, `PAY_TIMEOUT_SECONDS`). The agent is
unaffected (it signs within the window it is given).

The facilitator also requires a **full-access key** (function-call keys are
refused). Browser wallets sign with the account's full-access key, so this fits.

## Which wallets can sign a delegate action

Checked on 2026-11-06 against NEAR Connect (`@hot-labs/near-connect` 0.12.0,
the connector NEAR now recommends over Wallet Selector) and its wallet manifest
(`features.signDelegateActions`) and each wallet's executor script:

| Wallet | Delegate action | Testnet | Note |
|---|---|---|---|
| Meteor Wallet (extension, web) | yes | yes | TTL 200 blocks → needs the 300 s window above |
| Intear Wallet | yes | yes | |
| Ledger (via NEAR Connect) | yes | yes | hardware; untested here |
| near-cli connect | yes | yes | developer tool |
| HOT Wallet | yes | **no** | its executor throws "not supported on testnet" |
| NEAR Mobile | yes | no | mainnet only |
| MyNearWallet, OKX, Nightly, WalletConnect, others | not declared | | not offered |

The UI asks NEAR Connect only for wallets with `signDelegateActions` and the
chosen network. **Testnet target: Meteor and Intear.** If neither works on
testnet in practice, the concept's fallback applies: the UI shows the agent
CLI command, and this document says why.

### Decided: NEAR Connect, loaded on click (option A)

NEAR Connect fetches a manifest and each wallet's executor script (GitHub raw,
`wallet.intear.tech`, …) and runs it in a **sandboxed iframe**. That is remote
code, against the rule "no remote scripts". The options:

- **A (chosen):** use NEAR Connect, but load it only on the "Wallet
  verbinden" click (never on page load), with a manifest copy shipped in this
  repo (`apps/web/src/wallet-manifest.json`: Meteor and Intear only), so no
  remote manifest is fetched. The page itself loads no remote script.

  As built, the CSP of `/ui/` is `script-src 'self' 'nonce-…'` with a fresh
  nonce per response, passed to NEAR Connect (`cspNonce`). The wallet executor
  runs in a `srcdoc` iframe with `sandbox="allow-scripts"` (opaque origin), and
  a `srcdoc` iframe inherits the page's CSP. Executors talk to their own
  backends, so `connect-src` is `'self' https: wss:` rather than a list of
  origins: a tighter list would break a wallet whenever it changes a backend.
  The executor URL itself is the wallet's (for Meteor a `latest` file), so the
  wallet vendor can change that code; this is the trust a user already gives
  their wallet.
- **B:** Wallet Selector (`@near-wallet-selector/*`), whose wallet modules are
  bundled at build time. Fewer moving parts at runtime, but it is in
  maintenance, and delegate support per module would have to be checked again.
- **C:** no wallet in the browser; preview in the UI, payment via the agent CLI
  only.

## Build and serving

- `apps/web`: a minimal **Vite** app (plain JS, no framework). Vite is needed
  because `@x402/fetch`, `@x402/near` and NEAR Connect are npm modules to bundle.
  `npm run web:build` writes `apps/web/dist/`; it is not committed.
- The API serves `apps/web/dist` at **`/ui/`** (exact, strict routing) when the
  folder exists, and `GET /` (JSON) gets a `ui` field pointing there. Same
  origin, so no CORS and the `PAYMENT-*` headers are readable.
- `npm run web:dev` runs Vite with a proxy to the API on `:4402` for development.
- The UI is static: no server-side rendering, no session, no cookies.

## Privacy

- Payer name and address go only to `POST /eigenbeleg`, the paid call, and are
  dropped after the response (as today). The preview refuses a body with `payer`.
- The page itself stores nothing. After the wallet click, NEAR Connect keeps
  the chosen wallet in `localStorage` and the executor code in IndexedDB (its
  own cache). No analytics, no remote fonts, no third-party requests from the
  page before that click.
- To show the price, the page asks `POST /eigenbeleg` once with placeholders
  (`Angebot`) instead of the payer's data; that request stops at the 402. The
  real name and address go only with the signed payment.
- Files are made from the response in the browser and never leave it.
- Logs stay method, path, status, duration.

## Tests

- `apps/api/test`: preview route (valid body → summary without payer; `payer`
  present → 400; invalid body → 400 before any read; rate limit → 429; strict
  path `/eigenbeleg/preview/` → 404), `/ui/` served with the CSP.
- `apps/web/test`: the request built from the form, the delegate check, the CLI
  command builder (node tests, no browser).
- No Playwright: it would add a browser download to CI for one form. Instead
  the form, the preview, the 402 offer and the wallet dialog (Meteor and Intear
  listed; the executor loads under the CSP with its nonce) were checked by hand
  in a browser against the real testnet paywall with recorded chain data.
- CI builds the UI (`npm run web:build`).

## Out of scope

- Mainnet in the UI (later, after testnet works; same code, other network).
- PingPay / NEAR Intents payment in the browser.
- Accounts, history, storing Eigenbelege, e-mail delivery.
- Invoices of any kind, XRechnung, ZUGFeRD (an Eigenbeleg is never an invoice).
- Signing the Eigenbeleg digitally; the payer signs the printed PDF.
- Chains without a building block; the UI only lists `GET /blocks`.
