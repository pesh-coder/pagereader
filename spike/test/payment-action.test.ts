import { test } from "node:test";
import assert from "node:assert/strict";
import {
  P2PKH,
  Beef,
  BEEF_V2,
  PrivateKey,
  Script,
  Transaction,
  type WalletInterface,
} from "@bsv/sdk";
import {
  preparePayment,
  broadcastPayment,
  type PaymentAttempt,
} from "../src/payment-action.js";
import { paymentGraph } from '../scripts/inspect-payment.js';

function fixture(fee = 1) {
  const key = PrivateKey.fromRandom();
  const script = new P2PKH().lock(key.toAddress());
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
      { satoshis: 5, lockingScript: script },
      { satoshis: 4995 - fee, lockingScript: script },
    ],
  );
  const args: Parameters<WalletInterface["createAction"]>[0] = {
    description: "Fixture page payment",
    outputs: [
      {
        satoshis: 5,
        outputDescription: "Fixture page",
        lockingScript: script.toHex(),
        customInstructions: JSON.stringify({
          derivationPrefix: "cHJlZml4",
          derivationSuffix: "c3VmZml4",
        }),
      },
    ],
  };
  let attempt: PaymentAttempt = {
    identityKey: "reader",
    edition: "edition",
    page: 3,
    requestId: crypto.randomUUID(),
    state: "preparing",
  };
  const events: string[] = [];
  const journal = {
    get: () => attempt,
    save: (next: PaymentAttempt) => {
      attempt = structuredClone(next);
      events.push(next.state);
    },
  };
  const wallet = {
    async createAction(input: Parameters<WalletInterface["createAction"]>[0]) {
      if (input.options?.sendWith) {
        events.push("broadcast");
        assert.equal(attempt.state, "signed");
        assert.ok(attempt.proof);
        assert.deepEqual(input.options.sendWith, [attempt.txid]);
        assert.equal(input.outputs, undefined);
        return { sendWithResults: [{ txid: attempt.txid, status: 'unproven' }] };
      }
      events.push("prepare");
      assert.equal(input.options?.signAndProcess, false);
      assert.equal(input.options?.noSend, true);
      return {
        signableTransaction: {
          tx: tx.toAtomicBEEF(),
          reference: "cmVmZXJlbmNl",
        },
      };
    },
    async signAction(input: Parameters<WalletInterface["signAction"]>[0]) {
      events.push("sign");
      assert.equal(input.options?.noSend, true);
      await tx.sign();
      return { txid: tx.id("hex"), tx: tx.toAtomicBEEF() };
    },
    async abortAction() {
      events.push("abort");
      return { aborted: true };
    },
  } as unknown as WalletInterface;
  return { tx, wallet, journal, events, args };
}

