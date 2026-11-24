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
| 1:28 | README top, repo URL | "The building blocks are open source under the AGPL. Built at NEAR HACKATHON. Bookkeepers: what would you need on it?" |

## Recording it automatically

`scripts/video/record.mjs` makes the whole video from a **real paid run** on NEAR testnet. It starts the API, lets the agent pay 0.10 USDC, captures the output, records every scene in Chromium (Playwright), voices it and joins it with ffmpeg. The narrator is ElevenLabs (model `eleven_v4`), as in the Belege videos: "George" in English, "Marc", a native German voice, in German (`--lang de`, for the German market: German captions and cards, the same run). The key comes from the macOS keychain (service `elevenlabs`) or `ELEVENLABS_API_KEY`; without one, macOS `say` speaks. Each sentence is made once and cached under its hash in `out/video/voice/`. The explorer scene shows the payment transaction as the NEAR RPC returns it; the explorer itself sits behind a bot check.

```bash
cd scripts/video && npm install --workspaces=false
node record.mjs --account eigenbeleg-agent.testnet --day 2026-11-06 --lang en
node record.mjs --day 2026-11-06 --lang de --skip-run
```

`--day` must be a finished UTC day on which the account made payments. Output: `out/video/eigenbeleg-demo-en.mp4` and `-de.mp4` (1920×1080, H.264/AAC, about 100 and 115 s). The second language uses `--skip-run`, so both show the same payment. Needs macOS, ffmpeg, `.env` as in [x402.md](x402.md#your-own-api-on-near-testnet) (PAYWALL=near) and testnet USDC on the agent account. `--skip-run` re-renders from the last captured run without paying again.
