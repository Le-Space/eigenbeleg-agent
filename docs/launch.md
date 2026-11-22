# Launch checklist: mainnet payments

Launch: **Saturday, 14 November 2026**, the last day of the NEAR hackathon, where the agent is
registered. From then on the hosted API at https://eigenbeleg.le-space.de takes **mainnet
payments only**, in real USDC. The web UI stays free and talks to no server of ours.

Who: **Nico** does everything that touches keys, funds, accounts, the host and legal sign-off.
Code and docs come as pull requests. No key, secret or customer data goes into the repository,
an issue, a PR or a chat.

## Where it runs

| Part | Where | Deployed how |
| --- | --- | --- |
| API + web UI (`/ui/`) | one Docker container `eigenbeleg` on Le Space's host, behind Caddy, network `edge` | `ghcr.io/le-space/eigenbeleg-agent:main`, built by `.github/workflows/image.yml` after the tests on `main` pass; Watchtower pulls it within 5 minutes ([`deploy/compose.yaml`](../deploy/compose.yaml)) |
| Settings | `.env` next to `compose.yaml` on the host | by hand; never committed |
| Subscriptions | Docker volume `subscriptions` (`/var/lib/eigenbeleg`), encrypted with `SUBSCRIPTION_KEY` | with the container |
| A preview's logo | the same volume, `logos/` (`LOGO_DIR`): encrypted with a key made from its id, deleted after 24 hours | with the container |
| Akash CORS proxy | Cloudflare Worker ([`deploy/akash-proxy`](../deploy/akash-proxy)) | **not deployed yet**; not needed for the launch (the page reads Akash without it, as far back as the public node keeps) |

