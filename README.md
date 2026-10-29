# Pagestream

A Project Gutenberg classics reader built with React and a persistent Express/SQLite BSV mainnet backend. Eight immutable editions are included. The first two pages of each book are public and wallet-free; paid pages use BRC-105 and identity-bound ownership/bookmarks without product signup. The wallet menu can explicitly connect a wallet to find existing purchases.

**This is an incomplete mainnet proof of concept. Hosted health checked 2026-10-27 reports purchases enabled.** Current configuration charges five sats for the page plus an independently checked miner fee capped at one sat for new page transactions. A five-sat all-in price has been discussed but has not been implemented. Native allowance enforcement, full phone/cross-device acceptance and paid latency remain open. See the [current requirements audit](docs/project-requirements-status.md) and [learnings](LEARNINGS.md).

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

The reader is http://localhost:3108/reader/. To expose the operator research probe at the origin root, explicitly set `PAGESTREAM_RESEARCH=1` during development; production keeps research tools and legacy routes disabled. The optional localhost:80 listener serves public wallet permission metadata only. The isolated wallet-free UI preview runs on port 3112 with `node --import tsx scripts/preview-reader.ts` from `spike`; it uses no real ledger or wallet. No ngrok is required.

For a stable receiving identity, configure `spike/.env` locally from the blank [example](spike/.env.example), using your own authorized mainnet setup. Never paste keys/recovery phrases into an issue, commit or chat. A clone contains public books and application code, **not** the existing private receiving key, purchase ledger, intents, proofs, bookmarks or native grants. Do not replace a working ledger with an empty clone. Normal production startup requires a reviewed paused-state import; see the [deployment proposal](deploy/README.md).

## Review and evidence

Current deployment: [Vercel frontend + the owner's existing Railway Hobby backend](deploy/vercel-railway.md), using a persistent volume for the original SQLite ledger. Snapshot import and hosted recovery of owned pages/fees are recorded; no successful new hosted paid-page delivery is recorded. This is a personal wallet-testing POC; Railway included credits do not guarantee zero extra usage charges. Effective purchase admission was enabled at the latest health check; see the setup guide for rollback. Earlier [Render](deploy/vercel-render.md) and [strict-zero-cost research](spike/evidence/zero-cost-hosting-2026-10-19.md) are historical alternatives.

- [Authoritative plan](docs/pagestream-plan.md), [execution queue](docs/requirements-execution.md), [approved reader milestone](docs/reader-milestone-1.md).
- [Senior review R1: changes and verification](docs/review-feedback-r1.md).
- [Shared receipt fee repair](spike/evidence/shared-receipt-fees-2026-10-18.md), [original-proof recovery](spike/evidence/recovery-fix-2026-10-17.md), [wallet attribution](spike/evidence/spending-originator-accounting-2026-10-17.md).
- [Evidence privacy](spike/evidence/README.md), [review draft for the team](docs/team-handoff-review.md), [six-step demo runbook](docs/mainnet-demo-runbook.md).

This repository publication is authorized by the owner. The handoff remains a review draft; no direct team message or upstream issue/PR has been sent. All historical payment figures are evidence, not authorization for another transaction. Books retain their Project Gutenberg source material and notices; see each imported source/edition and the [catalogue evidence](spike/evidence/catalogue-2026-10-17.md).