test('server-declared retained ancestors shorten wallet work while the saved signed proof stays complete', async () => {
  const f = fixture()
  // Synthetic dependency tree beyond the observed depth, never broadcast.
  let parent = f.tx.inputs[0].sourceTransaction!
  for (let i = 0; i < 24; i++) parent = new Transaction(1, [{ sourceTransaction: parent,
    sourceTXID: parent.id('hex'), sourceOutputIndex: 0, unlockingScript: Script.fromHex('00'), sequence: 0xffffffff }],
    [{ satoshis: 5000, lockingScript: parent.outputs[0].lockingScript }])
  f.tx.inputs[0].sourceTransaction = parent
  f.tx.inputs[0].sourceTXID = parent.id('hex')
  const ancestor = parent.id('hex'), retained = parent.toAtomicBEEF()
  f.args.options = { knownTxids: [ancestor] }
  const create = f.wallet.createAction.bind(f.wallet), sign = f.wallet.signAction.bind(f.wallet)
  f.wallet.createAction = async (args, originator) => {
    assert.deepEqual(args.options?.knownTxids, [ancestor])
    const result = await create(args, originator)
    const beef = Beef.fromBinaryStrict(result.signableTransaction!.tx)
    beef.version = BEEF_V2
    beef.makeTxidOnly(ancestor)
    return { ...result, signableTransaction: { ...result.signableTransaction!, tx: beef.toBinaryAtomic(f.tx.id('hex')) } }
  }
  f.wallet.signAction = async (args, originator) => {
    const result = await sign(args, originator)
    const beef = Beef.fromBinaryStrict(result.tx!)
    beef.version = BEEF_V2
    beef.makeTxidOnly(ancestor)
    return { ...result, tx: beef.toBinaryAtomic(f.tx.id('hex')) }
  }
  const result = await preparePayment(f.wallet, f.args, f.journal, undefined, id => id === ancestor ? retained : undefined)
  assert.equal(Transaction.fromAtomicBEEF(result.tx!).getFee(), 1)
  assert.ok(Beef.fromBinaryStrict(result.tx!).txs.length > 24)
  assert.ok(!Beef.fromBinaryStrict(result.tx!).txs.some(tx => tx.isTxidOnly))
  assert.ok(Beef.fromBinaryStrict(result.transportTx).txs.some(tx => tx.isTxidOnly))
  assert.equal(Transaction.fromAtomicBEEF(result.transportTx).id('hex'), result.txid)
  assert.equal(f.journal.get().proof?.transaction, Buffer.from(result.tx!).toString('base64'))
  assert.ok(!f.events.includes('broadcast'))
})

test('unavailable or mismatched retained ancestors never become wallet hints', async () => {
  const f = fixture()
  f.args.options = { knownTxids: ['a'.repeat(64), 'b'.repeat(64)] }
  const create = f.wallet.createAction.bind(f.wallet)
  f.wallet.createAction = async (args, originator) => {
    assert.deepEqual(args.options?.knownTxids, [])
    return create(args, originator)
  }
  await preparePayment(f.wallet, f.args, f.journal, undefined, id => id.startsWith('a') ? f.tx.toAtomicBEEF() : undefined)
  assert.equal(f.journal.get().state, 'signed')
})

test("signed proof is saved before broadcast; recovery only rebroadcasts the same tx", async () => {
  const f = fixture();
  const signed = await preparePayment(f.wallet, f.args, f.journal);
  assert.deepEqual(f.events, [
    "preparing",
    "prepare",
    "prepared",
    "signing",
    "sign",
    "signed",
  ]);
  assert.equal(f.journal.get().txid, signed.txid);
  assert.equal(f.journal.get().feeSats, 1);
  await broadcastPayment(f.wallet, f.journal.get());
  await broadcastPayment(f.wallet, f.journal.get());
  assert.deepEqual(f.events.slice(-2), ["broadcast", "broadcast"]);
  await assert.rejects(
    () => preparePayment(f.wallet, f.args, f.journal),
    /reconcile/,
  );
});

test('broadcast results are matched to the original TXID and retained without creating a replacement', async () => {
  for (const status of ['unproven', 'sending', 'failed', 'unknown', 'missing', 'wrong-txid', 'duplicate', 'throws']) {
    const f = fixture();
    await preparePayment(f.wallet, f.args, f.journal);
    const original = structuredClone(f.journal.get());
    let sends = 0;
    f.wallet.createAction = async input => {
      sends++;
      assert.deepEqual(input.options?.sendWith, [original.txid]);
      assert.equal(input.outputs, undefined);
      if (status === 'throws') throw Object.assign(new Error('processor refused'), {
        sendWithResults: [{ txid: original.txid, status: 'failed' }],
      });
      if (status === 'missing') return {};
      const item = { txid: status === 'wrong-txid' ? 'other' : original.txid!, status: status === 'duplicate' ? 'unproven' : status };
      return { sendWithResults: (status === 'duplicate' ? [item, item] : [item]) as never };
    };
    const call = broadcastPayment(f.wallet, original, undefined, f.journal);
    if (status === 'unproven') await call;
    else await assert.rejects(call, /broadcast status|processor refused/);
    const after = f.journal.get();
    assert.equal(sends, 1);
    assert.equal(after.state, 'signed');
    assert.deepEqual(after.proof, original.proof);
    assert.equal(after.requestId, original.requestId);
    assert.equal(after.txid, original.txid);
    assert.equal(after.broadcast?.status, status === 'throws' ? 'failed' :
      ['unproven', 'sending', 'failed'].includes(status) ? status : 'unknown');
    await assert.rejects(preparePayment(f.wallet, f.args, f.journal), /reconcile/);
  }
});

