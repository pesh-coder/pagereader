import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createProbe } from "../src/probe.js";
import { Store } from "../src/store.js";
import { loadCatalogue, loadEdition } from "../src/content.js";
import { requestLimit } from "../src/request-limits.js";

test("production reader omits research tools and legacy APIs without exposing operator config", async (t) => {
  const store = new Store(":memory:");
  const edition = loadEdition();
  const server = http.createServer(
    createProbe({
      store,
      edition,
      catalogue: loadCatalogue(),
      research: false,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    store.close();
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const path of [
    "/api/catalogue",
    "/api/me",
    "/api/pages/3",
    "/api/public/pages/1",
    "/client.js",
    "/grant-only.js",
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
  const root = await fetch(base + "/", { redirect: "manual" });
  assert.equal(root.headers.get("Location"), "/reader/");
  const library = await (await fetch(base + "/api/library")).json();
  assert.equal(library.books.length, 8);
  assert.equal(library.config, undefined);
  assert.equal(JSON.stringify(library).includes("liveTestPermitMs"), false);
  assert.equal(
    (await fetch(`${base}/api/editions/${edition.id}/public/pages/1`)).status,
    200,
  );
  const icon = await (await fetch(base + "/icon.svg")).text();
  assert.ok(icon.includes("¶"));
  assert.ok(!icon.includes("Â"));
});

test("bounded request limits isolate keys, return retry time, and expire without evicting live limits", async (t) => {
  let now = 1000;
  const app = express();
  app.use(
    requestLimit({
      limit: 2,
      windowMs: 1000,
      maxKeys: 2,
      now: () => now,
      key: (req) => req.get("x-test-key") ?? "one",
    }),
  );
  app.get("/", (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base)).status, 200);
  const limited = await fetch(base);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "1");
  assert.equal(
    (await fetch(base, { headers: { "x-test-key": "two" } })).status,
    200,
  );
  assert.equal(
    (await fetch(base, { headers: { "x-test-key": "three" } })).status,
    429,
  );
  now = 2001;
  assert.equal(
    (await fetch(base, { headers: { "x-test-key": "three" } })).status,
    200,
  );
});
