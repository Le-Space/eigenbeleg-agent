# Payments in DOI (Doichain): switched off

**Payments in DOI are switched off until further notice.** This page keeps everything needed to switch them on again: the switch, what it does, and every text that offered DOI, as it stood when it was taken out.

Reading Doichain addresses is not affected: the chain reader (`chain: "doichain"`), Eigenbelege and Kontoauszüge for Doichain accounts and the DOI reference value stay as they are.

## The switch

`PAY_DOI=on` in the API's environment, beside `DOI_XPUB` (an address per order) or `DOI_PAY_TO` (one address). Unset or `off` (the default):

- the 402 of `POST /eigenbeleg` lists no DOI; a request with `X-Eigenbeleg-Order` or a payment in the `onchain` scheme gets `410` ("not offered");
- `/llms.txt`, `GET /`, `/openapi.json` and the web page (`[data-pay-doi]`, hidden in the build) say nothing of paying in DOI;
- no ElectrumX server is asked about a payment, except to redeem one made before (below).

`DOI_XPUB` or `DOI_PAY_TO` alone no longer switches DOI on. `PAY_DOI=on` without either: the API does not start.

**Payments made before.** Off, with `DOI_XPUB` or `DOI_PAY_TO` still set, the API reads `PAYMENTS_DIR` at start. Where a payment of the last 7 days or an order that may still be paid is there, it keeps redeeming exactly those (a transaction it has seen, or an order's address; nothing new is broadcast, no new address given out), and the start line says how many and until when. With none there, or with both unset, nothing of DOI runs.

Switching on again: set `PAY_DOI=on`, restore the static texts below (README, docs, skills, the terms and the privacy notice on the page), and check that the terms' date and the published price (`COIN_PRICES` in `packages/pipeline/src/prices.js`) still hold. The served texts (402, `/llms.txt`, `GET /`, `/openapi.json`, the price row and line on the page) follow the switch by themselves.

## The settings (with PAY_DOI=on)

| Variable | What | Secret |
|---|---|---|
| `PAY_DOI` | `on` offers DOI; unset or `off`: switched off | no |
| `DOI_XPUB` | optional: the extended public key (xpub… or zpub…, BIP84) of the account that receives payments in DOI; with it a request can ask for an address of its own (`X-Eigenbeleg-Order: doichain`), so a wallet pays from a QR code. Who knows it sees every payment of the account: it is in no answer or log | **yes** |
| `DOI_PAY_TO` | optional, instead of `DOI_XPUB`: one Doichain address (dc1…) for every payment, signed transactions through this server only. Both empty: DOI is not offered | no |
| `DOI_CONFIRMATIONS`, `DOI_ELECTRUM`, `PAYMENTS_DIR` | confirmations before the documents (default 1; a production build refuses 0), an ElectrumX server other than the public ones, where the payment records are kept (txid, amount, time, a hash of the request) | no |

## The texts as they stood

Each block is the passage that was taken out, under the file it came from; restore it in its place. The commit that added this page shows each one in its context (`git log --diff-filter=A -- docs/doi-payments.md`).

### `apps/web/index.html`

````html
; bei einer Zahlung in DOI aus einer Wallet (Ziffer 5a) mit dem Eingang der Zahlung an der für diese Anfrage genannten Adresse.
````

### `apps/web/index.html`

````html
Für die Zahlung in DOI gilt ergänzend Ziffer 5a.
````

### `apps/web/index.html`

````html
<h3>5a. Zahlung in DOI</h3>
					<p>Soweit die 402-Antwort es anbietet, kann der Einzelabruf statt in USDC in DOI, der Währung des Doichain-Netzes, bezahlt werden; das Abo nicht. Es gilt der Preis in DOI, den die 402-Antwort bei Vertragsschluss nennt; er enthält 19 % Umsatzsteuer. Für Umsatzsteuer und Rechnung rechnet Le Space den gezahlten Betrag in Euro um. Solange für DOI kein öffentlich veröffentlichter Marktkurs vorliegt, gilt der Euro-Referenzwert, den Le Space am Tag des Zahlungseingangs zugrunde legt; er ist kein Börsenkurs. Sobald ein solcher Kurs bei CoinGecko oder Coinpaprika veröffentlicht wird, gilt der dort für den Tag des Zahlungseingangs genannte Kurs. Der verwendete Wert, seine Quelle und sein Datum stehen auf der Rechnung. Der Kunde zahlt mit einer Transaktion auf Doichain an die in der 402-Antwort genannte Adresse und trägt deren Netzwerkgebühr. Eine Zahlung gilt für genau die Anfrage, für die sie geleistet wurde. Die Dokumente werden erstellt und geliefert, sobald die Zahlung die in der 402-Antwort genannte Zahl von Bestätigungen hat, in der Regel etwa zehn Minuten nach der Zahlung; bis dahin antwortet die API, dass die Zahlung gesehen wurde. Anders als bei USDC ist der Betrag dann schon gezahlt: Können die Daten nicht gelesen werden, bleibt die Zahlung sieben Tage ab ihrem Eingang für dieselbe Anfrage einlösbar, und in dieser Zeit liefert Le Space dieselben Dokumente auf dieselbe Anfrage auch erneut. Liefert Le Space in dieser Zeit aus Gründen, die Le Space zu vertreten hat, nicht, erstattet Le Space den gezahlten Betrag. Ebenso erstattet Le Space auf Anforderung Zahlungen, die keiner Anfrage zugeordnet werden können, die den Preis unterschreiten oder die nach Ablauf der für eine Adresse genannten Frist eingehen, sowie den Teil einer Zahlung, der den Preis übersteigt. Erstattet wird in DOI in Höhe des gezahlten Betrags, nicht in Euro, an eine Doichain-Adresse, die der Kunde nennt (E-Mail an contact@le-space.de mit dem Transaktions-Hash); bei Erstattungen, die Le Space nicht zu vertreten hat, abzüglich der Netzwerkgebühr der Rückzahlung.</p>
````

### `apps/web/index.html`

````html
, bei Zahlung in DOI mit der Antwort auf die nach der Bestätigung wiederholte Anfrage (Ziffer 5a),
````

### `apps/web/index.html`

````html
Ohne lesbare Daten wird nichts abgebucht; für Zahlungen in DOI gilt Ziffer 5a.</p>
````

### `apps/web/index.html`

````html
; for a payment in DOI from a wallet (section 5a), when the payment arrives at the address named for that request.
````

### `apps/web/index.html`

````html
For payment in DOI, section 5a applies in addition.
````

### `apps/web/index.html`

````html
<h3>5a. Payment in DOI</h3>
					<p>Where the 402 answer offers it, the single request can be paid in DOI, the currency of the Doichain network, instead of USDC; the subscription cannot. The price in DOI named in the 402 answer at the conclusion of the contract applies; it includes 19% German VAT. For VAT and the invoice, Le Space converts the amount paid into euro. As long as no publicly published market rate exists for DOI, the euro reference value Le Space applies on the day the payment is received is used; it is not an exchange rate. Once such a rate is published by CoinGecko or Coinpaprika, the rate named there for the day the payment is received is used. The value used, its source and its date are stated on the invoice. The customer pays with a transaction on Doichain to the address named in the 402 answer and bears its network fee. A payment counts for exactly the request it was made for. The documents are made and delivered once the payment has the number of confirmations named in the 402 answer, as a rule about ten minutes after the payment; until then the API answers that the payment was seen. Unlike with USDC, the amount is then already paid: if the data cannot be read, the payment stays redeemable for the same request for seven days from its receipt, and within that time Le Space also delivers the same documents again for the same request. If Le Space does not deliver within that time for reasons Le Space is responsible for, Le Space refunds the amount paid. Le Space likewise refunds, on request, payments that cannot be matched to a request, that are below the price or that arrive after the time named for an address has run out, and the part of a payment that exceeds the price. Refunds are made in DOI in the amount paid, not in euro, to a Doichain address the customer names (e-mail to contact@le-space.de with the transaction hash); for refunds Le Space is not responsible for, less the network fee of the repayment.</p>
````

### `apps/web/index.html`

````html
, for payment in DOI with the answer to the request repeated after the confirmation (section 5a),
````

### `apps/web/index.html`

````html
without readable data nothing is charged; for payments in DOI section 5a applies.</p>
````

### `apps/web/index.html`

````html
Wird in DOI bezahlt, ist die Zahlung eine Transaktion auf Doichain und dort mit der zahlenden Adresse öffentlich. Um sie zu senden und ihre Bestätigung zu prüfen, fragt unser Server öffentliche ElectrumX-Server des Doichain-Netzes (unter doi.works); sie erhalten die IP-Adresse unseres Servers, die Transaktion und die Empfangsadresse, nie die Anfrage, Name oder Anschrift. Damit eine Zahlung nur einmal und nur für ihre Anfrage eingelöst wird, speichern wir zu ihr neben Transaktions-Hash, Betrag und Zeitpunkten einen SHA-256-Hashwert der Anfrage, und zu einer für eine Anfrage vergebenen Empfangsadresse diese Adresse, den Hashwert und den Zeitpunkt; die Anfrage selbst, Name und Anschrift speichern wir nicht, und aus dem Hashwert lassen sie sich nicht zurückrechnen (Art. 6 Abs. 1 lit. b und lit. f DSGVO: Zuordnung der Zahlung, Schutz vor doppelter Einlösung).
````

### `apps/web/index.html`

````html
If the payment is made in DOI, it is a transaction on Doichain and public there, with the paying address. To send it and to check its confirmation, our server asks public ElectrumX servers of the Doichain network (at doi.works); they receive our server's IP address, the transaction and the receiving address, never the request, name or postal address. So that a payment is redeemed once and only for its request, we store with it, besides the transaction hash, amount and times, a SHA-256 hash of the request, and for a receiving address given to a request that address, the hash and the time; we do not store the request itself, name or postal address, and they cannot be calculated back from the hash (Art. 6(1)(b) and (f) GDPR: matching the payment, protection against double redemption).
````

### `README.md`

````markdown
x402: USDC on NEAR (gasless for the payer), DOI on Doichain, and USDC on Base and Ethereum where the instance offers them
````

### `README.md`

````markdown
, 0.10 USDC on Ethereum, 0.25 DOI on Doichain; the Kontoauszug 0.10 USDC, 1.00 USDC on Ethereum, 5 DOI;
````

### `README.md`

````markdown
paying with x402 on NEAR, Base and Ethereum, DOI on Doichain, PingPay;
````

### `docs/api.md`

````markdown
(mainnet payments only: USDC on NEAR and DOI on Doichain, `/llms.txt` says what it takes;
````

### `docs/api.md`

````markdown
, 0.10 USDC on Ethereum, 0.25 DOI on Doichain; the Kontoauszug 0.10 USDC, 1.00 USDC on Ethereum, 5 DOI;
````

### `docs/x402.md`

````markdown
## DOI on Doichain

With `DOI_XPUB` (or `DOI_PAY_TO`) the 402 of `POST /eigenbeleg` also offers DOI, 0.25 DOI for the Eigenbelege, 5 DOI for a Kontoauszug, 5.25 DOI for both (scheme `onchain`, [`apps/api/src/onchain.js`](../apps/api/src/onchain.js)). The payer signs a plain Doichain transaction and sends it in `PAYMENT-SIGNATURE`; this server ties it to the request, broadcasts it and answers `202` until 1 confirmation (about 10 minutes), then the files. With `DOI_XPUB` the header `X-Eigenbeleg-Order: doichain` gives a request an address of its own, so a person can pay from a wallet by QR code (the agent: `--pay qr`). Single requests only, not the subscription. The server holds no key that spends DOI.
````

### `docs/agent.md`

````markdown
Where the API offers DOI, `--pay doi` pays in DOI instead, never above `AGENT_BUDGET_DOI`: the agent signs a plain Doichain transaction from its DOI key (`AGENT_DOI_KEY` set with a hidden prompt, `AGENT_DOI_KEY_FILE`, or `AGENT_DOI_KEYCHAIN` on macOS; never an argument), the API broadcasts it, and the agent waits for the block, about ten minutes, saying what it waits for. `--pay qr` needs no key: it shows a QR code for an address of this one request, a person pays with a wallet (DoiWallet: scan from the send screen), and the agent waits for the payment. A stopped run goes on with `--resume <txid>` and the same job; nothing is paid twice.
````

### `docs/components.md`

````markdown
| Payment in a chain's own coin | `apps/api/src/onchain.js` | DOI beside USDC on `POST /eigenbeleg`, off without `DOI_PAY_TO`: a step in front of the x402 middleware ties the payer's signed transaction to the request, broadcasts it and answers `202` until its block; the x402 scheme `onchain` takes the step's verdict as verification and marks the payment redeemed on settle. With `DOI_XPUB` instead, a request can ask for an address of its own (derived from the account's extended public key; the server holds no key that spends), which a wallet pays from a QR code and where the payment is found without a txid. Keeps txid, amount, time and a hash of the request per payment, and the orders' addresses. A production build charges the published price (`COIN_PRICES`) |
````

### `docs/deploy.md`

````markdown
, and of a payment in DOI its txid, amount, time and a hash of the request (`PAYMENTS_DIR`).
````

### `docs/deploy.md`

````markdown
| `DOI_XPUB` | optional: the extended public key (xpub… or zpub…, BIP84) of the account that receives payments in DOI; with it a request can ask for an address of its own (`X-Eigenbeleg-Order: doichain`), so a wallet pays from a QR code. Who knows it sees every payment of the account: it is in no answer or log | **yes** |
| `DOI_PAY_TO` | optional, instead of `DOI_XPUB`: one Doichain address (dc1…) for every payment, signed transactions through this server only. Both empty: DOI is not offered | no |
| `DOI_CONFIRMATIONS`, `DOI_ELECTRUM`, `PAYMENTS_DIR` | confirmations before the documents (default 1; a production build refuses 0), an ElectrumX server other than the public ones, where the payment records are kept (txid, amount, time, a hash of the request) | no |
````

### `docs/deploy.md`

````markdown
Doichain history and balance (`@le-space/chains/doichain`); for a payment in DOI also checking and broadcasting it |
````

### `docs/launch.md`

````markdown
payments only**, in real USDC and in DOI.
````

### `docs/launch.md`

````markdown
### 2a. DOI on Doichain (Nico)

Payment in DOI beside USDC, single requests only ([`apps/api/src/onchain.js`](../apps/api/src/onchain.js); `.env.example` has the details).

- [ ] `DOI_XPUB` = the receiving account's extended public key (BIP84, as DoiWallet exports it), so a request can get an address of its own and a wallet can pay from a QR code; or `DOI_PAY_TO` = one dc1… address (signed transactions through the server only). Treat the xpub like a secret: who knows it sees every payment of the account
- [ ] no `PRICE_DOI` and no `DOI_CONFIRMATIONS=0` (a production build refuses both); `PAYMENTS_DIR` on the volume
- [ ] `curl -s https://eigenbeleg.le-space.de/ | jq .payment.coins`: one entry, `0.25 DOI` (`prices`: 0.25 / 5 / 5.25 DOI), `confirmations` 1, `wait` "about 10 minutes"; `/llms.txt` has "Paying in DOI (Doichain)"
````

### `docs/launch.md`

````markdown
- [ ] **Nico** pays once in DOI from a wallet (`npm run agent -- --api https://eigenbeleg.le-space.de --pay qr …`): the QR code, the transaction in the explorer, `202` until the block, then the documents; the DOI is at the account
````

### `.env.example`

````sh
# Optional: payment in DOI (Doichain) beside USDC, on POST /eigenbeleg only (apps/api/src/onchain.js).
# The payer signs a plain transaction, this server broadcasts it and answers 202 until its block
# (about 10 minutes), then the files. Where the DOI goes, one of the two; both empty: not offered.
#   DOI_XPUB    the account's extended public key (xpub… or zpub…, BIP84, as DoiWallet exports it): a
#               request can ask for an address of its own, so a wallet can pay from a QR code. Treat it
#               like a secret (who knows it sees every payment of the account); it is in no answer or log.
#               At most 20 addresses are out unpaid at a time; an unpaid one is given out again after 2 hours.
#   DOI_PAY_TO  one address (dc1…) for every payment: signed transactions through this server only.
# The server holds no DOI key that spends. A production build takes only the published price
# (packages/pipeline/src/prices.js, COIN_PRICES) and refuses PRICE_DOI, DOI_CONFIRMATIONS=0 and a
# server on this machine. Kept per payment in PAYMENTS_DIR (the compose volume): txid, amount, time
# and a hash of the request, and the orders' addresses; nothing of the customer.
DOI_XPUB=
DOI_PAY_TO=
# PRICE_DOI=5
# DOI_CONFIRMATIONS=1
# DOI_ELECTRUM=wss://electrum.example.org:50004
# PAYMENTS_DIR=/var/lib/eigenbeleg/payments
````

### `.env.example`

````sh
# Paying in DOI (npm run agent -- --pay doi): the most per payment, and where the DOI key (WIF) is. Set
# the key with a hidden prompt rather than here (read -s AGENT_DOI_KEY && export AGENT_DOI_KEY), or name
# a file only you can read, or a macOS keychain item. --pay qr needs no key: a wallet pays.
AGENT_BUDGET_DOI=5
# AGENT_DOI_KEY_FILE=/path/to/doi.key
# AGENT_DOI_KEYCHAIN=eigenbeleg-agent-doi
````

### `plugin/README.md`

````markdown
paying per request with x402 in USDC or DOI.
````

### `plugin/skills/eigenbeleg-api/SKILL.md`

````markdown
paying per request with x402 (USDC on NEAR, or DOI on Doichain; USDC on Base and Ethereum where offered)
````

### `plugin/skills/eigenbeleg-api/SKILL.md`

````markdown
an x402 client with a USDC wallet (NEAR; Base or Ethereum where offered), or a DOI key or a Doichain wallet that scans a QR code.
````

### `plugin/skills/eigenbeleg-api/SKILL.md`

````markdown
details until its end, and what a payment in DOI needs (see `GET /`).
````

### `plugin/skills/eigenbeleg-api/SKILL.md`

````markdown
USDC or DOI on mainnet networks;
````

### `plugin/skills/eigenbeleg-api/SKILL.md`

````markdown
**If the 402 also lists an offer with scheme `onchain`** (DOI on Doichain; only
where the instance offers it, see `payment.coins` in `GET /`), the person can pay
in that coin instead. It is final only after a block, so tell them up front that
the documents come about ten minutes after the payment:

1. Sign a plain transaction that pays at least the offer's `amount` (smallest
   unit) to its `payTo`, with final sequence numbers. Do not broadcast it.