test('read-only proof inspection identifies original parents and fees and rejects a changed TXID', () => {
  const f = fixture(23);
  const graph = paymentGraph(f.tx, f.tx.id('hex'));
  assert.equal(graph.length, 2);
  assert.equal(graph[0].feeSats, 23);
  assert.equal(graph[0].inputs[0].txid, graph[1].txid);
  assert.equal(graph[0].inputs[0].embedded, true);
  assert.throws(() => paymentGraph(f.tx, '0'.repeat(64)), /TXID mismatch/);
});

test("57-sat fee is aborted before signing or broadcast", async () => {
  const f = fixture(57);
  await assert.rejects(
    () => preparePayment(f.wallet, f.args, f.journal),
    /57 exceeds the 1-sat limit/,
  );
  assert.deepEqual(f.events, [
    "preparing",
    "prepare",
    "prepared",
    "abort",
    "aborted",
  ]);
  assert.equal(f.journal.get().quotedFeeSats, 57);
});

test("explicit one-attempt fee approval permits its maximum but refuses higher or unknown fees", async () => {
  for (const fee of [1, 23]) {
    const f = fixture(fee);
    f.journal.save({ ...f.journal.get(), approvedMaxFeeSats: 23 });
    await preparePayment(f.wallet, f.args, f.journal);
    assert.equal(f.journal.get().state, "signed");
    assert.equal(f.journal.get().feeSats, fee);
    assert.equal(f.events.includes("broadcast"), false);
  }
  const f = fixture(24);
  f.journal.save({ ...f.journal.get(), approvedMaxFeeSats: 23 });
  await assert.rejects(preparePayment(f.wallet, f.args, f.journal), /24 exceeds the 23-sat limit/);
  assert.equal(f.journal.get().state, "aborted");
  assert.equal(f.journal.get().quotedFeeSats, 24);
  assert.equal(f.events.includes("sign"), false);
  assert.equal(f.events.includes("broadcast"), false);
  for (const invalid of [NaN, Infinity, -1, 1.5]) {
    const invalidCase = fixture();
    invalidCase.journal.save({ ...invalidCase.journal.get(), approvedMaxFeeSats: invalid });
    await assert.rejects(preparePayment(invalidCase.wallet, invalidCase.args, invalidCase.journal), /Invalid one-page/);
    assert.equal(invalidCase.events.includes("prepare"), false);
  }
});

test("unknown parent values cannot bypass the fee cap", async () => {
  const f = fixture();
  f.journal.save({ ...f.journal.get(), approvedMaxFeeSats: 23 });
  f.tx.inputs[0].sourceTransaction = undefined;
  f.wallet.createAction = async () => ({
    signableTransaction: {
      tx: f.tx.toAtomicBEEF(true),
      reference: "cmVmZXJlbmNl",
    },
  });
  await assert.rejects(() => preparePayment(f.wallet, f.args, f.journal));
  assert.equal(f.events.includes("sign"), false);
  assert.equal(f.events.includes("broadcast"), false);
  assert.equal(f.journal.get().quotedFeeSats, null);
});

