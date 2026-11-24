# Deploy

Back to the [README](../README.md).

The API (and the web UI it serves) runs as one container with a read-only root filesystem. The host needs no git checkout and builds nothing: after the tests on `main` pass, [`image.yml`](../.github/workflows/image.yml) publishes `ghcr.io/le-space/eigenbeleg-agent:main` (and a tag per commit), and Watchtower on the host picks it up within 5 minutes. The page's Akash proxy URL is baked in at build time from the repository variable `AKASH_INDEXER` (Settings → Variables; the Worker's URL once [`deploy/akash-proxy`](../deploy/akash-proxy) is deployed); unset, the page reads Akash without the Console indexer.

Once, on the host, in a folder of its own:

1. Copy [`deploy/compose.yaml`](../deploy/compose.yaml) there as `compose.yaml`, and `.env.example` as `.env`; fill in `.env` (see below; never committed).
2. Run:

```bash
docker network create edge     # once; the reverse proxy (Caddy) is on it
docker compose up -d
```

See: `docker compose ps` lists `eigenbeleg` and `eigenbeleg-watchtower`. After the next merge to `main`, `docker logs eigenbeleg-watchtower` says it found a new image and restarted `eigenbeleg`. To update by hand: `docker compose pull && docker compose up -d`. To go back to an earlier version, set the image to its commit tag (`ghcr.io/le-space/eigenbeleg-agent:<12-char sha>`) and stop Watchtower. To build locally instead: `docker build -t eigenbeleg-api:local .`

