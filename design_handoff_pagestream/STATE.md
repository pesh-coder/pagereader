# Pagestream — state machine & copy

## Constants
PRICE = 5 sats · FREE_PAGES = 2 · FEE = 1 sat (placeholder) · WALLET_LIMIT = 5,000 sats (provisional)

## Next page (from page p, np = p + 1)
1. np ≤ 2 → turn to np, status `free`.
2. np in paid[book] → turn to np, status `owned`. No charge.
3. Not approved:
   - no wallet detected → panel `noWallet`
   - else → panel `permission`
4. Approved → pay(np).

## Permission flow
`permission` --"Continue to page 3 · 5 sats"--> wallet native prompt (`prompt`)
- Allow + enough funds → approved = true → pay(3)
- Allow + insufficient → panel `lowFunds` (nothing spent)
- Decline → panel `declined` (nothing spent)
`declined`/`lowFunds` --"Try again · 5 sats"--> prompt again.

## pay(n)
- Add n to paid[book] optimistically; turn to n; status `confirming` (page visible).
- Server confirms → status `first` if it was the first paid page in this book, else `confirmed`; run 150ms underline sweep.
- Response lost → status `unresolved`; show strip notice + "Fetch page n again". Retrying never charges twice.
- Paid but page body failed → status `refetch`; show "Your payment went through; fetching the page again (no extra charge)." then auto-retry.
- **Guard:** ignore a confirmation callback if `page !== n` when it resolves (reader turned away). Record the confirmation in data regardless.

## Previous
Turn to p − 1; status `free` if ≤ 2 else `owned`. Cancels pending UI timers for the old page.

## Page turn
opacity → 0 (60ms) · swap content + scrollTo(0,0) · opacity → 1 (60ms). Disabled with reduced motion.

## Bookmark
On leaving the reader, bookmark[book] = page. Persist server-side by wallet identity. Catalogue row shows "Continue at page N, saved by your wallet, not an account."

## Counter copy
| status | line |
|---|---|
| free | FREE PREVIEW · PAGE {p} OF 2 |
| first | SPENT {s} SATS · {k} PAGE × 5 · FEES {f} · badge "First paid page" |
| confirming | … · badge "Confirming…" + "provisional" |
| confirmed | … · badge "Page {p} confirmed" |
| unresolved | … · badge "1 payment unresolved" (ink border) + "provisional" |
| owned | … · badge "Page {p} · owned" |
| refetch | … · badge "Fetching page {p}" |

s = k × (5 + FEE). Number formatted en-GB (1,640).

## Next button label
np ≤ 2 → "Next page →" · owned → "Next page · owned" (ink) · else "Next page · 5 sats" (price rubric) · last page → no button.

## Desktop (≥ 960px)
- Catalogue: row click selects (aside updates); aside button opens reader.
- Reader: sticky 280px "Pages in this book" aside.
Below 960: row click opens reader directly; asides hidden.
