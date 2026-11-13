import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PrivateKey } from '@bsv/sdk'
import { connectDesktopWallet } from '../../app/client/src/bsv/walletAcquisition.js'

// A BSV Browser-style bridge: requests go out through ReactNativeWebView.postMessage
// and answers come back as window message events, here after `delayMs`.
function fakeBsvBrowser(t: import('node:test').TestContext, delayMs: number) {
  const identityKey = PrivateKey.fromRandom().toPublicKey().toString()
  const target = new EventTarget()
  const calls: string[] = []
  const win = Object.assign(target, {
    location: { origin: 'https://pagereader.vercel.app' },
    ReactNativeWebView: {
      postMessage(raw: string) {
        const request = JSON.parse(raw)
        calls.push(request.call)
        const result = request.call === 'getVersion' ? { version: 'bsv-browser-fixture' }
          : request.call === 'isAuthenticated' ? { authenticated: true }
            : request.call === 'getPublicKey' ? { publicKey: identityKey } : {}
        setTimeout(() => target.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ type: 'CWI', id: request.id, isInvocation: false, status: 'success', result }),
        })), request.call === 'getVersion' ? delayMs : 5)
      },
    },
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window') })
  return { identityKey, calls }
}

test('inside BSV Browser a wallet that answers slower than the SDK 1-second probe still connects', async t => {
  const bridge = fakeBsvBrowser(t, 2500)
  const started = performance.now()
  const { identityKey } = await connectDesktopWallet()
  assert.equal(identityKey, bridge.identityKey)
  assert.ok(performance.now() - started >= 2400, 'it waited for the slow wallet instead of giving up after 1 s')
  assert.deepEqual(bridge.calls, ['getVersion', 'isAuthenticated', 'getPublicKey'])
})
