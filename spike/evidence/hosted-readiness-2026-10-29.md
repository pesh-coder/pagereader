# Hosted readiness and device-test starting point — 2026-10-29

This is a public, wallet-free check after pushing review changes. It is not paid or physical-phone acceptance. No wallet calls, new payments, permission grants or deployment settings were made during these checks.

## Hosted checks

Origin: `https://pagereader.vercel.app`.

- `/health`: mainnet, payment-ready, purchases enabled.
- `/api/library`: HTTP 200, eight complete editions, purchases enabled.
- `/manifest.json`: HTTP 200, requested allowance 5,000 sats. This is a declaration, not an observed wallet grant.
- `/reader/`: HTTP 200. The delivered JavaScript includes the new hero, wallet identity menu, Continue reading, spending-state labels and the latest disconnected-wallet copy. CSS asset `index-CmJojNIq.css` matches the local build. These feature checks do not independently identify an exact deployed Git revision.
- `/api/catalogue`: HTTP 404, consistent with production research routes being disabled.
- Both free pages of all eight editions returned HTTP 200 with matching edition IDs and non-empty paragraphs: 16/16 pass. This does not close the earlier physical-phone free-page failure.
- These 16 public requests took 474–1,433 ms from the agent's execution environment. They are public HTTP timings, not paid page-turn timings, not phone timings, and not a qualifying p95 cohort.
- Browser inspection of ordinary library arrival found no wallet-client chunk or authentication handshake request. Native wallet access was not attempted.

## Current upstream information

Queried the official GitHub release API on 2026-10-29 rather than relying on a cached `/releases/latest` redirect:

| Wallet | Latest public GitHub release found | Published | Installed user version |
|---|---|---|---|
| Desktop | [v3.3.1](https://github.com/bsv-blockchain/bsv-desktop/releases/tag/v3.3.1) | 2026-10-23 | 3.3.1 (user reported) |
| Browser | [v1.8.0](https://github.com/bsv-blockchain/bsv-browser/releases/tag/v1.8.0) | 2026-10-21 | 1.6.3 (user reported) |

These are release references, not an instruction to upgrade or evidence of what is installed. Browser v1.8.0's notes mention a dependency change involving BRC-29 per-signature prompts as well as a later toolbox update. Actual prompt behavior must be observed on the installed build; a saved spending allowance alone does not prove silent signing.

Desktop PR #124 remains recorded as merged into an integration branch. A comparison of its fix commit with v3.3.1 is divergent; ancestry alone therefore does not establish the presence or absence of equivalent behavior in that release. Verify actual deployed-origin labels, allowance totals and exhaustion behavior.

## First device check

User confirmed that BSV Browser is available on the phone and its existing identity key differs from Desktop's. This means the current wallets represent different readers in Pagestream; the Desktop bookmark and ownership cannot be resumed under the phone key. Identity continuity remains open. No key import, wallet reset, upgrade or account-linking change has been performed. The current Browser guide describes backup/import, but that alone does not establish safe, supported concurrent Desktop 3.3.1 / Browser 1.6.3 use of the same funded wallet.

1. Record the native Desktop and Browser app versions. Record the interface version from the reader's wallet menu after connection separately.
2. On the phone, open the same HTTPS reader inside BSV Browser. Browse and read two free pages without connecting a wallet; report any error.
3. Compare the existing public identity keys on laptop and phone. Reporting whether they match is sufficient; no recovery phrase, private key or database is needed.
4. If they match, use Continue reading in Holmes to retrieve the already-owned bookmark/pages and recorded costs. Check what page and amount actually return; the prior 74-sat evidence is a reference, not a presumed current total.
5. If they differ, establish a supported identity-continuity method before testing cross-device ownership. Do not invent an account-linking substitute or blindly import a funded key into two independent wallets. The [Desktop migration notes](https://github.com/bsv-blockchain/bsv-desktop/releases/tag/v3.1.1) explicitly discuss separate coin records when keys are shared across wallet apps; [Browser support](https://mobile.bsvb.tech/support.html) distinguishes key recovery from restoring wallet data. Neither alone proves supported Desktop-to-Browser live synchronization.

Paid tests, allowance exhaustion, native failure/race cases and the timed demo remain pending. Team sharing still needs an identified destination and an instruction to send.

## Phone navigation defect and fix

The user subsequently confirmed different identities are acceptable for continuing independent wallet checks. This does not establish same-identity cross-device acceptance. The phone screenshot shows a free preview displayed, but Next is covered by BSV Browser's bottom toolbar and Android navigation area. It does not establish successful page-1-to-2 navigation or absence of wallet calls.

The pager was fixed at `bottom: 0`. Safe-area environment padding did not keep it clear of this embedded browser's overlays. At widths up to 700px or heights up to 500px, the fix places the pager in normal document flow and adds 120px plus the reported bottom safe inset after the controls. Readers scroll to the controls at the end of each page. Desktop navigation remains fixed.

Local wallet-free preview verification against the production client build:

- At 393x780 and 375x667, Next has a 48px touch height, about 120px clearance below it at maximum scroll, and no horizontal overflow.
- At 812x375 landscape, controls remain below the sticky header and about 120px above the viewport bottom.
- With a simulated fixed overlay covering the bottom 96px at 375x667, hit testing still reaches Next.
- Previous returns free page 2 to page 1; Next opens free page 2 without connecting a wallet.
- At 1280x800, the pager retains its fixed desktop layout.

Physical BSV Browser retest is still required after deployment; the simulation does not reproduce the native app itself.
