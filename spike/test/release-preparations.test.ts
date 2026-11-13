import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releaseUnsentPreparations } from '../../app/client/src/payments/release-preparations.js'

function storage(entries: Record<string, unknown>) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]))
  return { values, get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test('only unsent preparations this app recorded are released; signed, sent or other identities are untouched', async () => {
  const me = '03' + 'a'.repeat(64), other = '03' + 'b'.repeat(64)
  const base = { identityKey: me, edition: 'e', requestId: 'r' }
  const store = storage({
    [`pagestream-payment-v2:${me}:e:23`]: { ...base, page: 23, state: 'signing', reference: 'ref-23' },     // rejected mid-way
    [`pagestream-payment-v2:${me}:e:24`]: { ...base, page: 24, state: 'prepared', reference: 'ref-24' },
    [`pagestream-payment-v2:${me}:e:25`]: { ...base, page: 25, state: 'signed', reference: 'ref-25', txid: 'f'.repeat(64),
      proof: { derivationPrefix: 'p', derivationSuffix: 's', transaction: 'AA==' } },                        // signed proof: keep
    [`pagestream-payment-v2:${me}:e:26`]: { ...base, page: 26, state: 'signing', reference: 'ref-26', broadcast: { status: 'unknown', checkedAt: 'x' } },
    [`pagestream-payment-v2:${me}:e:27`]: { ...base, page: 27, state: 'confirmed', reference: 'ref-27' },
    [`pagestream-payment-v2:${other}:e:23`]: { ...base, identityKey: other, page: 23, state: 'prepared', reference: 'ref-other' },
    'pagestream-session-v2:x': { unrelated: true },
  })
  const aborted: string[] = []
  const wallet = { abortAction: async ({ reference }: { reference: string }) => {
    aborted.push(reference)
    if (reference === 'ref-24') throw new Error('unknown to wallet')
    return { aborted: true as const }
  } }
  assert.equal(await releaseUnsentPreparations({ identityKey: me, wallet: wallet as never, storage: store }), 1)
  assert.deepEqual(aborted.sort(), ['ref-23', 'ref-24'])
  assert.equal(JSON.parse(store.values.get(`pagestream-payment-v2:${me}:e:23`)!).state, 'aborted')
  assert.equal(JSON.parse(store.values.get(`pagestream-payment-v2:${me}:e:24`)!).state, 'prepared', 'a refused abort leaves the record')
  assert.equal(JSON.parse(store.values.get(`pagestream-payment-v2:${me}:e:25`)!).state, 'signed')
  assert.equal(JSON.parse(store.values.get(`pagestream-payment-v2:${other}:e:23`)!).state, 'prepared')
  // Running again retries only the one the wallet refused; released ones are not touched again.
  assert.equal(await releaseUnsentPreparations({ identityKey: me, wallet: { abortAction: async () => ({ aborted: true as const }) } as never, storage: store }), 1)
})