The image is a production build: it refuses to start with a testnet payment network,
`PAYWALL=none`, a test RPC, the development flag or prices other than the published ones
([`apps/api/src/release.js`](../apps/api/src/release.js), [#43](https://github.com/Le-Space/eigenbeleg-agent/pull/43), [#44](https://github.com/Le-Space/eigenbeleg-agent/pull/44)).

## Before the launch

### 1. Code (PRs)

- [ ] #43 mainnet only, reviewed. **Merge only after step 2**: with the old `.env` (`near:testnet`) the new image refuses to start, and `/ui/` goes down with it.
- [ ] #44 one price list, page without testnet, reviewed (stacked on #43).
- [ ] Legal texts PR (step 5) reviewed.
- [ ] CI green on `main` after each merge; the `image` workflow published a new `:main` and a `:<12-char sha>` tag.

### 2. Payment settings on the host (Nico)

Decide which networks to take: NEAR (`near:mainnet`), Base (`eip155:8453`), Ethereum (`eip155:1`).
Each needs its recipient and a relayer that pays the gas. Then, in `.env` on the host:

- [ ] `PAYWALL=x402`
- [ ] `PAY_NETWORKS=near:mainnet,eip155:8453` (and `eip155:1` if Ethereum is wanted)
- [ ] no `PRICE`, `PRICE_*`, `PRICE_SUBSCRIPTION*` lines (or exactly the published values); no `EIGENBELEG_DEV_TESTNET`; no `NEAR_RPC_URL` / `EVM_RPC_*` pointing at a testnet
- [ ] **NEAR:** `PAY_TO` = the mainnet account that receives the USDC; it is registered with the USDC contract `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` (`storage_deposit`)
- [ ] **NEAR:** `RELAYER_ACCOUNT_ID` = a mainnet account with a little NEAR for gas (a few NEAR last for many payments); its key as `RELAYER_SECRET_KEY` in `.env`, or its near-cli key file mounted read-only (`compose.yaml`, `NEAR_CREDENTIALS_DIR`). Relayer and recipient may be one account; two is safer (the hot key then holds no income)
- [ ] **Base / Ethereum:** `PAY_TO_EVM` = the 0x address that receives the USDC (ideally a hardware or multisig wallet; it never signs here)
- [ ] **Base / Ethereum:** `EVM_RELAYER_KEY` = the key of a separate hot account holding only gas ETH on each network used; `ALCHEMY_KEY` or `EVM_RPC_EIP155_*` for a reliable RPC
- [ ] `TRUST_PROXY` set for Caddy (so the 402 names the `https://` URL); `PUBLIC_URL=https://eigenbeleg.le-space.de`
- [ ] `SOURCE_URL` is the Le-Space repository
- [ ] the data volume belongs to the API's user: `docker exec eigenbeleg ls -ld /var/lib/eigenbeleg` shows `node node`. A volume created by an image before this check (root) needs, once: `chown 1000:1000 /var/lib/docker/volumes/deploy_subscriptions/_data`. Otherwise subscriptions, logos and DOI orders fail with EACCES (a 500)
- [ ] `docker compose pull && docker compose up -d`, then `docker logs eigenbeleg` shows `production (mainnet payments only)` and the paywall with the mainnet networks. If it shows `eigenbeleg API not started: …`, the reason follows; fix `.env` and start again

### 3. Mail and subscriptions (Nico)

- [ ] `SMTP_URL` (smtps://…, password only in `.env`) and `MAIL_FROM` with a sender of the le-space.de domain; SPF, DKIM and DMARC of that domain cover the mail server
- [ ] a test mail: a free request is not possible on production, so check the SMTP account from the host (`swaks` or the provider's test) or run one paid request with `email` in step 7
- [ ] `SUBSCRIPTION_KEY` (16+ characters, random) set and **kept in the password manager**: losing it loses every subscription; the volume `subscriptions` is in the host's backup
- [ ] the first statements go out on 2 December 2026 (for November); check the logs that day

### 4. Domain, TLS, host

- [ ] `eigenbeleg.le-space.de` points at the host; Caddy serves it with a valid certificate (`curl -sI https://eigenbeleg.le-space.de/health` → `200`, no certificate warning)
- [ ] the ghcr.io package is public (the host pulls without login)
- [ ] the host's own updates and disk space are fine; the volume `subscriptions` is backed up

### 5. Legal: a paid service of Le Space UG (Nico signs off)

- [ ] **Terms (AGB / Nutzungsbedingungen)** for the API and the subscription: what is sold (documents built from public chain data, no tax advice, no guarantee a tax office accepts them), price and payment in USDC, delivery (the response itself; mail), liability limits, no refund of remaining subscription months, governing law; German, with English. Draft in a PR; checked by Nico or a lawyer before it goes live
- [ ] **Right of withdrawal** for consumers: digital content delivered at once, so the request states that the buyer agrees to immediate delivery and loses the right of withdrawal (§ 356 Abs. 5 BGB); decide whether the API is offered to businesses only (simpler) or to consumers too
- [ ] **Privacy policy:** section 6 says the payment is a NEAR transaction; it can now be on Base or Ethereum too, and the paying address is public on that chain. Add the relayers' RPC providers (Alchemy) for payments. Name the retention of payment records for bookkeeping (§ 147 AO, 10 years: transaction hash, amount, date; no name)
- [ ] **Impressum:** linked from the page (le-space.de) and named in `/llms.txt`
- [ ] **Bookkeeping on our side:** income in USDC is booked at the day's EUR rate; the Eigenbeleg of our own incoming payments can come from this very tool. VAT on digital services to consumers in other EU countries (OSS) – ask the tax adviser whether that applies at these amounts
- [ ] the terms are linked from the page, from `/llms.txt` and from the 402's `resource.description` or `GET /`

### 6. Monitoring and alerts

- [ ] an uptime check on `https://eigenbeleg.le-space.de/health` every few minutes with an alert to Nico (e.g. Uptime Kuma on another host, or a free external checker)
- [ ] **relayer gas balance:** an alert when the NEAR relayer has less than 1 NEAR, or an EVM relayer less than the gas of ~50 transfers. An empty relayer means every payment fails at settlement (the customer is not charged, but gets nothing)
- [ ] the `PAY_TO` balances grow with each sale (a weekly look is enough at the start)
- [ ] `docker logs eigenbeleg` has no personal data by design; check after the first paid request that this is so

### 7. The first real payment (Nico)

- [ ] `curl -s https://eigenbeleg.le-space.de/llms.txt`: `POST …/eigenbeleg` lists mainnet networks only, prices 0.10 / 1.00 USDC, the recipients you set (testnet appears only in the "Test (testnet)" section, once the test route is on)
- [ ] `curl -si -X POST …/eigenbeleg` with a made-up payer: `402`, `PAYMENT-REQUIRED` lists only mainnet networks and the published amounts (`100000` = 0.10 USDC)
- [ ] **Nico** pays once from his own mainnet account (agent: `npm run agent -- --api https://eigenbeleg.le-space.de …` with `AGENT_BUDGET=$0.10`, or a Claude Code session with the skill): the documents arrive, the transaction is on NearBlocks / Basescan, the USDC is at `PAY_TO`
- [ ] the subscription once (`/eigenbeleg/subscribe/1`, 0.10 USDC): the confirmation and the cancel link work; cancel it again
- [ ] the web UI at `/ui/` still builds documents locally (no request to the API host; DevTools → Network)

### 8. Listing and announcement

- [ ] NEAR hackathon: the agent registered with the hosted URL (14 Nov)
- [ ] NEAR AI Agent Market: the listing, `MARKET_TOKEN` on the agent's machine (README, "On the NEAR AI Agent Market")
- [ ] after the launch: the Claude plugin directory (claude.ai/directory/manage, `claude plugin validate plugin` first), issue #29
- [ ] issue #5's test with Claude: a session given only the URL finds the API, pays and gets valid documents; note where it got stuck

### 9. The test route (optional, after the launch)

`POST /testnet/eigenbeleg`: testnet data for testnet USDC, in production, for developing and testing clients (README, "The test route").

- [ ] **Nico** creates two NEAR testnet accounts, e.g. `eigenbeleg-test.testnet` (receives) and `eigenbeleg-test-relayer.testnet` (pays the gas; faucet NEAR is enough), and registers the receiving one with testnet USDC (`storage_deposit`, README "Pay for it with x402 on NEAR testnet")
- [ ] on the host, `vi /opt/eigenbeleg/deploy/.env`: `TESTNET_PAY_TO`, `TESTNET_RELAYER_ACCOUNT_ID`, `TESTNET_RELAYER_SECRET_KEY` (Nico types the key; it is never the mainnet one), then `docker compose up -d eigenbeleg`
- [ ] the log says `production (mainnet payments only)` and `test route: [{"network":"near:testnet",…}]`; `POST …/testnet/eigenbeleg` with `"network": "mainnet"` answers 400, with `"network": "testnet"` 402 offering `near:testnet` only
- [ ] a paid run: `npm run agent -- --api https://eigenbeleg.le-space.de/testnet --network testnet …` with a testnet agent account; the PDFs say TESTNET, the files are `TEST-…`

## Rollback

The image of every commit stays on ghcr.io as `ghcr.io/le-space/eigenbeleg-agent:<12-char sha>`.

1. Stop Watchtower so it does not pull `:main` again: `docker stop eigenbeleg-watchtower`.
2. In `compose.yaml`, set the image of `eigenbeleg` to the last good tag; `docker compose up -d eigenbeleg`.
3. Fix on `main`, then set the image back to `:main` and start Watchtower again.

An older image from before #43 would accept testnet payments again; for a rollback before the
launch commit, put the API offline (`docker compose stop eigenbeleg`) rather than run it. If
payments must stop at once without taking the page down, there is no switch for that yet:
stopping the container takes `/ui/` down too.

**Recommended after the launch:** let production follow release tags (`v1.0.0`, …) instead of
`:main`, so a merge is not a deploy. Until then, every merge to `main` goes live within 5 minutes.

## Known gaps at launch

- The Akash proxy is not deployed: Akash history older than the public node's pruning window is missing on the page (the API reads the Console indexer directly).
- Whether production should still build documents for **testnet accounts** (`network: "testnet"` in a request, which only decides what is read) is open; payments are mainnet either way.
- No status page and no automatic relayer top-up.
