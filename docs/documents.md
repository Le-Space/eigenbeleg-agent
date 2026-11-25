# The documents: self-issued receipt and account statement

Back to the [README](../README.md).

## What a self-issued receipt contains, and why

One self-issued receipt per transaction, as Belege writes them (`EB-2026-007`, `EB-2026-008`, … counted up from the number you pass):

| On the self-issued receipt | Why |
| --- | --- |
| Number from **your own range** | The service stores nothing, so you pass the first number yourself. |
| **Payer and issuer**: name, postal address, own payment addresses | You issue it, for your own payments, from your own addresses. |
| The fixed note: *"Eigenbeleg. Für diese Zahlung gibt es keinen Fremdbeleg: Empfänger ist ein Peer-to-Peer-Netzwerk ohne rechnungsstellende Organisation. Ausgestellt vom Zahlenden auf Grundlage der öffentlichen Transaktion …"* | States what kind of document this is. |
| The transaction: date and time (UTC), the **full hash**, **Von** (your address) and **An** (the full recipient address), the explorer link and a **QR code** of it | Anyone can check it from paper. |
| **Every movement** of the transaction (payment, gas; what is not on the self-issued receipt greyed, with the reason), quantity with all decimals, EUR rate, EUR value | Nothing of the transaction is left out. |
| Amount in EUR (rounded to cents; the exact value below it), "Was wurde bezahlt", "Warum kein Fremdbeleg" | The amount to book and the reason. |
| **Rate source** (the price at 00:00 UTC of the day: CoinGecko, else Kraken's daily open; `@le-space/rates`, the same rule as Le Space Belege) | The rate can be looked up again. |
| "Dies ist keine Rechnung …" and a signature line | It is your document, not ours. |

### Another currency than EUR

[#72](https://github.com/Le-Space/eigenbeleg-agent/issues/72): `currency` (`--currency` on the command line, a dropdown on the page) takes EUR (the default), USD, CHF, GBP, SEK, NOK, DKK, PLN, CZK, HUF, RON, ISK, TRY or RUB. Every value is then the euro rate of the day times that currency's official rate of the same day – the ECB's euro reference rate (or the last one before it), USD too, for RUB the Bank of Russia's; only the crypto leg is CoinGecko's or Kraken's – and each position names both legs with source and day. The column heads, sums and the CSV say the currency; there is no second EUR column. The JSON keeps its field names (`totalEur`, `eur`) with `currency` beside them. The documents' language is `documentLanguage` (below). Doichain's reference value stays in EUR per DOI; in another currency it is taken times the euro in that currency on the day, both named.

### Documents in English

`documentLanguage` (`--document-language` on the command line, *Sprache der Dokumente* on the page) is `de`, the default, or `en`: the same self-issued receipts, account statements and CSV with English words, a decimal point and thousands commas, the currency's code after an amount and ISO dates; English throughout, the names too (*Self-Issued Receipt*, *Account Statement*, *Usage Statement*). It is not `language`, which sets only the mail's language and defaults to English. For German books keep `de`: a German tax office may ask for a translation of a document in another language (§ 87 AO).

## What the account statement contains

One statement per own account and period (`KA-2026-11-01`), like a bank's: the holder's address top left, statement number, period, chain and date top right, then one section per asset (NEAR, USDC, AKT, FIL, …):

- **Kontostand am … (Beginn)**, then every booking: Buchungstag (with time), Vorgang (kind, to or from whom, short hash, the self-issued receipt's number where there is one), **Soll**, **Haben**, running **Saldo**, EUR value at the day's rate;
- **Summe** of debits and credits, **Kontostand am … (Ende)**;
- **the check**: on NEAR, the balances before and after the period are read from the **archival node** at the exact block, and the closing balance must equal opening balance plus bookings – shown green as *abgestimmt*, or the difference in red. On Akash and Filecoin, whose public nodes keep no old balances, opening and closing balance are derived from today's balance less every movement since, and the statement says so;
- outgoing, incoming and network fees (expense) in EUR.

It says plainly that it was made by the account holder from public chain data and is **no document of a bank**.

### Every token on Ethereum and Base

[#93](https://github.com/Le-Space/eigenbeleg-agent/issues/93): the account statement has a section for ETH, one for each listed token (USDC, ALEPH), and one for every other ERC-20 token the address sent on, named by its contract – *XYZ (laut Token-Vertrag 0x…)*, as the symbol and decimals are only what the contract says of itself. A token the address only received (an airdrop, often spam) is left out unless the request names its contract in `tokens` (up to 50; `"tokens": ["0x…"]`); a token calling itself like a listed one (USDC, ETH, …) never comes in. Such a token is valued by its contract only: CoinGecko's price for that contract, else its deepest Uniswap pool against ETH or USDC at the booking's block (through Alchemy, with the same key), else not at all; the statement says which. The JSON summary names its `contract` beside the asset.

**Aleph Cloud credits** get the same layout as a **usage statement** (`VA-2026-08-01`, one per Ethereum address and whole finished month): opening balance, purchases and transfers of credits, the consumption per day and resource (storage in one line, each instance or program in its own, named from its message), closing balance. A *Monatsübersicht* at the top gives the month in sums, as the books take it: consumption per resource and in all, credits bought, transfers in and out, in credits and EUR; the JSON summary has them as `monthly` ([#24](https://github.com/Le-Space/eigenbeleg-agent/issues/24)). The balances are Aleph's balance now less its summary since (derived). Credits have no market rate: each day's consumption is valued at the USD price per credit of the last purchase on or before that day (else Aleph's list price, 1 USD per 1,000,000 credits) and the ECB's USD rate of the day (`@le-space/rates/aleph-credits`); the statement says so. The **purchase of credits** is a prepayment: a transfer into the prepaid balance, documented by this statement. Its self-issued receipt per purchase (*Kauf von Guthaben (Credits)*, credits × Aleph's USD price per credit at the ECB rate of the day, with the token and chain it was paid with and the paying transaction's hash linked on Etherscan or Basescan, [#23](https://github.com/Le-Space/eigenbeleg-agent/issues/23)) comes only when asked for with `includeKinds: ["swap"]`, for books that take the purchase as the expense; then the consumption receipt below is not booked as well. **Filecoin Pay** gets the same usage statement: each settlement with a storage provider per rail, the deposits into and withdrawals from the contract's balance.

### The monthly consumption receipt (Aleph credits, Filecoin Pay, Akash)

A self-issued receipt only where value was consumed and nobody invoices it ([#116](https://github.com/Le-Space/eigenbeleg-agent/issues/116)). Buying a prepaid balance – Aleph credits, a deposit into Filecoin Pay, a deposit into an Akash deployment's escrow – is a transfer into a prepaid asset, documented by the statement; the expense is what the balance paid for. So with `document: "eigenbelege"` (or `beide`) each account gets **one self-issued receipt per whole finished month** of the period, *Verbrauch August 2026 – kein Rechnungssteller*:

| Chain | A line is | Valued | The details are on |
| --- | --- | --- | --- |
| `aleph` | a resource (storage; each instance or program) | as the usage statement: USD per credit of the last purchase (else the list price) × the ECB's USD rate of the day | the usage statement `VA-…` (per day and resource) |
| `filecoin-pay` | a rail (service and provider) | USDFC at the day's USDC rate | the usage statement `VA-…` (each settlement) |
| `akash` | a deployment (dseq) | ACT at 1 USD (burn-mint) × the ECB's USD rate of the month's last day | the receipt itself (term, total paid, share); the escrow deposits on the account statement `KA-…` |

Each line gives the entries it sums, its period, the quantity and the value; the receipt gives the total, the number of the statement it refers to, why nobody invoices it and that the purchase of the balance was a prepayment. It is numbered after the payments' own receipts of the request (`EB-2026-001` …), the CSV lists every usage entry under its number, and the JSON summary has it as `consumption` (number, account, month, statement, lines, total). A month only partly in the period, and an account without consumption in a month, get none.

**Akash: what is read and what is missing.** The lease payouts come from an Akash node's deployment list (closed deployments too): each deployment's escrow says what it paid its providers **in all** (`transferred`), and its creation and last settlement; their times come from the Akash Console indexer (`@le-space/chains/akash-deployments`, the same reading and the same spreading as Le Space Belege's Akash usage statement). The chain keeps no payouts per month, so a deployment's total is spread evenly over its time up to its last settlement, and the receipt says so. Not counted: what an active deployment used since its last settlement (it comes with the next one, and a later settlement spreads the total anew, so a month read later can differ), and escrows paid in AKT before ACT. Exact monthly payouts would need the settlement events per block (an archive node), which no public Akash node keeps.

## PDF/A-2b

Both files are **PDF/A-2b** (fonts embedded, sRGB output intent, XMP metadata) for archiving. [veraPDF](https://verapdf.org) checks them with `PASS … 2b`:

```bash
docker run --rm -v "$PWD/out/demo:/data" verapdf/cli:latest --flavour 2b --format text /data/EB-2026-001.pdf /data/KA-2026-11-01.pdf
```

## What goes on it

A self-issued receipt only where bookkeeping needs one: where value was **consumed** and nobody invoices it ([#116](https://github.com/Le-Space/eigenbeleg-agent/issues/116)). Everything else is documented by the account statement, as a bank statement documents a bank's fees and interest:

| Kind | Document | Why |
|---|---|---|
| Network fee (gas, miner fee) | statement only | like a bank fee |
| Staking or mining reward | statement only | like interest |
| Own transfer | statement only | no expense |
| Swap, wrap, bridge (and Aleph's purchase of credits) | statement only | an exchange of assets, or a prepayment |
| Refundable deposit (storage deposit, escrow) | statement only | it comes back |
| Payment for a service consumed, nobody invoices | **self-issued receipt** | no invoice exists |
| Payment to someone who invoices | statement only | the invoice is the document |

So **by default no kind of payment goes on a self-issued receipt**: only the month's consumption of Aleph credits, Filecoin Pay and Akash leases does (above, for whole finished months); payments to contracts that consume come later ([#116](https://github.com/Le-Space/eigenbeleg-agent/issues/116) step 5). Where there is no consumption – every other chain, or no whole month in the period – a request for `document: "eigenbelege"` alone is refused before anything is paid (the API answers 422 with `"code": "no-eigenbeleg-needed"`, no 402): *Für diesen Zeitraum ist kein Eigenbeleg nötig: Gebühren, Erträge, Depots und Tausch belegt der Kontoauszug.* A request for `beide` gives the account statement alone, at the statement's price, and says so (`noEigenbeleg` in the JSON). Asked for kinds that have no movement in the period, the paid route answers 422 (`"code": "no-eigenbeleg-in-period"`) before the payment is settled: nothing is charged for an empty result.

Whoever wants receipts for these kinds all the same (a tax adviser who asks for them, say) names them: `includeKinds: ["fee","storage","swap","transfer"]`; each block lists the kinds its chain has as `kinds` in `GET /blocks` (storage deposits exist on NEAR only). A transfer to another account may well be to a company that invoices, so include it only for payments that have no invoice. Some movements are never on it: transfers between your own addresses, incoming payments, failed transactions (only their fee counts), and tokens without a trusted price (airdropped spam tokens are common).

Every movement is in the CSV, with the reason it is not on a self-issued receipt: *Netzwerkgebühr – belegt durch den Kontoauszug*, *Speicherhinterlegung (erstattbar) – belegt durch den Kontoauszug*, *Tausch – belegt durch den Kontoauszug*, *Staking-Ertrag (wie Zinsen) – belegt durch den Kontoauszug*, *Kauf von Credits (Vorauszahlung) – …*, or the reasons above (own transfer, incoming, failed, payment to an account).

## The CSV

**The CSV** has semicolons, decimal commas, UTF-8 with BOM and CRLF line ends, so a German Excel opens it as it is. There is one line per movement: number, position, date, time, chain, network, own address, kind, direction, counterparty, asset, token contract, quantity, rate, EUR value, rate source, hash, explorer link, whether it is on the self-issued receipt, and the reason when it is not. Cells that a spreadsheet would read as a formula are defused.