2. Send the same request with `PAYMENT-SIGNATURE`: base64 JSON
   `{ "x402Version": 2, "accepted": <the offer, unchanged>, "payload": { "transaction": "<hex>" } }`.
   The API ties the transaction to this request and broadcasts it.
3. The answer is `202` with the txid, an explorer link, the confirmations and
   `Retry-After`. Repeat the same request (payload `{ "txid": "…" }` is enough)
   at that pace until it is `200` with the files.

The payment belongs to that one request, unchanged, and stays redeemable for it
for seven days, also after a `502`. Keep the body and the txid until the files
are there.

**From a wallet instead** (the person scans a QR code with DoiWallet; only where
`payment.coins[].perOrder` is true): send the request with the header
`X-Eigenbeleg-Order: doichain`. The offer in that 402 then has a `payTo` that is
this request's alone, the payment URI in `extra.uri` (show it as a QR code; in
DoiWallet it is scanned from the send screen) and `extra.payBefore`. After the
person paid, send the same request, with that header, with `PAYMENT-SIGNATURE`
and payload `{}`, using that offer unchanged as `accepted`, until it is `200`;
the payment is found at the address. Without that header a payment a wallet
sends by itself is not taken.
````

### `plugin/skills/eigenbeleg-api/SKILL.md`

````markdown
`AGENT_BUDGET`). In DOI: `--pay doi` (the agent's DOI key, from `AGENT_DOI_KEY`,
  `AGENT_DOI_KEY_FILE` or `AGENT_DOI_KEYCHAIN`, budget `AGENT_BUDGET_DOI`) or
  `--pay qr` (a person pays from a wallet); it waits for the block and can be
  continued with `--resume <txid>`.
````
