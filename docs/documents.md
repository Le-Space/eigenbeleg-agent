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

**Aleph Cloud credits** get the same layout as a **usage statement** (`VA-2026-08-01`, one per Ethereum address and whole finished month): opening balance, purchases and transfers of credits, the consumption per day and resource (storage in one line, each instance or program in its own, named from its message), closing balance. A *Monatsübersicht* at the top gives the month in sums, as the books take it: consumption per resource and in all, credits bought, transfers in and out, in credits and EUR; the JSON summary has them as `monthly` ([#24](https://github.com/Le-Space/eigenbeleg-agent/issues/24)). The balances are Aleph's balance now less its summary since (derived). Credits have no market rate: each day's consumption is valued at the USD price per credit of the last purchase on or before that day (else Aleph's list price, 1 USD per 1,000,000 credits) and the ECB's USD rate of the day (`@le-space/rates/aleph-credits`); the statement says so. Consumption from a prepaid balance is no single payment, so there is no self-issued receipt for it; the CSV lists every line with that reason. The **purchase of credits** is one: `document: "eigenbelege"` (or `beide`) gives a self-issued receipt per purchase in the month, *Kauf von Guthaben (Credits)*, credits × Aleph's USD price per credit at the ECB rate of the day, with the token and chain it was paid with and the paying transaction's hash linked on Etherscan or Basescan; the credits received are on it as the incoming movement ([#23](https://github.com/Le-Space/eigenbeleg-agent/issues/23)).

## PDF/A-2b

Both files are **PDF/A-2b** (fonts embedded, sRGB output intent, XMP metadata) for archiving. [veraPDF](https://verapdf.org) checks them with `PASS … 2b`:

```bash
docker run --rm -v "$PWD/out/demo:/data" verapdf/cli:latest --flavour 2b --format text /data/EB-2026-001.pdf /data/KA-2026-11-01.pdf
```

## What goes on it

By default only payments to the network itself: network fees, and storage deposits to protocol contracts. On NEAR a swap at a DEX is on it too (NEAR wrapped, wNEAR given for a token): nobody writes an invoice for it. A transfer to another account may well be to a company that does invoice, so it stays off unless you add it (`includeKinds: ["fee","storage","transfer"]`; each block lists the kinds its chain has as `kinds` in `GET /blocks` – storage deposits exist on NEAR only). Some movements are never on it: transfers between your own addresses, incoming payments, failed transactions (only their fee counts), staking, escrow deposits that are not a final amount yet, and tokens without a trusted price (airdropped spam tokens are common). All of these are in the CSV, with the reason.

## The CSV

**The CSV** has semicolons, decimal commas, UTF-8 with BOM and CRLF line ends, so a German Excel opens it as it is. There is one line per movement: number, position, date, time, chain, network, own address, kind, direction, counterparty, asset, token contract, quantity, rate, EUR value, rate source, hash, explorer link, whether it is on the self-issued receipt, and the reason when it is not. Cells that a spreadsheet would read as a formula are defused.
