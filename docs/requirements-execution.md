# Pagestream: next work

Updated 2026-10-29. The current [acceptance register](project-requirements-status.md) is the source of truth for status, current setup and outstanding requirements. The [learnings](../LEARNINGS.md) explain the implementation. The [senior review changes](review-feedback-r1.md) are local and must be reviewed/deployed before hosted device acceptance.

1. Establish supported wallet identity continuity, phone funding and Browser payment/resume; retest free phone previews.
2. Resolve monthly-vs-session approval and validate allowance accounting, including legacy port-labelled actions. Finish permission/uncertain cross-device spend visibility.
3. Investigate paid latency, then collect qualifying paid cohorts and prompt observations on both wallets.
4. Complete native negative, lost-delivery, two-tab/two-device and tab-close checks, preserving original proofs and uncertain intents.
5. Rehearse the six-step mainnet demo in about 90 seconds and share the reviewed learnings with the team.

Several steps need real wallets/devices and may reveal implementation work. They are not completed by writing documentation or passing local tests. No new payment, grant, deployment or external message was performed in this documentation update.

Current hosting is Vercel + Railway, and the 2026-10-27 public health check reports purchases enabled. Use the [current hosting guide](../deploy/vercel-railway.md) for operation/rollback, not older paused/Render checkpoints. Preserve existing ownership, intents and signed proofs; never replace an uncertain payment automatically.

The [previous queue](history/requirements-execution-before-simplification-20261027.md) is preserved unchanged as historical context; its original relative links assume its former location.
