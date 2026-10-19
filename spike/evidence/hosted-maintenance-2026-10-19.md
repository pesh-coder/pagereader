# Hosted maintenance diagnosis — 2026-10-19

The owner supplied the live frontend `https://pagereader.vercel.app` and backend `https://pagestream-production.up.railway.app` after successful provider deployments. These supersede the earlier URL placeholders and "no projects created" checkpoints. No private key or environment secret was requested.

Read-only HTTP checks returned:

| Origin | `/health` | `/api/library` |
|---|---|---|
| Vercel frontend | 200, maintenance/main/paused/not payment-ready | 503, reading and payments unavailable |
| Railway backend | 200, maintenance/main/paused/not payment-ready | 503, reading and payments unavailable |

Both health bodies were exactly `{"mode":"maintenance","network":"main","purchasesPaused":true,"paymentReady":false}`. The Vercel response carried `Cache-Control: no-store`. The shared browser loaded `/reader/`, retained the original pilcrow and reproduced the screenshot's library error; its network diagnostics recorded `/api/library` 503. The external rewrite is reaching Railway: this observed failure is the intentional health-only maintenance listener, not proof of a broken API-base variable.

The authenticated local Railway CLI identified the expected project/service/production environment and confirmed a volume mounted at `/var/data/pagestream`. It did not link or alter the workspace/project. A subsequent read-only volume-file listing failed with SSH authentication and requested a registered Railway SSH key. File contents, imported ledger integrity/counts, pause marker, receiving key configuration and public identity continuity therefore remain **unverified**. Do not infer that the volume is empty or that a migration has completed.

The next gate is authorized SSH/file access and a verified consistent import of the existing paused ledger, followed by normal reading/recovery activation. Keep maintenance until the existing startup requirements are satisfied; setting it to zero without the original database/pause marker will fail the startup guard. Normal reading/recovery activation is separate from permitting new purchases. No account setting, volume, SSH key, database, native grant or payment was created/changed during diagnosis.

This establishes the narrow hosted static-shell, maintenance-health and HTTP routing observations only. C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED. The prior 62-test result is unchanged; no source changes were needed for this configuration diagnosis and no new tests were run.
