// Read-only operator diagnostic. The configured key signs authentication only.
import { AuthFetch, PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'

const origin = new URL(process.argv[2] ?? 'https://pagestream-production.up.railway.app')
const txid = process.argv[3]
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
  throw new Error('Plain HTTPS server origin required')
if (!/^[a-f0-9]{64}$/.test(txid ?? '')) throw new Error('Existing accepted payment TXID required')
if (!process.env.SERVER_PRIVATE_KEY) throw new Error('Existing receiver configuration required')
const raw = new ProtoWallet(PrivateKey.fromString(process.env.SERVER_PRIVATE_KEY))
let paymentCalls = 0
const wallet = new Proxy(raw, { get(target, property) {
  if (['createAction', 'signAction', 'internalizeAction', 'abortAction'].includes(String(property)))
    return async () => { paymentCalls++; throw new Error('Payment operation forbidden') }
  const value = Reflect.get(target, property)
  return typeof value === 'function' ? value.bind(target) : value
} }) as unknown as WalletInterface
const transport: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.origin !== origin.origin || ![ '/.well-known/auth', `/api/receiver-latency/${txid}` ].includes(url.pathname))
    throw new Error('Unexpected diagnostic URL')
  if (url.pathname !== '/.well-known/auth' && (init?.method ?? 'GET') !== 'GET') throw new Error('Read-only diagnostic required')
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) })
}
const auth = new AuthFetch(wallet, undefined, undefined, origin.host, undefined, transport)
const response = await auth.fetch(new URL(`/api/receiver-latency/${txid}`, origin).href, { paymentRetryAttempts: 1 })
if (!response.ok) throw new Error(`Diagnostic HTTP ${response.status}`)
console.log(JSON.stringify({ at: new Date().toISOString(), origin: origin.origin, ...(await response.json()), paymentCalls }, null, 2))
