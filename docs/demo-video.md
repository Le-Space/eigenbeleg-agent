# Demo video script (about 90 seconds)

One complete moment: an agent gets a job, pays the API on NEAR, and a bookkeeper gets a receipt that did not exist before. No slides. Screen recording with voice-over; terminal on the left, PDF viewer or browser on the right. All names and addresses in it are made up or are our own testnet accounts.

| Time | Screen | Voice-over |
| --- | --- | --- |
| 0:00 | A NearBlocks page: a list of gas fees of `eigenbeleg-agent.testnet` | "A company paid these fees on NEAR. Its bookkeeper wants a receipt for every booking. Nobody will send one: the recipient is a peer-to-peer network." |
| 0:10 | Terminal: `npm run api` – the line `paywall: {"mode":"near",…,"price":"$0.10","gasless":true}` | "So we sell the receipt the payer issues for its own payment: an Eigenbeleg. The API costs ten cents in USDC, paid with x402 on NEAR." |
| 0:20 | Terminal: `npm run agent -- --network testnet --address eigenbeleg-agent.testnet --month 2026-11 --name "Wolkenfabrik Hosting GmbH" --postal "Musterstraße 1, 12345 Beispielstadt"` | "Our agent gets the job: this account, this month, this company." |
| 0:28 | Agent output: block check, then `402: the API asks 0.1 USDC … budget per payment $0.25. Signing the transfer (gasless)` | "It checks that the NEAR building block is current, sees the price, compares it to its budget and signs exactly one USDC transfer. It holds no NEAR: the API's relayer pays the gas." |
| 0:42 | Agent output: `Got EB-2026-001 … check passed.` and `Paid: https://testnet.nearblocks.io/txns/…`; click the link | "The payment settles to a NEAR account in one transaction. Here it is." |
| 0:52 | PDF: head, the note box, the positions with full hashes, the total, the signature line | "The Eigenbeleg: every fee with its transaction hash, the EUR rate of the day and its source, the reason there is no other receipt, and a line to sign. PDF/A, for the archive." |
| 1:05 | CSV opened in a spreadsheet (semicolons, decimal commas) | "And the same as CSV, which a German spreadsheet opens as it is." |
| 1:12 | `out/EB-2026-001.receipt.json` | "The agent keeps a receipt of what it bought, from whom, for how much, and whether the work passed its checks." |
| 1:18 | Terminal: a job for `solana` → `No building block … drafting one as a pull request` and the printed `gh pr create --draft` | "For a chain it can't serve, it buys nothing. It drafts the missing building block as a pull request with tests, and a person merges it." |
| 1:28 | README top, repo URL | "Building blocks are MIT. Built at NEAR HACKATHON. Bookkeepers: what would you need on it?" |

Before recording: the agent account needs testnet USDC (faucet.circle.com), and `.env` set as in the README. Record at 1080p, terminal font ≥ 16 pt.
