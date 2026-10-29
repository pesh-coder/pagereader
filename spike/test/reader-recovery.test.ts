import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  createReaderGateway,
  ReaderError,
  type Book,
} from "../../app/client/src/reader/gateway.js";
import type { openWallet } from "../src/wallet-client.js";
import type { PaymentAttempt } from "../src/payment-action.js";

const book: Book = {
  id: "book",
  gid: 1,
  title: "Book",
  author: "Author",
  mode: "reader",
  editionId: "edition",
  pages: 30,
  sourceUrl: "https://www.gutenberg.org",
};
const requestId = "11111111-1111-4111-8111-111111111111";
const purchase = { page: 3, txid: "original-transaction", sats: 5, feeSats: 1 };
const response = (body: unknown) => new Response(JSON.stringify(body));

function fixture(t: TestContext) {
  const originals = ["localStorage", "location", "fetch"].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { origin: "http://localhost:3112" },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => response({ books: [book], purchasesPaused: false }),
  });
  t.after(() => {
    for (const [key, descriptor] of originals)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  });
  let attempt: PaymentAttempt | undefined;
  let serverIntent: {
    request_id: string;
    state: string;
    txid: string | null;
  } | null = null;
  let creates = 0,
    recoveries = 0,
    failHistory = false,
    failReconciliation = false,
    changeIntentOnRecheck = false;
  const ids: string[] = [];
  const feeCaps: (number | undefined)[] = [];
  const open: typeof openWallet = async (callbacks) =>
    ({
      identityKey: "reader",
      version: "fixture-version",
      auth: {
        fetch: async (url: string, init?: RequestInit) => {
          const path = new URL(url).pathname;
          if (!path.includes("/pages/"))
            assert.equal(callbacks.canSpend(), false);
          if (path.endsWith("/me")) {
            if (failHistory) throw new Error("History offline");
            return response({
              identityKey: "reader",
              purchases: [],
              bookmark: null,
            });
          }
          if (path.includes("/status/"))
            return response({ purchase: null, intent: serverIntent });
          if (path.includes("/recover/")) {
            recoveries++;
            assert.equal(init?.method, "POST");
            return response({
              editionId: "edition",
              page: 3,
              paragraphs: ["Owned"],
              purchase,
            });
          }
          if (path.includes("/pages/")) {
            assert.equal(callbacks.canSpend(), true);
            creates++;
            return response({
              editionId: "edition",
              page: 3,
              paragraphs: ["Paid"],
              purchase,
            });
          }
          throw new Error("Unexpected path: " + path);
        },
      },
      getAttempt: () => attempt,
      reconcileUnpaidChallenge: async (_edition: string, _page: number, id: string, recheck: () => Promise<boolean>) => {
        assert.equal(callbacks.canSpend(), false);
        if (failReconciliation) throw new Error("Wallet history could not confirm a received-funds-only wallet");
        if (changeIntentOnRecheck) serverIntent = { request_id: "changed", state: "submitted", txid: "other-transaction" };
        if (!(await recheck())) return false;
        assert.equal(attempt, undefined);
        attempt = { identityKey: "reader", edition: "edition", page: 3, requestId: id, state: "aborted", retryReason: "not-started" };
        return true;
      },
      beginPayment: (_edition: string, _page: number, id: string, cap?: number) => {
        ids.push(id);
        feeCaps.push(cap);
        attempt = {
          identityKey: "reader",
          edition: "edition",
          page: 3,
          requestId: id,
          state: "reserved",
        };
      },
      confirmPayment: () => {},
    }) as unknown as Awaited<ReturnType<typeof openWallet>>;
  const gateway = createReaderGateway(() => {}, open);
  return {
    gateway,
    values,
    ids,
    feeCaps,
    counts: () => ({ creates, recoveries }),
    historyFailure: () => {
      failHistory = true;
    },
    setAttempt: (state: PaymentAttempt["state"], differentIntent = false) => {
      attempt = {
        identityKey: "reader",
        edition: "edition",
        page: 3,
        requestId,
        state,
        retryReason: "cancelled",
      };
      serverIntent = {
        request_id: differentIntent ? "different-request" : requestId,
        state: "challenged",
        txid: null,
      };
    },
    submitted: () => {
      serverIntent = {
        request_id: requestId,
        state: "submitted",
        txid: purchase.txid,
      };
    },
    savedFailure: () => {
      attempt!.lastFailure = { method: "createAction", code: "MOBILE_FAILURE" };
    },
    rejectedFee: (fee: number | null) => {
      attempt!.retryReason = "fee-limit";
      attempt!.quotedFeeSats = fee;
    },
    orphan: (fail = false, changed = false) => {
      attempt = undefined;
      serverIntent = { request_id: requestId, state: "challenged", txid: null };
      failReconciliation = fail;
      changeIntentOnRecheck = changed;
    },
  };
}

test("confirmed cancellation reuses the original server reservation and never substitutes a request ID", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.setAttempt("aborted");
  assert.equal((await f.gateway.page(book, 3)).purchase?.txid, purchase.txid);
  assert.deepEqual(f.ids, [requestId]);
  assert.equal(f.counts().creates, 1);
});

test("uncertain attempt and mismatched reservation cannot create replacement payments", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  for (const state of ["preparing", "signing", "signed"] as const) {
    f.setAttempt(state);
    await assert.rejects(
      f.gateway.page(book, 3),
      (error) => error instanceof ReaderError && error.action === "check",
    );
  }
  f.setAttempt("aborted", true);
  await assert.rejects(f.gateway.page(book, 3), /Check payment/);
  assert.equal(f.counts().creates, 0);
  assert.equal(f.ids.length, 0);
});

