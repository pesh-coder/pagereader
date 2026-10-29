import { DatabaseSync } from "node:sqlite";

export interface Purchase {
  page: number;
  txid: string;
  sats: number;
  feeSats?: number;
}
export class PaymentConflictError extends Error {}
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS purchases(identity TEXT NOT NULL, edition TEXT NOT NULL, page INTEGER NOT NULL, txid TEXT NOT NULL UNIQUE, sats INTEGER NOT NULL, PRIMARY KEY(identity,edition,page));
      CREATE TABLE IF NOT EXISTS replay_claims(txid TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS bookmarks(identity TEXT NOT NULL, edition TEXT NOT NULL, page INTEGER NOT NULL, displayed_at INTEGER NOT NULL, PRIMARY KEY(identity,edition));
      CREATE TABLE IF NOT EXISTS intents(identity TEXT NOT NULL, edition TEXT NOT NULL, page INTEGER NOT NULL, request_id TEXT NOT NULL, prefix TEXT, txid TEXT, state TEXT NOT NULL DEFAULT 'reserved', PRIMARY KEY(identity,edition,page));`);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS payment_proofs(txid TEXT PRIMARY KEY, identity TEXT NOT NULL, edition TEXT NOT NULL, page INTEGER NOT NULL, proof TEXT NOT NULL);`,
    );
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS purchase_costs(txid TEXT PRIMARY KEY REFERENCES purchases(txid), fee_sats INTEGER NOT NULL CHECK(fee_sats>=0), source TEXT NOT NULL);`,
    );
    this.db.exec(`CREATE TABLE IF NOT EXISTS intent_recoveries(
      identity TEXT NOT NULL, edition TEXT NOT NULL, page INTEGER NOT NULL,
      request_id TEXT NOT NULL, prefix TEXT, previous_state TEXT NOT NULL,
      reason TEXT NOT NULL, recovered_at TEXT NOT NULL, PRIMARY KEY(identity,edition,page,request_id));`);
  }
  purchases(identity: string, edition: string): Purchase[] {
    const rows = this.db
      .prepare(
        "SELECT p.page,p.txid,p.sats,c.fee_sats FROM purchases p LEFT JOIN purchase_costs c ON c.txid=p.txid WHERE p.identity=? AND p.edition=? ORDER BY p.page",
      )
      .all(identity, edition);
    return rows.map((row) => ({
      page: Number(row.page),
      txid: String(row.txid),
      sats: Number(row.sats),
      ...(row.fee_sats === null ? {} : { feeSats: Number(row.fee_sats) }),
    }));
  }
  owned(identity: string, edition: string, page: number) {
    return this.purchases(identity, edition).find((p) => p.page === page);
  }
  claim(txid: string): boolean {
    return (
      this.db.prepare("INSERT OR IGNORE INTO replay_claims VALUES(?)").run(txid)
        .changes === 1
    );
  }
  proof(txid: string) {
    return this.db
      .prepare(
        "SELECT identity,edition,page,proof FROM payment_proofs WHERE txid=?",
      )
      .get(txid) as
      | { identity: string; edition: string; page: number; proof: string }
      | undefined;
  }
  intent(identity: string, edition: string, page: number) {
    return this.db
      .prepare(
        "SELECT * FROM intents WHERE identity=? AND edition=? AND page=?",
      )
      .get(identity, edition, page) as
      | {
          request_id: string;
          prefix: string | null;
          txid: string | null;
          state: string;
        }
      | undefined;
  }
  reserve(
    identity: string,
    edition: string,
    page: number,
    requestId: string,
  ): boolean {
    return (
      this.db
        .prepare(
          "INSERT OR IGNORE INTO intents(identity,edition,page,request_id) VALUES(?,?,?,?)",
        )
        .run(identity, edition, page, requestId).changes === 1
    );
  }
  challenge(identity: string, edition: string, page: number, prefix: string) {
    this.db
      .prepare(
        "UPDATE intents SET prefix=?,state='challenged' WHERE identity=? AND edition=? AND page=? AND prefix IS NULL",
      )
      .run(prefix, identity, edition, page);
  }
  submitted(
    identity: string,
    edition: string,
    page: number,
    txid: string,
    proof?: string,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const intent = this.intent(identity, edition, page);
      if (!intent || (intent.txid && intent.txid !== txid))
        throw new PaymentConflictError("Payment transaction changed");
      if (proof) {
        const existing = this.db
          .prepare(
            "SELECT identity,edition,page FROM payment_proofs WHERE txid=?",
          )
          .get(txid);
        if (
          existing &&
          (existing.identity !== identity ||
            existing.edition !== edition ||
            existing.page !== page)
        )
          throw new PaymentConflictError(
            "Payment already bound to another purchase",
          );
        this.db
          .prepare("INSERT OR IGNORE INTO payment_proofs VALUES(?,?,?,?,?)")
          .run(txid, identity, edition, page, proof);
      }
      this.db
        .prepare(
          "UPDATE intents SET txid=?,state='submitted' WHERE identity=? AND edition=? AND page=? AND state!='confirmed'",
        )
        .run(txid, identity, edition, page);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  recordFee(txid: string, feeSats: number, source: string) {
    if (
      !Number.isSafeInteger(feeSats) ||
      feeSats < 0 ||
      !source ||
      !this.db.prepare("SELECT 1 FROM purchases WHERE txid=?").get(txid)
    )
      throw new Error(
        "Verified fee requires an existing receipt and nonnegative integer amount",
      );
    const existing = this.db
      .prepare("SELECT fee_sats FROM purchase_costs WHERE txid=?")
      .get(txid);
    if (existing && existing.fee_sats !== feeSats)
      throw new Error("Verified receipt fee conflicts with existing evidence");
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO purchase_costs VALUES(?,?,?)")
        .run(txid, feeSats, source).changes === 1
    );
  }
  accepted(
    identity: string,
    edition: string,
    page: number,
    prefix: string,
    txid: string,
    sats: number,
    feeSats: number | null = null,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const intent = this.intent(identity, edition, page);
      if (!intent || intent.prefix !== prefix || intent.txid !== txid)
        throw new Error("Accepted payment does not match the submitted intent");
      const owned = this.owned(identity, edition, page);
      if (owned && owned.txid !== txid)
        throw new Error("Page already paid with another transaction");
      if (!owned) {
        if (!this.claim(txid)) throw new Error("Transaction already used");
        this.db
          .prepare("INSERT INTO purchases VALUES(?,?,?,?,?)")
          .run(identity, edition, page, txid, sats);
      }
      if (feeSats !== null)
        this.recordFee(txid, feeSats, "accepted-payment-proof");
      this.db
        .prepare(
          "UPDATE intents SET state='confirmed' WHERE identity=? AND edition=? AND page=?",
        )
        .run(identity, edition, page);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  // Operator-only recovery for a documented no-payment failure, after all old tabs are closed
  // and the reader checks wallet history. Absence of a server txid alone is insufficient.
  recoverInsufficientFunds(
    identity: string,
    edition: string,
    page: number,
    expectedRequestId: string,
    reason: string,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const intent = this.intent(identity, edition, page);
      if (
        !reason.trim() ||
        !intent ||
        intent.request_id !== expectedRequestId ||
        intent.state !== "challenged" ||
        intent.txid ||
        this.owned(identity, edition, page)
      )
        throw new Error(
          "Recovery refused: attempt changed, transaction submitted, or purchase exists",
        );
      this.db
        .prepare("INSERT INTO intent_recoveries VALUES(?,?,?,?,?,?,?,?)")
        .run(
          identity,
          edition,
          page,
          intent.request_id,
          intent.prefix,
          intent.state,
          reason,
          new Date().toISOString(),
        );
      const removed = this.db
        .prepare(
          "DELETE FROM intents WHERE identity=? AND edition=? AND page=? AND request_id=? AND state='challenged' AND txid IS NULL",
        )
        .run(identity, edition, page, expectedRequestId);
      if (removed.changes !== 1)
        throw new Error("Recovery refused: attempt changed");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  purchase(
    identity: string,
    edition: string,
    page: number,
    txid: string,
    sats: number,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO purchases VALUES(?,?,?,?,?)")
        .run(identity, edition, page, txid, sats);
      this.db
        .prepare(
          "UPDATE intents SET state='confirmed' WHERE identity=? AND edition=? AND page=?",
        )
        .run(identity, edition, page);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  bookmark(identity: string, edition: string) {
    return (
      this.db
        .prepare(
          "SELECT page,displayed_at FROM bookmarks WHERE identity=? AND edition=?",
        )
        .get(identity, edition) ?? null
    );
  }
  saveBookmark(
    identity: string,
    edition: string,
    page: number,
    displayedAt: number,
  ) {
    this.db
      .prepare(
        "INSERT INTO bookmarks VALUES(?,?,?,?) ON CONFLICT(identity,edition) DO UPDATE SET page=excluded.page,displayed_at=excluded.displayed_at WHERE excluded.displayed_at>=bookmarks.displayed_at",
      )
      .run(identity, edition, page, displayedAt);
  }
  close() {
    this.db.close();
  }
}
