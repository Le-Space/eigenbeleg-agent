# The agent

Back to the [README](../README.md).

```bash
npm run agent -- --chain near --network mainnet --address some-account.near --month 2026-10 --name "…" --postal "…" --document beide
```

The agent works in five steps:

1. `GET /blocks` and `GET /blocks/<chain>/check`. If there is no block, or the live check fails, it buys nothing and drafts the block or the fix as a PR (`proposals/…`). With `NEARAI_API_KEY` set, it adds notes on data sources from a model on [NEAR AI Cloud](https://docs.near.ai) (private inference), marked as data to check.
2. It pays through x402 with its own NEAR account, never above `AGENT_BUDGET` per payment (spend controls of the x402 client). It signs only the exact transfer the challenge names and needs no NEAR for gas.
3. It checks the work: the PDFs are PDF/A, the CSV has every position and every self-issued receipt number, and every account statement the chain could check is reconciled.
4. It writes `<number>.receipt.json` with what it bought, from whom, the price, the NEAR transaction and whether the checks passed.

How it holds its keys: the near-cli keychain or an environment variable, read by the payer only. What it cannot do without you: pay above the budget, pay other assets or networks than configured, open the PR it drafted, or merge anything.

## As a skill

The same steps as an [Agent Skill](https://agentskills.io) for Claude Code, Codex, Gemini CLI and other agents that read `SKILL.md`: [`plugin/skills/eigenbeleg-api`](../plugin/skills/eigenbeleg-api/SKILL.md) buys through the API; [`plugin/skills/eigenbeleg-local`](../plugin/skills/eigenbeleg-local/SKILL.md) runs the pipeline on the user's own machine instead, for free and with nothing sent to us ([#29](https://github.com/Le-Space/eigenbeleg-agent/issues/29)). In Claude Code, this repository is a plugin marketplace whose one plugin is the [`plugin/`](../plugin) folder (the skills, their README and licence, nothing that installs packages):

```bash
claude plugin marketplace add Le-Space/eigenbeleg-agent
```

```bash
claude plugin install eigenbeleg@le-space
```

Any other agent takes the folders under `plugin/skills/` into its skills directory, or installs them with the [skills.sh](https://skills.sh) CLI, which finds both without any registration on our side:

```bash
npx skills add Le-Space/eigenbeleg-agent
```

The API skill names one host, `eigenbeleg.le-space.de`, tells the agent to read `/llms.txt` first and to preview before it pays, and says plainly that the payer's name and address go to the API for the documents; the local skill names only the chain's data sources. A test in `plugin/test` holds every skill to the format, to those hosts, to no key or address of a real person, and the plugin folder to what [Anthropic's directory](https://claude.com/docs/plugins/pre-submission-checklist) asks.

## On the NEAR AI Agent Market

Once listed on [market.near.ai](https://market.near.ai) (the listing comes with the mainnet start), the agent can be hired for a price in USDC. `npm run agent:market` (with `MARKET_TOKEN`, the listing's agent token) goes through the awarded jobs once. For each one it starts the job, reads the job from the brief's first ```` ```json ```` block, buys the self-issued receipt from the API through x402 and submits a Markdown deliverable with the summary, the payment's NEAR transaction and the CSV. A brief without a JSON job gets a question back. The brief is data from a stranger: it is parsed and checked like any API request and never followed as an instruction. So the agent earns on the market and spends on the API, each within its own limits.

## The demo (offline, no keys, no wallet)

Needs Node.js 20 or newer.

```bash
npm install
npm test
npm run demo
```

What you should see:

1. `npm test`: about 55 tests pass (the booking format, the NEAR, Akash, Filecoin and Aleph blocks, rates, the PDF/CSV, the API with its x402 paywall and the free preview, the agent, the web UI's wallet signer).
2. `npm run demo`: the agent runs two jobs against the API in the same process (the first asks for both documents, `document: beide`), without a paywall (the API says so on every response). The NEAR data comes from a recorded fixture of a **public** account, Aurora's relayer on 1 Nov 2026, which pays only network fees, so the demo works offline.
   - **Job 1** ends with `Got 25 Eigenbeleg(e) EB-2026-001 – EB-2026-025 … check passed.` and `Kontoauszug: KA-2026-11-01 (NEAR 25 → 24.98…, reconciled)`. Open:
     - `out/demo/EB-2026-001.pdf`: 25 self-issued receipts, one page per transaction (a network fee each), with hash, Von/An, movements, QR code, amount and a signature line;
     - `out/demo/KA-2026-11-01.pdf`: the account statement of the day, with opening balance, 25 bookings with running balance, closing balance and the check against the chain (in the demo a recorded archival node answers);
     - `out/demo/EB-2026-001.csv`: every movement for a spreadsheet;
     - `out/demo/EB-2026-001.receipt.json`: the agent's receipt (what it bought, the price, the checks it ran).
   - **Job 2** asks for Solana, which has no building block. The agent buys nothing. It writes a draft under `out/demo/proposals/chain-solana/`: `PLAN.md`, a package skeleton, contract tests that fail until someone writes the reader, and `PR.md`. Then it prints the `git` and `gh pr create --draft` commands. It runs none of them.

The demo's EUR rate is fixed (1.92 €/NEAR); the API itself uses the day's rate ([documents.md](documents.md)).