Watchtower ([nicholas-fedor/watchtower](https://github.com/nicholas-fedor/watchtower), the maintained fork; the original containrrr project is archived) needs the Docker socket and so can control Docker on the host; it is limited to containers labelled `com.centurylinklabs.watchtower.enable`, here only `eigenbeleg`. The package on ghcr.io must be public (GitHub, package settings) so the host pulls without a login.

`deploy/compose.yaml` runs the service `eigenbeleg` this way:
- read-only root filesystem, `/tmp` as tmpfs, all capabilities dropped, `no-new-privileges`, 256 MB memory;
- as the non-root user `node`, with no published ports;
- only on the external network `edge`, where the proxy reaches it as `eigenbeleg:3000`.

The image holds only the API's production dependencies (no agent, no Playwright) and the web UI, built in a first stage with Vite and served at `/ui/`, and has a `HEALTHCHECK` on `GET /health`.

A Caddy site for it:

```
eigenbeleg.example.com {
	reverse_proxy eigenbeleg:3000
}
```

## Storage

The API keeps nothing beyond the request, except what it was asked to keep: a subscription's details (encrypted), a preview's logo for 24 hours (encrypted), and of a payment in DOI its txid, amount, time and a hash of the request (`PAYMENTS_DIR`). It reads its fonts and colour profile from the image, and the relayer's key file if one is mounted. The only in-memory state is short-lived: the live check of a building block (10 min), the x402 duplicate-settlement guard (until a payment's block window has passed), and the day's EUR rates during one request.

## Environment

`.env.example` lists them all.

| Variable | Meaning | Secret |
| --- | --- | --- |
| `PAYWALL` | `x402` (x402 `exact`, USDC, on the networks in `PAY_NETWORKS`; `near` is its old name), `ping` (PingPay, mainnet only), `none` (development: free, and says so) | no |
| `PAY_NETWORKS` | where customers may pay, comma-separated: `near:mainnet`, `eip155:8453` (Base), `eip155:1` (Ethereum), and for development `near:testnet`; the 402 offers them all (not which chain is read). No default: it must be set. `PAY_NETWORK` with one network still works | no |
| `TESTNET_PAY_TO`, `TESTNET_RELAYER_ACCOUNT_ID`, `TESTNET_RELAYER_SECRET_KEY`, `TESTNET_NEAR_RPC_URL` | the test route `POST /testnet/eigenbeleg` (testnet data for testnet USDC, production too): its recipient, relayer and RPC, NEAR testnet accounts only; unset: the route is off | no |
| `EIGENBELEG_DEV_TESTNET` | `1`: allow `near:testnet` in `PAY_NETWORKS`. Development and tests only: a production build refuses to start when it is set | no |
| `EIGENBELEG_PRODUCTION` | `1`: treat this process as a production build outside the image (the image is one anyway). It can only switch production on | no |
| `PRICE` | price per request in USDC, e.g. `$0.005`, for every document (development only: a production build refuses it, the published prices differ per document); `PRICE_EIP155_1` etc. set one network's own price (Ethereum's gas costs the relayer more) | no |
| `SMTP_URL`, `MAIL_FROM` | optional: the files by mail when a request asks (`email`); the SMTP account as a URL and the sender. Without them the API offers no mail | **yes** |
| `SUBSCRIPTION_KEY`, `SUBSCRIPTION_DIR` | optional: subscriptions (needs mail). The key (16+ characters) encrypts the one file per subscription in the directory (the compose volume `/var/lib/eigenbeleg`); losing the key loses them. Without the key no subscriptions | **yes** |
| `LOGO_DIR` | optional: where a logo sent with the free preview is kept for 24 hours, encrypted with a key made from its id and deleted by an hourly sweep. Default: `SUBSCRIPTION_DIR/logos` where `SUBSCRIPTION_DIR` is set; with neither the preview checks a picture and keeps none |
| `PRICE_SUBSCRIPTION` | the year's price on `POST /eigenbeleg/subscribe`; default twelve times `PRICE` (per network: `PRICE_SUBSCRIPTION_EIP155_1` etc.). The route per months is always months × `PRICE` | no |
| `PAY_TO_EVM` | the 0x address that receives the USDC on Base and Ethereum | no |
| `EVM_RELAYER_KEY` | 0x private key of the account that submits the payer's EIP-3009 transfer on Base and Ethereum and pays its gas (a little ETH on each) | **yes** |
| `EVM_RPC_EIP155_8453`, `EVM_RPC_EIP155_1` | an RPC per EVM network; else Alchemy with `ALCHEMY_KEY`, else the chain's public RPC | no |
| `PAY_TIMEOUT_SECONDS` | how far ahead a signed payment may expire (default 300; browser wallets such as Meteor sign 200 blocks ahead) | no |
| `PAY_TO` | the NEAR account that receives the USDC; it must be registered with the USDC contract (`storage_deposit`) | no |
| `RELAYER_ACCOUNT_ID` | the NEAR account that submits the payer's signed delegate action and pays its gas; needs a little NEAR | no |
| `RELAYER_SECRET_KEY` | the relayer's full-access key (`ed25519:…`) | **yes** |
| `NEAR_CREDENTIALS_DIR` | instead of `RELAYER_SECRET_KEY`: a directory with `<network>/<RELAYER_ACCOUNT_ID>.json` in the near-cli format (`private_key`), mounted read-only | **yes** (the file) |
| `NEAR_RPC_URL` | the RPC the x402 facilitator uses (default `rpc.<network>.fastnear.com`) | no |
| `PING_API_KEY` | PingPay key (`PAYWALL=ping`); the NEAR recipient is set in the Ping dashboard | **yes** |
| `PING_FACILITATOR_URL`, `PING_AMOUNT_OUT` | PingPay facilitator, destination amount in USDC base units (≥ 200000) | no |
| `NEARBLOCKS_API_KEY` | optional, for NearBlocks' higher rate limits | **yes** |
| `ALCHEMY_KEY` | optional: with it the API also serves Ethereum and Base (ETH, USDC, ALEPH and the gas) through Alchemy; without it, it does not offer them. The key goes to Alchemy only, never into an answer, a document or a log. The web UI never gets this key: there, people enter their own | **yes** |
| `DOI_XPUB` | optional: the extended public key (xpub… or zpub…, BIP84) of the account that receives payments in DOI; with it a request can ask for an address of its own (`X-Eigenbeleg-Order: doichain`), so a wallet pays from a QR code. Who knows it sees every payment of the account: it is in no answer or log | **yes** |
| `DOI_PAY_TO` | optional, instead of `DOI_XPUB`: one Doichain address (dc1…) for every payment, signed transactions through this server only. Both empty: DOI is not offered | no |
| `DOI_CONFIRMATIONS`, `DOI_ELECTRUM`, `PAYMENTS_DIR` | confirmations before the documents (default 1; a production build refuses 0), an ElectrumX server other than the public ones, where the payment records are kept (txid, amount, time, a hash of the request) | no |
| `SOURCE_URL` | where users of this instance get its source (AGPL-3.0-or-later section 13); your fork if you changed it | no |
| `PUBLIC_URL` | this instance's public origin, e.g. `https://eigenbeleg.le-space.de`, for the share cards (Open Graph, X) on `/ui/`; unset: taken from the request's Host and `X-Forwarded-Proto` | no |
| `TRUST_PROXY` | behind a proxy: whose `X-Forwarded-*` to trust (Express syntax, e.g. `uniquelocal`), so the x402 resource URL is https | no |
| `HOST`, `PORT` | listen address; the image uses `0.0.0.0:3000` | no |

Testnet vs mainnet: `PAY_NETWORKS` decides where customers pay; the chain data read is chosen per request (`network` in the body). For production: `PAY_NETWORKS=near:mainnet,eip155:8453,eip155:1` with `PAY_TO`, `PAY_TO_EVM` and both relayers.