test("delayed signing keeps the attempt durable and does not send until proof is saved", async () => {
  const f = fixture();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const sign = f.wallet.signAction.bind(f.wallet);
  f.wallet.signAction = async (...args) => {
    await gate;
    return sign(...args);
  };
  const pending = preparePayment(f.wallet, f.args, f.journal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.journal.get().state, "signing");
  assert.equal(f.events.includes("broadcast"), false);
  finish();
  await pending;
  assert.equal(f.journal.get().state, "signed");
});

test("lost sign response leaves an unresolved unsent action and forbids fresh creation", async () => {
  const f = fixture();
  f.wallet.signAction = async () => {
    throw new Error("response lost");
  };
  await assert.rejects(
    () => preparePayment(f.wallet, f.args, f.journal),
    /response lost/,
  );
  assert.equal(f.journal.get().state, "signing");
  assert.equal(f.events.includes("broadcast"), false);
  await assert.rejects(
    () => preparePayment(f.wallet, f.args, f.journal),
    /reconcile/,
  );
});

test("storage failure while saving signed proof prevents all broadcasts", async () => {
  const f = fixture();
  const save = f.journal.save;
  f.journal.save = (attempt) => {
    if (attempt.state === "signed") throw new Error("storage full");
    save(attempt);
  };
  await assert.rejects(
    () => preparePayment(f.wallet, f.args, f.journal),
    /storage full/,
  );
  assert.equal(f.events.includes("broadcast"), false);
});

test("changed signed outputs are rejected before broadcasting", async () => {
  const f = fixture();
  const sign = f.wallet.signAction.bind(f.wallet);
  f.wallet.signAction = async (...args) => {
    f.tx.outputs[0].satoshis = 4;
    f.tx.outputs[1].satoshis! += 1;
    return sign(...args);
  };
  await assert.rejects(
    () => preparePayment(f.wallet, f.args, f.journal),
    /differs/,
  );
  assert.equal(f.events.includes("broadcast"), false);
});

test("explicit refusal before action creation is retryable; uncertain transport failures are retained", async () => {
  for (const code of ["ERR_PERMISSION_DENIED", "WERR_INSUFFICIENT_FUNDS", 7]) {
    const f = fixture();
    f.wallet.createAction = async () => {
      throw Object.assign(new Error("Wallet refused"), { code });
    };
    await assert.rejects(
      preparePayment(f.wallet, f.args, f.journal),
      /Wallet refused/,
    );
    assert.equal(f.journal.get().state, "aborted");
    assert.equal(f.journal.get().reference, undefined);
    assert.equal(f.journal.get().txid, undefined);
    assert.equal(f.journal.get().proof, undefined);
    assert.equal(f.events.includes("sign"), false);
  }
  for (const code of [400, "ETIMEDOUT", undefined]) {
    const f = fixture();
    let calls = 0;
    f.wallet.createAction = async () => {
      calls++;
      throw Object.assign(new Error("Connection lost"), { code });
    };
    await assert.rejects(
      preparePayment(f.wallet, f.args, f.journal),
      /Connection lost/,
    );
    assert.equal(f.journal.get().state, "preparing");
    assert.equal(f.journal.get().walletRequestStarted, true);
    await assert.rejects(
      preparePayment(f.wallet, f.args, f.journal),
      /reconcile/,
    );
    assert.equal(calls, 1);
  }
});

test("failed unsigned cancellation retains its reference and cannot create another action", async () => {
  const f = fixture(57);
  f.wallet.abortAction = async () => {
    throw new Error("Wallet closed during cancellation");
  };
  await assert.rejects(
    preparePayment(f.wallet, f.args, f.journal),
    /Wallet closed/,
  );
  assert.equal(f.journal.get().state, "prepared");
  assert.equal(f.journal.get().reference, "cmVmZXJlbmNl");
  await assert.rejects(
    preparePayment(f.wallet, f.args, f.journal),
    /reconcile/,
  );
  assert.equal(f.events.includes("sign"), false);
  assert.equal(f.events.includes("broadcast"), false);
});
