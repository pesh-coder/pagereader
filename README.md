# Pagereader

A reader for Project Gutenberg classics where you pay a few satoshis per page with a BSV wallet. There is no signup: your wallet's identity key is your account. Eight complete books are included. Pages 1–2 of every book are free and need no wallet; each later page costs **5 sats**.

**Status: finished proof of concept on BSV mainnet** (live at https://pagereader.vercel.app). Readers approve one **reading balance** of up to 2,500 sats, then turn pages with no wallet prompts. Each page is paid by a wallet signature in the background. Paid pages appeared in **31 ms at the 95th percentile on BSV Browser** (phone, 23 pages) and **17 ms on BSV Desktop** (21 pages), against a 500 ms target. Top up has also been tested with a real wallet. Not yet done: the demo recording.

**Start with [LEARNINGS.md](LEARNINGS.md).** It explains how payments work, what we tried and replaced, and the wallet behaviour to watch out for.

## How it works, in one paragraph

The reader opens a **reading balance**, a one-way payment channel. One wallet approval locks the sats into an output that needs both the reader's and the server's signatures. The server signs a 60-day refund to the reader before anything is sent. For each page the wallet signs "the server may take 5 × n sats", and the server returns that page plus the next one on credit, so Next is instant. **Top up** refills the balance with one approval. **Withdraw** settles once and returns the unspent sats. Unused balances are returned automatically after 30 days without reading.

## Repository layout

| Path | What it is |
|---|---|
| `app/client` | React reader (Vite). Payments in `src/payments`, reader logic in `src/reader/gateway.ts`, settings in `src/payments/config.ts` |
| `spike` | Express + SQLite server, tests (`spike/test`), scripts, and dated evidence (`spike/evidence`) |
| `deploy` | Hosting configuration and guides (Vercel + Railway) |
| `docs` | Plan, requirements status, review feedback and demo runbook |

## Local development

Windows / PowerShell / npm / Node 22.13 or later:

```powershell
cd app/client
npm ci
npm run build
npm run lint
cd ../../spike
npm ci
npm run build
npm test
npm.cmd run dev -- --local-wallet-manifest
```

The reader is at http://localhost:3108/reader/. `--local-wallet-manifest` also serves the wallet permission manifest on localhost:80, where the wallet looks for it.

Reading balances are off unless the server has a receiving wallet and these settings:
- `PAGESTREAM_CHANNELS_ENABLED=1`
- `PAGESTREAM_CHANNEL_IDENTITIES`: a comma-separated list of allowed identity keys, or `all`
- `PAGESTREAM_CHANNEL_MAX_SATS` (optional): a lower ceiling than the 2,500-sat default

**Previews with no wallet and no money.** Run these from the repository root:
- `node --import tsx spike/scripts/preview-sessions.ts`: the real reader and server code with a simulated wallet at phone-like speeds, at http://127.0.0.1:3113/preview
- `node --import tsx scripts/preview-reader.ts` from `spike`: the reader UI only, on port 3112

To expose the operator research tools during development, set `PAGESTREAM_RESEARCH=1`. Production keeps them disabled.

## Keys and data

For a stable receiving identity, set up `spike/.env` from the blank [example](spike/.env.example) with your own authorised mainnet wallet. Never put keys or recovery phrases in an issue, commit or chat.

A clone contains the books and the code. It does **not** contain the live receiving key, purchase ledger, balances, bookmarks or wallet grants. Don't replace a working ledger with an empty clone. Production start-up and data moves are covered in the [deployment guide](deploy/README.md).

## Hosting

Vercel serves the reader and forwards `/api` to the Express server on Railway (EU West), which keeps SQLite on a persistent volume. The wallet sees one address, `pagereader.vercel.app`, for all of its permissions. Details: [Vercel + Railway setup](deploy/vercel-railway.md). This is a personal wallet-testing POC; Railway's included credits don't guarantee zero charges.

## Further reading

- [LEARNINGS.md](LEARNINGS.md): what we learned, start here
- [Acceptance register and remaining work](docs/project-requirements-status.md) · [Demo runbook](docs/mainnet-demo-runbook.md)
- [Reading balance design and measurements](spike/evidence/payment-channel-research-2026-11-10.md)
- [Original plan](docs/pagestream-plan.md) · [Execution queue](docs/requirements-execution.md) · [Senior review R1](docs/review-feedback-r1.md) · [Team handoff draft](docs/team-handoff-review.md)
- [Evidence index and privacy notes](spike/evidence/README.md)

All payment figures in this repo are evidence, not authorisation for another transaction. Books keep their Project Gutenberg source material and notices; see the [catalogue evidence](spike/evidence/catalogue-2026-10-17.md).
