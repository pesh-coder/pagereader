# Pagestream: next work

Updated 2026-11-02. The current [acceptance register](project-requirements-status.md) is the source of truth for status, current setup and outstanding requirements. The [learnings](../LEARNINGS.md) explain the implementation. The [senior review changes](review-feedback-r1.md) are deployed; native acceptance remains incomplete. Keep the seller price at 5 sats with miner fees on top. A monthly allowance does not establish paid-turn latency.

The [next acceptance run](acceptance-next-run.md) records the ordered six-item checklist, the first read-only device steps, initial session-control findings and fresh public HTTP timings. The user is changing Desktop's custom fee rate and restarting; owned-page verification is next, not a fresh purchase.

1. Align fee-policy testing with the supported processor rate. Desktop's proposed 100-sat/kB setting has not been observed changed. Agree a bounded app fee-consent policy so the 1-sat default does not force a higher-fee exception on every turn; do not silently raise the cap.
2. Reconcile the user-reported Browser page-3 purchase and 28-sat reader total against wallet/receipt data. Test reopening that owned page with no new charge, then establish supported identity continuity. The existing phone identity differs from Desktop's; clean wallet-free phone previews still need a final check.
3. Retain the original wallet-managed per-session approval requirement. Investigate supported session controls and validate allowance consumption, including legacy port-labelled actions. The observed monthly grant does not satisfy this criterion; do not replace it with an app/server budget or change wallet code. A 5,000-sat wallet limit is not a 500-ms performance guarantee. Finish permission/uncertain cross-device spend visibility.
4. Investigate paid latency, then collect 20 qualifying new paid turns per wallet and prompt observations. Preserve cold, slow and failed samples; owned-page reads do not count.
5. Complete native negative, lost-delivery, two-tab/two-device and tab-close checks, preserving original proofs and uncertain intents.
6. Rehearse the six-step mainnet demo in about 90 seconds and share the reviewed learnings with the team.

Several steps need real wallets/devices and may reveal implementation work. They are not completed by writing documentation or passing local tests. No new payment, grant, deployment or external message was performed in this documentation update.

Current hosting is Vercel + Railway, and the 2026-10-27 public health check reports purchases enabled. Use the [current hosting guide](../deploy/vercel-railway.md) for operation/rollback, not older paused/Render checkpoints. Preserve existing ownership, intents and signed proofs; never replace an uncertain payment automatically.

The [previous queue](history/requirements-execution-before-simplification-20261027.md) is preserved unchanged as historical context; its original relative links assume its former location.
