# Eigenbeleg skills

Two [Agent Skills](https://agentskills.io) for Claude Code, Codex and any other
agent that reads `SKILL.md`. An **Eigenbeleg** is a self-issued German proof of
payment for a payment nobody sends an invoice for: a network fee, a storage
deposit, a payment to a peer-to-peer network. The skills get them, with the
**Kontoauszug** (account statement) per address and a CSV, for a person's own
addresses on NEAR, Akash, Filecoin, Doichain, Bitcoin, Filecoin Pay and Aleph Cloud
(Ethereum and Base with an Alchemy key).

- **eigenbeleg-api** buys the documents from the Eigenbeleg API at
  https://eigenbeleg.le-space.de, paying per request with x402 in USDC or DOI. The
  agent sends the chain, the addresses, the period and the payer's name and
  postal address to that API, nothing else; the API keeps nothing beyond the
  request. Needs an x402 client with a wallet; the free preview needs none.
- **eigenbeleg-local** builds the same documents on the user's own machine with
  the open-source pipeline of this repository (`git clone`, `npm ci`,
  `npm run local`): nothing is paid, nothing goes to a server of Le Space, name
  and address stay local. The machine asks the chain's public data sources and
  the EUR rate services directly.

Neither skill runs code on its own: each tells the agent which commands to run
and which hosts those commands reach. No keys are needed; an optional Alchemy or
NearBlocks key of the user's own goes to that provider only.

## Install

```bash
claude plugin marketplace add Le-Space/eigenbeleg-agent
claude plugin install eigenbeleg@le-space
```

Or with the skills.sh CLI: `npx skills add Le-Space/eigenbeleg-agent`. Any other
agent takes the folders under `skills/` into its skills directory.

## Licence

The skill texts are [CC-BY-4.0](LICENSE.md), © 2026 Le Space UG
(haftungsbeschränkt). The pipeline, the API and everything the skills point at
are AGPL-3.0-or-later in the [repository](https://github.com/Le-Space/eigenbeleg-agent).
