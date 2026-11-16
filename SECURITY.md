# Security

Eigenbeleg makes Eigenbelege (self-issued proofs of payment) for the payments of own blockchain addresses: in the browser at eigenbeleg.le-space.de/ui/, where nothing leaves the device but the reads of public chain data, and through a paid API (x402) for agents, whose server holds the relayer keys that pay the gas of a payment.

Le Space never asks for a seed phrase, a passkey, a private key or a token: not by mail, not in an issue, not in a chat. Anyone who does is not us.

## Reporting a weakness

Please report it **privately, never in public**: no issue, pull request, discussion or post for something that could be exploited.

- Mail: [security@le-space.de](mailto:security@le-space.de)
- Or GitHub's private reporting: [Report a vulnerability](https://github.com/Le-Space/eigenbeleg-agent/security/advisories/new)

What belongs in a report, with made-up data only (made-up names, addresses and amounts; your own test accounts):

- what you found, and where (URL, route, file, commit or the page's build),
- how to reproduce it, step by step,
- what it lets someone do, and what you think it affects,
- if you like, how you would fix it, and how you want to be named in the advisory.

Never include real documents, names, postal addresses, mails, seed phrases, passkeys, keys or tokens, yours or anyone else's.

The same address is in [/.well-known/security.txt](https://eigenbeleg.le-space.de/.well-known/security.txt) (RFC 9116).

## Coordinated disclosure

1. **Receipt:** we confirm that the report arrived, and say whether we can reproduce it.
2. **Fix:** we fix it and publish the fix with the next release; we keep you posted on the way, and may ask you to check it.
3. **Advisory:** after the fix is out, we publish a GitHub security advisory, with thanks to you by the name you choose (or none, if you prefer).

Please keep the weakness to yourself until the advisory is out. The usual time for that is 90 days from the report; if a fix takes longer, or is out sooner, we agree a date with you.

## Safe harbor

> **Draft, not yet reviewed by our lawyer.** Until it is, this section states our intention, not a binding promise.

If you look for weaknesses in good faith and keep to the rules below, Le Space UG (haftungsbeschränkt) will not take legal action against you for it and will not report you to the authorities. If a third party takes action against you for such research, we will make clear that it was authorised by this policy. If in doubt whether something is allowed, ask first: security@le-space.de.

## Rules

- Use only your own data and accounts: your own addresses, test accounts, made-up names. Do not read, change or delete anyone else's data; if you come across some, stop, do not keep it, and tell us.
- No denial of service: no load tests, no flooding, nothing that slows the service down for others. The API's limits (preview, test route) are not to be worked around at scale.
- No social engineering, phishing or physical access: not against Le Space, its people or its customers.
- No spam: do not use the mail feature to send mail to addresses that are not yours.
- Payments only as an ordinary customer: on mainnet with your own funds, for your own request; on the test route (`/testnet/eigenbeleg`) with testnet USDC. Do not try to drain the relayers' gas.
- Do not use automated scanners that send large numbers of requests.

## What is in scope

- eigenbeleg.le-space.de: the web UI at `/ui/` and the API (`/`, `/eigenbeleg`, `/eigenbeleg/preview`, `/eigenbeleg/subscribe`, `/testnet/eigenbeleg`, `/blocks`, `/llms.txt`),
- this repository: the web UI (`apps/web`), the API (`apps/api`, with the paywall, its in-process facilitator and relayers, the production rules in `apps/api/src/release.js`, mail and subscriptions), the pipeline and readers (`packages/`), the agent (`apps/agent`), the skills (`plugin/`),
- the build and deploy chain of eigenbeleg.le-space.de (`Dockerfile`, `.github/workflows`, `deploy/`).

Not in scope: the third-party services the pipeline reads (NearBlocks, FastNEAR, Alchemy, CoinGecko, Kraken, Aleph Cloud, Akash), the blockchains and their contracts, the x402 libraries themselves (report to their projects; tell us if Eigenbeleg is affected), le-space.de and the other Le Space projects (each has its own SECURITY.md).

## No bounty

There is no bug bounty: Le Space pays no money for reports. What we can offer is our thanks in the advisory.

## Supported versions

The latest commit on `main`, which is what eigenbeleg.le-space.de serves.

Questions that are not about security: [Help and support](https://eigenbeleg.le-space.de/ui/#hilfe).