test("Check payment after cancellation offers an explicit retry without starting a payment", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.setAttempt("aborted");
  await assert.rejects(
    f.gateway.page(book, 3, true),
    (error) => error instanceof ReaderError && error.action === "retry",
  );
  assert.deepEqual(f.counts(), { creates: 0, recoveries: 0 });
});

test("known cancelled fee quote offers a page-bound approval; invalid bindings cannot spend", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.setAttempt("aborted");
  f.rejectedFee(23);
  let approval: NonNullable<ReaderError["feeApproval"]> | undefined;
  await assert.rejects(f.gateway.page(book, 3, true), (error) => {
    assert.ok(error instanceof ReaderError);
    approval = error.feeApproval;
    return true;
  });
  assert.deepEqual(approval, { identityKey: "reader", edition: "edition", page: 3, requestId, maxFeeSats: 23 });
  for (const changed of [
    { identityKey: "another" }, { edition: "another" }, { page: 4 },
    { requestId: "another" }, { maxFeeSats: 24 }, { maxFeeSats: NaN },
  ]) await assert.rejects(f.gateway.page(book, 3, false, { ...approval!, ...changed }), /fee quote changed/);
  assert.deepEqual(f.counts(), { creates: 0, recoveries: 0 });
  await f.gateway.page(book, 3, false, approval);
  assert.deepEqual(f.ids, [requestId]);
  assert.deepEqual(f.feeCaps, [23]);
  f.setAttempt("aborted");
  f.rejectedFee(23);
  await f.gateway.page(book, 3);
  assert.deepEqual(f.feeCaps, [23, undefined]);
});

test("unknown fee or unresolved signing never offers a higher fee approval", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  for (const state of ["aborted", "signing"] as const) {
    f.setAttempt(state);
    f.rejectedFee(state === "aborted" ? null : 23);
    await assert.rejects(f.gateway.page(book, 3, true), (error) => {
      assert.ok(error instanceof ReaderError);
      assert.equal(error.feeApproval, undefined);
      return true;
    });
  }
  assert.equal(f.counts().creates, 0);
});

test("Check payment reports unresolved stages and saved wallet code without creating a replacement", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.setAttempt("preparing");
  f.savedFailure();
  await assert.rejects(f.gateway.page(book, 3, true), (error) => {
    assert.ok(error instanceof ReaderError);
    assert.match(error.message, /Payment checked: no completed page purchase/);
    assert.equal(error.action, "check");
    assert.ok(error.details?.includes("Page 3; wallet stage: preparing."));
    assert.ok(error.details?.includes("Server payment stage: challenged."));
    assert.ok(error.details?.some((line) => line.includes("createAction") && line.includes("MOBILE_FAILURE")));
    return true;
  });
  assert.deepEqual(f.counts(), { creates: 0, recoveries: 0 });
  assert.deepEqual(f.ids, []);
});

test("orphan challenge recovery checks without paying, then explicit retry uses the original request", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.orphan();
  await assert.rejects(f.gateway.page(book, 3, true), (error) => {
    assert.ok(error instanceof ReaderError);
    assert.equal(error.action, "retry");
    assert.match(error.message, /wallet history contains only received funds/);
    return true;
  });
  assert.deepEqual(f.counts(), { creates: 0, recoveries: 0 });
  assert.deepEqual(f.ids, []);
  await f.gateway.page(book, 3);
  assert.deepEqual(f.ids, [requestId]);
  assert.equal(f.counts().creates, 1);
});

test("history refusal or a changed server intent keeps an orphan blocked without paying", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.orphan(true);
  await assert.rejects(f.gateway.page(book, 3, true), /received-funds-only/);
  f.orphan(false, true);
  await assert.rejects(f.gateway.page(book, 3, true), /still unresolved/);
  assert.deepEqual(f.counts(), { creates: 0, recoveries: 0 });
  assert.deepEqual(f.ids, []);
});

test("fresh browser recovers the server-submitted proof without starting a wallet action", async (t) => {
  const f = fixture(t);
  await f.gateway.library();
  f.submitted();
  assert.equal(
    (await f.gateway.page(book, 3, true)).purchase?.txid,
    purchase.txid,
  );
  assert.deepEqual(f.counts(), { creates: 0, recoveries: 1 });
});

test("logout clears active identity while preserving recovery records; failed history never becomes zero", async (t) => {
  const f = fixture(t);
  await f.gateway.connect(book);
  assert.equal(f.gateway.identity(), "reader");
  assert.equal(f.gateway.walletVersion(), "fixture-version");
  assert.equal(f.gateway.historyState(), "ready");
  const journalKey = "pagestream-payment-v2:reader:edition:3";
  f.values.set(journalKey, "existing-signed-proof");
  f.values.set(
    "pagestream-spike-spends-v1",
    '{"original":{"txid":"original","identityKey":"reader","edition":"edition","page":3,"sats":5,"feeSats":1,"state":"unresolved"}}',
  );
  const before = new Map(f.values);
  f.gateway.disconnect();
  assert.equal(f.gateway.identity(), null);
  assert.equal(f.gateway.receipts().length, 0);
  assert.deepEqual(f.values, before);
  f.historyFailure();
  await assert.rejects(f.gateway.connect(book), /History offline/);
  assert.equal(f.gateway.historyState(), "error");
  assert.equal(f.gateway.receipts().length, 1);
  assert.equal(f.gateway.receipts()[0].state, "unresolved");
});
