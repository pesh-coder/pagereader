import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAuthMiddleware,
  type AuthRequest,
} from "@bsv/auth-express-middleware";
import {
  createPaymentMiddleware,
  type PaymentRequest,
} from "@bsv/payment-express-middleware";
import {
  createNonce,
  Transaction,
  Utils,
  type WalletInterface,
} from "@bsv/sdk";
import { config } from "./config.js";
import { manifest } from "./manifest.js";
import type { CatalogueBook, Edition } from "./content.js";
import { PaymentConflictError, Store } from "./store.js";
import { requestLimit } from "./request-limits.js";
import { receivingWallet, type RequestTiming } from "./receiving-wallet.js";

export function createProbe(options: {
  store: Store;
  edition: Edition;
  catalogue?: CatalogueBook[];
  wallet?: WalletInterface;
  serverIdentity?: string;
  manifestEnabled?: boolean;
  stateDirectory?: string;
  purchasesPaused?: () => boolean;
  research?: boolean;
  rateLimits?: boolean;
}) {
  const { store, edition } = options;
  const catalogue = options.catalogue ?? [
    { id: "holmes", gid: 1661, edition, sourceFile: "gutenberg-1661.txt" },
  ];
  const editions = new Map(
    catalogue.map((book) => [book.edition.id, book.edition]),
  );
  const editionFor = (req: Request) =>
    req.params.editionId
      ? editions.get(String(req.params.editionId))!
      : edition;
  // Legacy probe URLs keep their 43-page research window and original edition.
  // Product URLs bind the immutable edition explicitly, with no URL rewriting
  // that could change the path covered by BRC-103 authentication.
  const paths = (path: string) =>
    options.research === false
      ? [`/api/editions/:editionId/${path}`]
      : [`/api/${path}`, `/api/editions/:editionId/${path}`];
  const stateDirectory =
    options.stateDirectory ??
    fileURLToPath(new URL("../data/", import.meta.url));
  const purchasesPaused =
    options.purchasesPaused ??
    (() => existsSync(join(stateDirectory, "PAID_REQUESTS_PAUSED")));
  // Explicit operator test permit: one identity, edition, page and request ID.
  // Global pause stays in place, including for every browser's fresh request.
  const permittedLiveTest = (
    identity: string,
    edition: Edition,
    page: number,
    requestId: string | undefined,
  ) => {
    try {
      const permit = JSON.parse(
        readFileSync(join(stateDirectory, "LIVE_PAYMENT_PROBE.json"), "utf8"),
      );
      return (
        permit.identityKey === identity &&
        permit.edition === edition.id &&
        permit.page === page &&
        permit.requestId === requestId &&
        Number.isSafeInteger(permit.expiresAt) &&
        permit.expiresAt > Date.now() &&
        permit.expiresAt <= Date.now() + config.provisional.liveTestPermitMs
      );
    } catch {
      return false;
    }
  };
  const app = express();
  app.param("editionId", (_req, res, next, id: string) => {
    if (!editions.has(id)) {
      res.status(404).json({ error: "Edition not found" });
      return;
    }
    next();
  });
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb", strict: true }));
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    });
    next();
  });
  const context = new AsyncLocalStorage<RequestTiming>();
  app.use((_req, _res, next) =>
    context.run(
      {
        start: performance.now(),
        internalizeMs: 0,
        dbMs: 0,
        authMs: 0,
        serverWalletMs: 0,
        serverWalletCalls: 0,
        walletInternalizeMs: 0,
        receiptCommitMs: 0,
      },
      next,
    ),
  );
  const db = <T>(fn: () => T): T => {
    const start = performance.now();
    try {
      return fn();
    } finally {
      const t = context.getStore();
      if (t) t.dbMs += performance.now() - start;
    }
  };
  const pageNumber = (req: Request) => Number(req.params.page);
  const validPage = (req: Request, page: number) =>
    Number.isInteger(page) &&
    page > 0 &&
    page <= editionFor(req).pages.length &&
    (Boolean(req.params.editionId) || page <= config.maxProbePage);
  const pageBody = (req: Request, page: number) => ({
    editionId: editionFor(req).id,
    page,
    paragraphs: editionFor(req).pages[page - 1],
  });
  const timing = (res: Response) => {
    const t = context.getStore()!;
    const result = {
      serverMs: performance.now() - t.start,
      internalizeMs: t.internalizeMs,
      dbMs: t.dbMs,
      authMs: t.authMs,
      serverWalletMs: t.serverWalletMs,
      serverWalletCalls: t.serverWalletCalls,
      walletInternalizeMs: t.walletInternalizeMs,
      receiptCommitMs: t.receiptCommitMs,
    };
    // Durations overlap: wallet includes authentication/internalization calls;
    // receipt commit is part of DB time. Do not sum these as exclusive phases.
    res.set(
      "Server-Timing",
      [
        ["app", result.serverMs],
        ["auth", result.authMs],
        ["wallet", result.serverWalletMs],
        ["internalize", result.walletInternalizeMs],
        ["receipt", result.receiptCommitMs],
        ["db", result.dbMs],
      ]
        .map(([name, ms]) => `${name};dur=${Number(ms).toFixed(3)}`)
        .join(", "),
    );
    return result;
  };
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      network: "main",
      paymentReady: Boolean(options.wallet),
      purchasesPaused: purchasesPaused(),
    }),
  );
  if (options.research !== false)
    app.get("/api/catalogue", (_req, res) =>
      res.json({
        editionId: edition.id,
        title: edition.title,
        author: edition.author,
        pages: config.maxProbePage,
        sourceUrl: edition.sourceUrl,
        config,
        purchasesPaused: purchasesPaused(),
        manifestEnabled: options.manifestEnabled ?? true,
      }),
    );
  app.get("/api/library", (_req, res) =>
    res.json({
      books: catalogue.map(({ id, gid, edition: book }) => ({
        id,
        gid,
        title: book.title,
        author: book.author,
        mode: "reader",
        editionId: book.id,
        pages: book.pages.length,
        sourceUrl: `https://www.gutenberg.org/ebooks/${gid}`,
      })),
      purchasesPaused: purchasesPaused(),
    }),
  );
  // Preserve the full original source and notices, independently of paid content.
  app.get("/api/editions/:editionId/notices", (req, res) => {
    const book = catalogue.find(
      (book) => book.edition.id === req.params.editionId,
    )!;
    const source = readFileSync(
      new URL(`../data/${book.sourceFile}`, import.meta.url),
      "utf8",
    );
    const start = source.search(
      /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i,
    );
    const end = source.search(
      /\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i,
    );
    if (start < 0 || end <= start) {
      res.status(500).json({ error: "Edition notices unavailable" });
      return;
    }
    res
      .type("text")
      .send(
        source.slice(0, start) +
          "\n[Book text served in fixed pages.]\n\n" +
          source.slice(end),
      );
  });
  app.get(paths("public/pages/:page"), (req, res) => {
    const page = pageNumber(req);
    if (!validPage(req, page)) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    if (page > config.freePages) {
      res
        .status(403)
        .json({ error: "Paid page requires an authenticated purchase route" });
      return;
    }
    res.json(pageBody(req, page));
  });
  app.get("/manifest.json", (_req, res) => {
    if (options.manifestEnabled === false || !options.serverIdentity) {
      res.sendStatus(404);
      return;
    }
    res.json(manifest(options.serverIdentity));
  });
  app.get("/icon.svg", (_req, res) =>
    res
      .type("svg")
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="white"/><text x="30" y="96" font-size="96" fill="#221D18">¶</text></svg>',
      ),
  );
  // Same origin as the proven payment flow; no new wallet origin/identity.
  app.use(
    "/reader",
    express.static(
      fileURLToPath(new URL("../../app/client/dist", import.meta.url)),
    ),
  );
  if (options.research !== false)
    app.use(
      express.static(fileURLToPath(new URL("../dist/public", import.meta.url))),
    );
  else {
    app.get("/", (_req, res) => res.redirect("/reader/"));
    // Unknown and legacy paths never enter expensive authentication.
    app.use((req, res, next) => {
      if (
        req.path !== "/.well-known/auth" &&
        !/^\/api\/editions\/[^/]+\/(?:me|status\/\d+|owned\/\d+|recover\/\d+|bookmarks|pages\/\d+)$/.test(
          req.path,
        )
      ) {
        res.sendStatus(404);
        return;
      }
      next();
    });
  }
  if (!options.wallet) {
    app.use((_req, res) =>
      res
        .status(503)
        .json({
          error:
            "Live server wallet not configured. Public pages remain available.",
        }),
    );
    return app;
  }
  const wallet = receivingWallet(
    options.wallet,
    store,
    () => context.getStore()!,
    db,
  );
  // Public routes above never enter authentication. The handshake remains at the origin root.
  if (options.rateLimits !== false)
    app.use(
      requestLimit({
        limit: 240,
        windowMs: 60000,
        key: (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
      }),
    );
  app.use((_req, _res, next) => {
    context.getStore()!.authStart = performance.now();
    next();
  });
  app.use(createAuthMiddleware({ wallet, allowUnauthenticated: false }));
  app.use((_req, _res, next) => {
    const t = context.getStore()!;
    t.authMs = performance.now() - t.authStart!;
    next();
  });
  const identity = (req: Request) => (req as AuthRequest).auth!.identityKey;
  app.get(paths("me"), (req, res) =>
    res.json({
      identityKey: identity(req),
      purchases: db(() => store.purchases(identity(req), editionFor(req).id)),
      bookmark: db(() => store.bookmark(identity(req), editionFor(req).id)),
    }),
  );
  app.get(paths("status/:page"), (req, res) => {
    const edition = editionFor(req);
    const page = pageNumber(req);
    if (!validPage(req, page)) {
      res.sendStatus(404);
      return;
    }
    res.json({
      purchase: db(() => store.owned(identity(req), edition.id, page)) ?? null,
      intent: db(() => store.intent(identity(req), edition.id, page)) ?? null,
    });
  });
  app.put(paths("bookmarks"), (req, res) => {
    const edition = editionFor(req);
    const { page, displayedAt } = req.body ?? {};
    if (
      !validPage(req, page) ||
      !Number.isSafeInteger(displayedAt) ||
      displayedAt < 0 ||
      displayedAt > Date.now() + 30000
    ) {
      res.status(400).json({ error: "Invalid displayed-page bookmark" });
      return;
    }
    if (
      page > config.freePages &&
      !db(() => store.owned(identity(req), edition.id, page))
    ) {
      res.sendStatus(403);
      return;
    }
    db(() => store.saveBookmark(identity(req), edition.id, page, displayedAt));
    res.json({ saved: true });
  });
  app.get(paths("owned/:page"), (req, res) => {
    const edition = editionFor(req);
    const page = pageNumber(req);
    if (!validPage(req, page)) {
      res.sendStatus(404);
      return;
    }
    const purchase = db(() => store.owned(identity(req), edition.id, page));
    if (!purchase) {
      res
        .status(404)
        .json({
          error: "No confirmed purchase; this route cannot trigger payment",
        });
      return;
    }
    res.json({ ...pageBody(req, page), purchase, timing: timing(res) });
  });
  // Minimal guard for safe tier-1 live runs. No expiry or automatic reissue of uncertain intents.
  const reserveLimit = requestLimit({
    limit: 30,
    windowMs: 60000,
    key: (req) => `${identity(req)}`,
  });
  app.use(paths("pages/:page"), (req, res, next) => {
    // Keep recovery/owned delivery available while limiting fresh reservations.
    if (
      options.rateLimits !== false &&
      !req.get("x-bsv-payment") &&
      !store.owned(identity(req), editionFor(req).id, pageNumber(req))
    )
      reserveLimit(req, res, next);
    else next();
  });
  app.use(paths("pages/:page"), async (req, res, next) => {
    const edition = editionFor(req);
    const page = pageNumber(req);
    if (
      req.method !== "GET" ||
      !validPage(req, page) ||
      page <= config.freePages
    ) {
      res.sendStatus(404);
      return;
    }
    const key = identity(req);
    const paymentHeader = req.get("x-bsv-payment");
    const owned = db(() => store.owned(key, edition.id, page));
    if (owned) {
      if (paymentHeader) {
        try {
          const proof = JSON.parse(paymentHeader);
          const intent = db(() => store.intent(key, edition.id, page));
          const txid = Transaction.fromAtomicBEEF(
            Utils.toArray(proof.transaction, "base64"),
          ).id("hex");
          if (
            !intent ||
            txid !== owned.txid ||
            intent.request_id !== req.get("x-bsv-request-id") ||
            intent.prefix !== proof.derivationPrefix
          ) {
            res
              .status(409)
              .json({ error: "Payment does not match this purchase" });
            return;
          }
        } catch {
          res.status(400).json({ error: "Malformed payment" });
          return;
        }
      }
      res.json({
        ...pageBody(req, page),
        purchase: owned,
        timing: timing(res),
      });
      return;
    }
    // Keep existing payment submissions recoverable; refuse every fresh spending challenge.
    if (
      !paymentHeader &&
      purchasesPaused() &&
      !permittedLiveTest(key, edition, page, req.get("x-bsv-request-id"))
    ) {
      res
        .status(503)
        .json({
          error:
            "Paid testing paused: investigating wallet debit and delayed-approval failures. Do not create another payment.",
        });
      return;
    }
    const requestId = req.get("x-bsv-request-id");
    if (!requestId || !/^[a-f0-9-]{36}$/.test(requestId)) {
      res.status(400).json({ error: "Request correlation ID required" });
      return;
    }
    if (!paymentHeader) {
      const previous = db(() => store.intent(key, edition.id, page));
      if (
        previous?.request_id === requestId &&
        previous.state === "challenged" &&
        previous.prefix
      ) {
        // Same durable intent after an explicitly aborted unsigned action. This
        // reuses the original nonce; no second reservation or expiry is created.
        res
          .status(402)
          .set({
            "x-bsv-payment-version": "1.0",
            "x-bsv-payment-satoshis-required": String(config.priceSats),
            "x-bsv-payment-derivation-prefix": previous.prefix,
          })
          .json({ error: "Payment required for the existing intent" });
        return;
      }
      if (
        !(
          previous?.request_id === requestId && previous.state === "reserved"
        ) &&
        !db(() => store.reserve(key, edition.id, page, requestId))
      ) {
        res
          .status(409)
          .json({
            error:
              "Purchase in progress or unresolved. Check the original payment.",
          });
        return;
      }
      // Explicit BRC-105 challenge contract; no response-method interception.
      const prefix = await createNonce(wallet);
      db(() => store.challenge(key, edition.id, page, prefix));
      res
        .status(402)
        .set({
          "x-bsv-payment-version": "1.0",
          "x-bsv-payment-satoshis-required": String(config.priceSats),
          "x-bsv-payment-derivation-prefix": prefix,
        })
        .json({
          code: "ERR_PAYMENT_REQUIRED",
          satoshisRequired: config.priceSats,
        });
      return;
    } else {
      try {
        const payment = JSON.parse(paymentHeader);
        const intent = db(() => store.intent(key, edition.id, page));
        if (
          !intent ||
          intent.request_id !== requestId ||
          intent.prefix !== payment.derivationPrefix ||
          !["challenged", "submitted", "accepted"].includes(intent.state)
        ) {
          res
            .status(409)
            .json({
              error: "Intent mismatch or uncertain submission; reconcile first",
            });
          return;
        }
        const txid = Transaction.fromAtomicBEEF(
          Utils.toArray(payment.transaction, "base64"),
        ).id("hex");
        if (intent.txid && intent.txid !== txid) {
          res
            .status(409)
            .json({ error: "Existing intent is bound to another transaction" });
          return;
        }
        db(() => store.submitted(key, edition.id, page, txid, paymentHeader));
        context.getStore()!.payment = {
          identity: key,
          edition: edition.id,
          page,
          txid,
        };
      } catch (error) {
        if (error instanceof PaymentConflictError) {
          res
            .status(409)
            .json({ error: "Payment already bound to another purchase" });
          return;
        }
        res.status(400).json({ error: "Malformed payment" });
        return;
      }
    }
    next();
  });
  // Acceptance already commits receipt + replay claim + entitlement atomically.
  const payments = createPaymentMiddleware({
    wallet,
    calculateRequestPrice: () => config.priceSats,
    replayStore: { claim: (txid) => context.getStore()?.acceptedTxid === txid },
  });
  // A fresh browser may have no local journal after the wallet accepted a
  // payment. Only recover the proof already submitted for this exact caller's
  // intent. No challenge, transaction creation or new payment is possible here.
  app.post(
    paths("recover/:page"),
    (req, res, next) => {
      const edition = editionFor(req),
        page = pageNumber(req),
        key = identity(req);
      if (!validPage(req, page) || page <= config.freePages) {
        res.sendStatus(404);
        return;
      }
      const purchase = db(() => store.owned(key, edition.id, page));
      if (purchase) {
        res.json({ ...pageBody(req, page), purchase, timing: timing(res) });
        return;
      }
      const intent = db(() => store.intent(key, edition.id, page));
      const saved = intent?.txid
        ? db(() => store.proof(intent.txid!))
        : undefined;
      if (
        !intent?.txid ||
        !saved ||
        saved.identity !== key ||
        saved.edition !== edition.id ||
        saved.page !== page
      ) {
        res
          .status(409)
          .json({
            error:
              "No submitted payment proof is available. Keep the original wallet attempt.",
          });
        return;
      }
      req.headers["x-bsv-payment"] = saved.proof;
      context.getStore()!.payment = {
        identity: key,
        edition: edition.id,
        page,
        txid: intent.txid,
      };
      payments(req, res, next);
    },
    (req, res) => {
      const purchase = db(() =>
        store.owned(identity(req), editionFor(req).id, pageNumber(req)),
      );
      if (!purchase || purchase.txid !== context.getStore()!.acceptedTxid) {
        res
          .status(409)
          .json({ error: "The original payment could not be restored." });
        return;
      }
      res.json({
        ...pageBody(req, pageNumber(req)),
        purchase,
        timing: timing(res),
      });
    },
  );
  app.get(paths("pages/:page"), payments, (req: Request, res: Response) => {
    const payment = (req as PaymentRequest).payment!;
    const page = pageNumber(req);
    const purchase = db(() =>
      store.owned(identity(req), editionFor(req).id, page),
    );
    if (!purchase || purchase.txid !== payment.txid)
      throw new Error("Accepted receipt missing");
    res.json({ ...pageBody(req, page), purchase, timing: timing(res) });
  });
  app.use(
    (_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (!res.headersSent)
        res
          .status(500)
          .json({
            error:
              "Probe failed; reconcile any created payment before retrying",
          });
    },
  );
  return app;
}
