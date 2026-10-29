import { test } from "node:test";
import assert from "node:assert/strict";
import { emphasisParts } from "../../app/client/src/reader/emphasis.js";
import {
  spendingLabel,
  summarizeSpending,
} from "../../app/client/src/reader/spending.js";

test("Gutenberg emphasis is presentation only; literal underscores and HTML stay text", () => {
  const text =
    "A _quiet word_ and _I_, file_name, _unmatched, <img src=x onerror=alert(1)>";
  const parts = emphasisParts(text);
  assert.deepEqual(
    parts.filter((part) => part.emphasis).map((part) => part.text),
    ["quiet word", "I"],
  );
  const renderedText = parts.map((part) => part.text).join("");
  assert.ok(renderedText.includes("file_name"));
  assert.ok(renderedText.includes("_unmatched"));
  assert.ok(renderedText.includes("<img src=x onerror=alert(1)>"));
  assert.equal(
    text,
    "A _quiet word_ and _I_, file_name, _unmatched, <img src=x onerror=alert(1)>",
  );
});

test("spending distinguishes free preview, loading, failure, confirmed and uncertain debits", () => {
  const empty = summarizeSpending([]);
  assert.equal(spendingLabel(empty, "idle", false, true), "Free preview");
  assert.equal(
    spendingLabel(empty, "loading", true, true),
    "Loading spending…",
  );
  assert.equal(
    spendingLabel(empty, "error", true, true),
    "Spending unavailable",
  );
  assert.equal(spendingLabel(empty, "ready", true, true), "Free preview");
  const base = { identityKey: "reader", edition: "edition", page: 3, sats: 5 };
  const summary = summarizeSpending([
    { ...base, txid: "1", feeSats: 1, state: "confirmed" },
    { ...base, txid: "2", feeSats: 1, state: "pending" },
    { ...base, txid: "3", feeSats: null, state: "unresolved" },
  ]);
  assert.equal(
    spendingLabel(summary, "ready", true, false),
    "Spent on this book: 6 sats · 6 sats pending · ≥5 sats uncertain",
  );
  assert.equal(summary.total, 17);
  assert.equal(summary.minimum, true);
  assert.equal(spendingLabel(summary, 'error', true, false), 'Spending unavailable · ≥17 sats recorded');
  assert.equal(spendingLabel(summary, 'loading', true, false), 'Loading spending… · ≥17 sats recorded');
});
