Help me build an app on BSV using create-bsv-app. My idea: Pagestream, a pay-per-page reader for Project Gutenberg classics (5 sats a page, first 2 pages free, no account).

Answers to the create-bsv-app starter questions (don't ask them again):
- Experience: b) I've built web apps (FastAPI/Next.js), but I'm new to BSV. Normal dev terms are fine; explain BSV-specific things in one line.
- 1. What and for whom: the full brief and decisions are in docs/pagestream-plan.md (plan v3). Read it first.
- 2. Frontend + API.
- 3. Sign-in: wallet identity only. No login screen and no "Connect wallet" button. The wallet prompt appears when the reader asks for page 3.
- 4. Remembers things: yes. Bookmarks and owned pages, keyed by the wallet identity key.
- 5. Gets paid: yes. 5 sats per page, received by the server wallet.
- 6. No example app as the base. Read the `marscast` starter only as a reference for micropayments.
- Network: main (the final demo must run on mainnet). Package manager: npm. Glue: default.

Overrides to the starter prompt's default mapping:
- Scaffold into a subfolder, because the repo root already holds docs/, design/ and design_handoff_pagestream/:
  `npx create-bsv-app@latest new app --starter full-stack --network main --yes`
  Use only the default wallet-connect capability for now.
- Auth and payments: the plan's default is BRC-105 (`@bsv/auth-express-middleware` + `@bsv/payment-express-middleware`, with `AuthFetch` on the client). The create-bsv-app docs instead use per-request signed proofs (`signed-requests`) plus a plain BRC-29 pay route (docs/accept-payments.md), and they warn that the two auth models don't mix. Before writing code, compare the two for THIS app: unpaid requests (bookmark, owned page) need identity too; atomic replay protection; retry without a second charge; one-charge-per-page across two tabs and devices. Recommend one and wait for my decision.
- Free pages 1–2 must work with no wallet at all: public routes, and no wallet calls on those screens.

Rules from create-bsv-app (keep them):
- Learn the tool from the docs, not memory: the create-bsv-app-docs MCP if connected, otherwise https://www.createbsvapp.com/llms.txt and /docs/<page>.md.
- Always run the CLI with --yes. Node 22+.
- Read the generated AGENTS.md before coding and apply its "Wiring (manual)" section. Use the generated helpers. Leave src/bsv/ as generated, and never write your own key or crypto code.
- Run the build and tests and fix failures (docs/troubleshooting.md).

Design: build the UI from design_handoff_pagestream/ (README.md, STATE.md, tokens, pagestream.css, content.js; reference/ is look-only). Where STATE.md conflicts with the plan, the plan wins:
1. A paid page is shown only after the server returns it. While paying, the current page stays and the counter shows "Confirming…".
2. The bookmark is saved after each page is displayed, not on leaving, and independently of payment.
3. The spend ledger is keyed by txid (pending / confirmed / unresolved). "Spent" and "owned" are tracked separately.
Keep every PROVISIONAL value (permission copy, 5,000-sat limit, fee) in one config file.

Process: use superpowers:brainstorming first. Order of work:
(1) scaffold and report what was generated;
(2) the auth/payment recommendation;
(3) after my decision, the plan's tier-1 spike (permissions, cross-device identity, baseline latency; see docs/pagestream-plan.md §5–6);
(4) milestone 1 reader UI with the payment layer behind one interface.
Don't write product code until I approve the design for that step. Record PASS / FAIL / UNRESOLVED against the plan's criteria C1–C11, and keep LEARNINGS.md updated.
