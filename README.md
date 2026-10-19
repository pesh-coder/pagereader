# Pagestream

A Project Gutenberg classics reader built with React and a persistent Express/SQLite BSV mainnet backend. Eight immutable editions are included. The first two pages of each book are public and wallet-free; paid pages use BRC-105 and identity-bound ownership/bookmarks, without product signup or a Connect wallet button.

**This is an incomplete mainnet proof of concept. New purchases remain paused.** Current configuration charges five sats for the page plus an independently checked miner fee capped at one sat for new page transactions. A five-sat all-in price has been discussed but has not been implemented. Native allowance enforcement, full phone/cross-device acceptance and paid latency remain open. See the [current requirements audit](docs/project-requirements-status.md) and [learnings](LEARNINGS.md).

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

The actual reader is http://localhost:3108/reader/ and the operator research probe is http://localhost:3108/. The optional localhost:80 listener serves public wallet permission metadata only. Port 3110 is a simulated design reference. No ngrok is required or configured by these commands.

For a stable receiving identity, configure `spike/.env` locally from the blank [example](spike/.env.example), using your own authorized mainnet setup. Never paste keys/recovery phrases into an issue, commit or chat. A clone contains public books and application code, **not** the existing private receiving key, purchase ledger, intents, proofs, bookmarks or native grants. Do not replace a working ledger with an empty clone. Normal production startup requires a reviewed paused-state import; see the [deployment proposal](deploy/README.md).

## Review and evidence

- [Authoritative plan](docs/pagestream-plan.md), [execution queue](docs/requirements-execution.md), [approved reader milestone](docs/reader-milestone-1.md).
- [Shared receipt fee repair](spike/evidence/shared-receipt-fees-2026-10-18.md), [original-proof recovery](spike/evidence/recovery-fix-2026-10-17.md), [wallet attribution](spike/evidence/spending-originator-accounting-2026-10-17.md).
- [Evidence privacy](spike/evidence/README.md), [review draft for the team](docs/team-handoff-review.md), [six-step demo runbook](docs/mainnet-demo-runbook.md).

This repository publication is authorized by the owner. The handoff remains a review draft; no direct team message or upstream issue/PR has been sent. All historical payment figures are evidence, not authorization for another transaction. Books retain their Project Gutenberg source material and notices; see each imported source/edition and the [catalogue evidence](spike/evidence/catalogue-2026-10-17.md).
