import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import http from "node:http";
import {
  AuthFetch,
  P2PKH,
  PrivateKey,
  ProtoWallet,
  Script,
  Transaction,
  type WalletInterface,
} from "@bsv/sdk";
import { loadCatalogue, loadEdition, segment } from "../src/content.js";
import { Store } from "../src/store.js";
import { createProbe } from "../src/probe.js";

test("eight complete fixed editions retain exact source checksums and the entitled Holmes edition", () => {
  const books = loadCatalogue();
  assert.equal(books.length, 8);
  assert.equal(
    books[0].edition.id,
    "1661-922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0-paragraphs-1800-v1",
  );
  assert.deepEqual(books[0].edition, loadEdition());
  for (const { edition, sourceFile } of books) {
    const bytes = readFileSync(
      new URL(`../data/${sourceFile}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      edition.checksum,
    );
    assert.ok(edition.pages.length > 20);
    assert.deepEqual(segment(edition.pages.flat().join("\n\n")), edition.pages);
    assert.ok(bytes.includes(Buffer.from("PROJECT GUTENBERG")));
  }
});

test("Git preserves immutable source bytes regardless of platform line-ending settings", () => {
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  for (const { sourceFile } of loadCatalogue()) {
    const path = `spike/data/${sourceFile}`;
    const bytes = readFileSync(
      new URL(`../data/${sourceFile}`, import.meta.url),
    );
    const rawHash = execFileSync(
      "git",
      ["hash-object", "--no-filters", "--stdin"],
      { cwd, input: bytes, encoding: "utf8" },
    ).trim();
    for (const setting of ["true", "false", "input"]) {
      const filteredHash = execFileSync(
        "git",
        [
          "-c",
          `core.autocrlf=${setting}`,
          "hash-object",
          `--path=${path}`,
          "--stdin",
        ],
        { cwd, input: bytes, encoding: "utf8" },
      ).trim();
      assert.equal(
        filteredHash,
        rawHash,
        `${sourceFile}, core.autocrlf=${setting}`,
      );
    }
  }
});

test("every edition has two wallet-free public pages and notices; paid text and source files stay private", async (t) => {
  const catalogue = loadCatalogue();
  const store = new Store(":memory:");
  let calls = 0;
  const wallet = new Proxy(new ProtoWallet(PrivateKey.fromRandom()), {
    get(target, property) {
      const value = Reflect.get(target, property);
      return typeof value === "function"
        ? (...args: unknown[]) => {
            calls++;
            return value.apply(target, args);
          }
        : value;
    },
  }) as unknown as WalletInterface;
  const server = http.createServer(
    createProbe({
      store,
      edition: loadEdition(),
      catalogue,
      wallet,
      purchasesPaused: () => true,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    store.close();
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const { edition } of catalogue) {
    const prefix = `${base}/api/editions/${edition.id}`;
    for (const page of [1, 2]) {
      const response = await fetch(`${prefix}/public/pages/${page}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        editionId: edition.id,
        page,
        paragraphs: edition.pages[page - 1],
      });
    }
    assert.equal((await fetch(`${prefix}/public/pages/3`)).status, 403);
    const notices = await fetch(`${prefix}/notices`);
    assert.equal(notices.status, 200);
    const text = await notices.text();
    assert.ok(text.includes("PROJECT GUTENBERG"));
    assert.ok(!text.includes(edition.pages[2][0]));
  }
  assert.equal(
    (await fetch(base + "/api/editions/unknown/public/pages/1")).status,
    404,
  );
  assert.equal(calls, 0);
  assert.equal((await fetch(base + "/data/catalogue.json")).status, 401);
  assert.equal((await fetch(base + "/data/edition.json")).status, 401);
});

