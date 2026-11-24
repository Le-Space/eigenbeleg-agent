# In the terminal: the local run

Back to the [README](../README.md).

The same pipeline from a shell, for free, nothing sent to us: the chain is read from its public data source, the rates from CoinGecko, Kraken and the ECB, the PDFs are drawn here. Name and postal address stay on the machine.

```bash
npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 --preview
```

```bash
npm run local -- --chain near --network mainnet --address own-account.near --month 2026-10 --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt" --document beide --out ./out
```

`--preview` prints counts, the EUR total and each account statement's balances; the full run writes `EB-….pdf`, `KA-….pdf`, `EB-….csv` and `EB-….summary.json` to `--out`. Ethereum and Base work with your own Alchemy key (`--alchemy-key` or `ALCHEMY_KEY`), which goes to Alchemy only. Bitcoin takes a wallet's zpub, ypub or xpub as well (an xpub with `--address-type`): its addresses are derived on your machine, the key never leaves it, and the account statement names the wallet by the key's fingerprint; `--esplora URL` reads from an Esplora of your own instead of mempool.space. The API takes single Bitcoin addresses only. Doichain's DOI has no published rate: without a value of your own the documents take the default of 0.04 EUR per DOI for the whole period, printed as "Referenzwert von eigenbeleg-agent (Standardwert)" and not as an exchange rate. Your own euro value per DOI and the day it holds from goes in with `--reference DOI=0.05@2026-01-01` (repeatable; the same as `"reference": { "DOI": { "eur": "0.05", "from": "2026-01-01" } }` in a `--job` file, which the option replaces). `npm run local -- --help` lists every option; `apps/cli` is the code, `plugin/skills/eigenbeleg-local` the skill that tells an agent how to run it.
