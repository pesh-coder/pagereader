# Hosted recovery and page-7 permission denial — 2026-10-19

The owner authorized a single hosted mainnet page purchase. Operator scope was Holmes page 7, five-sat server price plus at most one-sat miner fee; no new allowance/protocol grant was authorized. Global purchase pause stayed present. This authorization does not extend to replacement transactions or another page.

## Read-only prerequisites

Hosted Resume saved page displayed already-owned Holmes page 5. The reader recovered pages 3/5/6 and recorded fees 57/1/1, showing Book total 74 sats. No payment journal was created during recovery. Owner observed no prompt for that ownership check. The hosted public manifest's server counterparty matches the original local receiving public identity. This is public metadata continuity evidence, not independent extraction of the deployed secret.

Authenticated page-7 preflight found no purchase, intent or existing browser payment attempt. Complete outgoing wallet history baseline contained six actions. A durable operator journal and exact request ID were prepared; the owner uploaded a five-minute permit restricted to that identity, edition, page and request. All other new purchases remained paused.

## Single request and denial

One explicit request began at 2026-10-19T12:48:11.264Z. The hosted endpoint returned 402. The existing staged wallet workflow called createAction with unsigned/noSend preparation. The owner reported a new native Spending Authorization prompt: let the app spend 5000 each month without asking. No setup cost was supplied in the reported wording. Because a new grant was outside scope, the owner was instructed to Deny All and confirmed completion.

The native createAction returned HTTP 400 after approximately 493.8 seconds. The operator settled at 2026-10-19T12:56:28.773Z with an unresolved record retained. No prepared reference, txid or signed proof was returned; no signAction or broadcast stage was reached, and the recorded spend list is empty.

Read-only reconciliation returned status 200: page 7 unowned, original server intent still challenged. Outgoing history remained six actions with an empty new-txid delta. Thus no new outgoing debit was observed for this run. The previous owned page 5 stayed displayed. No new request, journal reset, reservation deletion or replacement payment was made. Private run details remain ignored.

## Cleanup and next gate

The permit expired before reconciliation and cannot admit a new request. Its remote file still needs confirmed removal; do not claim it absent. Startup refuses any permit file, including expired ones, so avoid a deployment/restart until cleanup is confirmed. Preserve the challenged intent and browser journals. Do not upload a renewed/replacement permit or retry this page automatically.

A hosted-origin permission is distinct from the old localhost grant. Next, review a separately authorized grant-only experiment with wallet-history baseline and actual setup-cost reconciliation; granting 5000/month is not a 5000-sat payment. Exact setup cost is not established by the prompt. Reconcile the original page-7 request before deciding whether a same-request pre-signing resume can be supported. This denial does not authorize grant approval or reset uncertain state.

Public reading, same-identity hosted owned recovery and fee restoration are narrow passes. No hosted paid page was delivered by this run. C1/C2/C4 remain FAIL; C3/C5/C6/C7/C8/C9/C10/C11 remain UNRESOLVED. No qualifying paid latency sample exists; the long denied native wait is retained as evidence.