## Production takes mainnet payments only

The image is a production build: its last stage writes `apps/api/production` (owned by root, on a read-only filesystem, so `.env` cannot remove it), and with it the API refuses to start, saying why, when `PAY_NETWORKS` is unset or names `near:testnet`, when `PAYWALL=none`, when `NEAR_RPC_URL` or an `EVM_RPC_*` points at a test network or at this machine, or when `EIGENBELEG_DEV_TESTNET` is set. A checkout is a development build: there `near:testnet` needs `EIGENBELEG_DEV_TESTNET=1`. The rules are in [`apps/api/src/release.js`](../apps/api/src/release.js), the test that starts the server as a production build with a testnet network and sees it refuse in [`apps/api/test/release.test.js`](../apps/api/test/release.test.js). See: `docker logs eigenbeleg` starts with `production (mainnet payments only)`.

## The test route, in production too

`POST /testnet/eigenbeleg` sells the same documents for testnet USDC, but only for testnet addresses (`"network": "testnet"`; anything else is a `400` before the 402), every PDF marked TESTNET and every file name `TEST-`. It has its own paywall with `near:testnet` only, its own recipient and relayer (`TESTNET_PAY_TO`, `TESTNET_RELAYER_ACCOUNT_ID`, `TESTNET_RELAYER_SECRET_KEY`, `TESTNET_NEAR_RPC_URL`; `….testnet` accounts only), and never shares a 402 with the main route, so testnet USDC never buys a mainnet document. Limits: 30 requests an hour per IP (402s included), periods up to 31 days, 20 mails a day in all (subject `[TESTNET]`), no subscription; `GET /testnet/blocks` too, so a client takes `…/testnet` as its API base. Without `TESTNET_PAY_TO` the route answers 404. It is for developing and testing clients and new features against the running code: no contract, no invoice, no value.

This API is its own x402 facilitator on every network: the NEAR relayer submits delegate actions, the EVM relayer submits `transferWithAuthorization`; no third party sees or settles the payments.

## Being found

The 402 says what the route takes (the `bazaar` discovery extension), and `/openapi.json` and `/llms.txt` describe the API. A catalogue such as the x402 Bazaar lists a route when a facilitator that keeps one settles a payment for it; because this API settles its own payments, it is in no such catalogue by itself. Listing it there would mean settling through that facilitator, which then sees every payment: a decision, not a setting.

## Outbound hosts

The API calls these hosts (HTTPS only):

| Host | For |
| --- | --- |
| `api.nearblocks.io`, `api-testnet.nearblocks.io` | NEAR account history (`@le-space/chains/near`) |
| `archival-rpc.mainnet.fastnear.com`, `archival-rpc.testnet.fastnear.com` | NEAR balances at a block (account statement), storage refunds |
| `rpc.mainnet.fastnear.com`, `rpc.testnet.fastnear.com` (or `NEAR_RPC_URL`) | x402 verification and settlement: chain state, submitting the relayed payment |
| `api.kraken.com`, `api.coingecko.com` | EUR day rates |
| `akash-rpc.publicnode.com`, `akash-rest.publicnode.com`, `console-api.akash.network` | Akash history and balance (`@le-space/chains/cosmos`) |
| `filfox.info` | Filecoin history and balance (`@le-space/chains/filecoin`) |
| `api.goldsky.com`, `filecoin.blockscout.com` | Filecoin Pay: settlements and balance from the makers' index, what was paid in and taken out from the contract's events (`@le-space/chains/filecoin-pay`) |
| `api2.aleph.im` | Aleph Cloud credit history and balance (`@le-space/chains/aleph`) |
| the ElectrumX servers at `*.doi.works` (or `DOI_ELECTRUM`) | Doichain history and balance (`@le-space/chains/doichain`); for a payment in DOI also checking and broadcasting it |
| `mempool.space` | Bitcoin history and balance, the Esplora API (`@le-space/chains/bitcoin-address`) |
| `data-api.ecb.europa.eu` | EUR per USD, for Aleph credits; the euro in the document's currency when it is not EUR (`currency`) |
| `www.cbr.ru` | only for documents in RUB: the Bank of Russia's official EUR/RUB rate of the day |
| `eth-mainnet.g.alchemy.com`, `base-mainnet.g.alchemy.com` | only with `ALCHEMY_KEY`: Ethereum and Base history and balances (`@le-space/chains/evm`) |
| `pay.pingpay.io` | only with `PAYWALL=ping` |

The addresses of a request go to the data sources of its chain, and nowhere else. The payer's name and postal address never leave the server: they appear only in the documents sent back. Links in the documents (`nearblocks.io`, `testnet.nearblocks.io`, `mintscan.io`, `filfox.info`, the source repository) are never called by the server.