test("scoped BRC-105 delivery, receipts, bookmarks and replay binding remain independent across editions", async (t) => {
  const catalogue = loadCatalogue();
  const [a, b] = catalogue.slice(0, 2).map((book) => book.edition);
  const store = new Store(":memory:");
  const reader = new ProtoWallet(PrivateKey.fromRandom());
  const receiver = new ProtoWallet(PrivateKey.fromRandom());
  const identity = (await reader.getPublicKey({ identityKey: true })).publicKey;
  let creates = 0,
    internalizes = 0,
    paused = false;
  const received = new Set<string>();
  const wallet = new Proxy(receiver, {
    get(target, property) {
      if (property === "internalizeAction")
        return async (
          args: Parameters<WalletInterface["internalizeAction"]>[0],
        ) => {
          internalizes++;
          const txid = Transaction.fromAtomicBEEF(args.tx).id("hex");
          const isMerge = received.has(txid);
          received.add(txid);
          return { accepted: true, isMerge };
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as WalletInterface;
  const readerWallet = new Proxy(reader, {
    get(target, property) {
      if (property === "createAction")
        return async (args: Parameters<WalletInterface["createAction"]>[0]) => {
          creates++;
          const key = PrivateKey.fromRandom(),
            script = new P2PKH().lock(key.toAddress());
          const parent = new Transaction(
            1,
            [],
            [{ satoshis: 5000, lockingScript: script }],
          );
          const tx = new Transaction(
            1,
            [
              {
                sourceTransaction: parent,
                sourceTXID: parent.id("hex"),
                sourceOutputIndex: 0,
                sequence: 4294967295,
                unlockingScript: Script.fromHex(""),
                unlockingScriptTemplate: new P2PKH().unlock(key),
              },
            ],
            [
              {
                satoshis: 5,
                lockingScript: Script.fromHex(args.outputs![0].lockingScript),
              },
              { satoshis: 4994, lockingScript: script },
            ],
          );
          await tx.sign();
          return { txid: tx.id("hex"), tx: tx.toAtomicBEEF() };
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as WalletInterface;
  const server = http.createServer(
    createProbe({
      store,
      edition: a,
      catalogue,
      wallet,
      purchasesPaused: () => paused,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    store.close();
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const saved = new Map<string, { proof: string; requestId: string }>();
  const transport: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.has("x-bsv-payment"))
      saved.set(new URL(String(input)).pathname, {
        proof: headers.get("x-bsv-payment")!,
        requestId: headers.get("x-bsv-request-id")!,
      });
    return fetch(input, init);
  };
  const auth = new AuthFetch(
    readerWallet,
    undefined,
    undefined,
    undefined,
    undefined,
    transport,
  );
  const prefix = (edition: string) => `${base}/api/editions/${edition}`;
  const first = await auth.fetch(prefix(a.id) + "/pages/3", {
    headers: { "x-bsv-request-id": crypto.randomUUID() },
    paymentRetryAttempts: 1,
  });
  assert.equal(first.status, 200);
  const ownedA = await first.json();
  assert.equal(ownedA.editionId, a.id);
  assert.equal(store.owned(identity, b.id, 3), undefined);
  assert.equal((await auth.fetch(prefix(b.id) + "/owned/3")).status, 404);
  const proofA = saved.get(`/api/editions/${a.id}/pages/3`)!;
  const replay = await auth.fetch(prefix(b.id) + "/pages/3", {
    headers: {
      "x-bsv-request-id": proofA.requestId,
      "x-bsv-payment": proofA.proof,
    },
    paymentRetryAttempts: 1,
  });
  assert.equal(replay.status, 409);
  assert.equal(internalizes, 1);
  const second = await auth.fetch(prefix(b.id) + "/pages/3", {
    headers: { "x-bsv-request-id": crypto.randomUUID() },
    paymentRetryAttempts: 1,
  });
  assert.equal(second.status, 200);
  const ownedB = await second.json();
  assert.equal(ownedB.editionId, b.id);
  assert.notEqual(ownedA.purchase.txid, ownedB.purchase.txid);
  paused = true;
  for (const [edition, page] of [
    [a.id, 3],
    [b.id, 2],
  ] as const) {
    const save = await auth.fetch(prefix(edition) + "/bookmarks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, displayedAt: Date.now() }),
    });
    assert.equal(save.status, 200);
    const me = await (await auth.fetch(prefix(edition) + "/me")).json();
    assert.equal(me.bookmark.page, page);
    assert.equal(me.purchases.length, 1);
  }
  assert.equal(store.bookmark(identity, a.id)?.page, 3);
  assert.equal(store.bookmark(identity, b.id)?.page, 2);
  const reread = await auth.fetch(prefix(b.id) + "/owned/3");
  assert.equal((await reread.json()).purchase.txid, ownedB.purchase.txid);
  const blocked = await auth.fetch(prefix(b.id) + "/pages/4", {
    headers: { "x-bsv-request-id": crypto.randomUUID() },
    paymentRetryAttempts: 1,
  });
  assert.equal(blocked.status, 503);
  // Full product edition extends beyond the legacy probe window.
  store.purchase(identity, a.id, 44, "synthetic-page-44", 5);
  assert.equal((await auth.fetch(prefix(a.id) + "/owned/44")).status, 200);
  assert.equal((await auth.fetch(base + "/api/owned/44")).status, 404);
  for (const { gid, edition } of catalogue) {
    const page = edition.pages.length;
    store.purchase(
      identity,
      edition.id,
      page,
      `synthetic-final-page-${gid}`,
      5,
    );
    const final = await auth.fetch(prefix(edition.id) + `/owned/${page}`);
    assert.equal(final.status, 200);
    assert.deepEqual((await final.json()).paragraphs, edition.pages.at(-1));
    assert.equal(
      (await auth.fetch(prefix(edition.id) + `/owned/${page + 1}`)).status,
      404,
    );
  }
  assert.equal(creates, 2);
  assert.equal(internalizes, 2);
});
