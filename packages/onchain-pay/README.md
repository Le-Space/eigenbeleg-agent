# @eigenbeleg/onchain-pay

A plain payment on a Bitcoin-like chain, through an ElectrumX server: for paying the Eigenbeleg API in DOI ([#61](https://github.com/Le-Space/eigenbeleg-agent/issues/61)), and by the same code in Bitcoin ([#62](https://github.com/Le-Space/eigenbeleg-agent/issues/62)). The network is a parameter (`DOICHAIN`, `BITCOIN` in `networks.js`): address prefixes, the fee floor, the payment URI's scheme, the explorer, and for Doichain the block that tells the valid chain from the old one.

| Function | What it does |
| --- | --- |
| `paymentUri(network, { address, amount, label })` | `doichain:<address>?amount=2.5`, what a wallet scans. DoiWallet takes it from its send screen. |
| `buildPayment({ network, server, key, to, amount, feeRate })` | A signed transaction from the key's coins: one output to the recipient, the change back, the fee at the network's floor. Nothing is sent. |
| `broadcast(server, hex)` | Hands a signed transaction to the network. |
| `inspectPayment(network, hex)` | What a signed transaction pays, read from its bytes, before it is sent on. |
| `checkPayment({ network, server, txid, address, amount, minConfirmations })` | Does it pay that address that amount, and how many blocks deep is it? `reason: 'unconfirmed'` is the one worth asking again for. |
| `verifyChain(network, server)` | Is the server on the network's valid chain? |

`server` is whatever answers ElectrumX requests, `{ request(method, params) }`: for example `connectElectrum()` of `@le-space/chains`. It sees the script hashes it is asked for and the caller's IP address.

What holds:

- **The key signs and nothing else.** A WIF string or 32 bytes, handed in by the caller; never part of a result, an error message or a log. Payments are made from the key's native SegWit address (`dc1q…`, `bc1q…`).
- **A name is never spent.** On Doichain a name is a coin that ElectrumX lists among its address's coins. Only coins with exactly the address's own script are spent, and only an output with exactly the recipient's script counts as paid.
- **Final.** A payment built here cannot be replaced after it is sent. A foreign transaction that still can is not accepted before its block.
- **Only confirmed coins are spent**, at most 20 in one transaction.
- **Amounts are integers** of the smallest unit (`bigint`); `toUnits` and `fromUnits` convert to and from the coin.

```bash
node --test packages/onchain-pay/test/*.test.js
```

The tests run against a chain in memory (`@eigenbeleg/onchain-pay/testing`: `fakeChain`, `fakeKey`) with made-up keys, addresses and amounts. No test sends anything to a real network; the first real payment is the end-to-end test of the agent client ([#59](https://github.com/Le-Space/eigenbeleg-agent/issues/59)).
