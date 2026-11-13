// Wallet acquisition via @bsv/sdk WalletClient.
import { WalletClient, type WalletInterface } from '@bsv/sdk'

// BSV Browser exposes its wallet through a React Native bridge. The SDK's
// 'auto' discovery gives every substrate only 1 s to answer, which a wallet
// that is still waking up or loading can miss. Inside BSV Browser, talk to the
// bridge directly and wait longer; elsewhere, retry discovery a few times.
const BRIDGE_WAIT_MS = 20_000
const DISCOVERY_ATTEMPTS = 3

const inBsvBrowser = () => typeof window !== 'undefined' &&
  typeof (window as { ReactNativeWebView?: { postMessage?: unknown } }).ReactNativeWebView?.postMessage === 'function'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function within<T>(pending: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })])
  } finally { clearTimeout(timer) }
}

async function discover(): Promise<WalletClient> {
  if (inBsvBrowser()) {
    const wallet = new WalletClient('react-native')
    await within(wallet.getVersion({}), BRIDGE_WAIT_MS,
      'BSV Browser’s wallet did not respond. Open the wallet in BSV Browser (unlock it if asked), then try again.')
    return wallet
  }
  let failure: unknown
  for (let attempt = 1; attempt <= DISCOVERY_ATTEMPTS; attempt++) {
    const wallet = new WalletClient('auto')
    try {
      await wallet.getVersion({})
      return wallet
    } catch (error) {
      failure = error
      if (attempt < DISCOVERY_ATTEMPTS) await sleep(1000)
    }
  }
  throw failure
}

// Name the step and the wallet's error code, so a refusal can be diagnosed
// from the reader's message (the SDK hides unrecognised wallet errors).
async function step<T>(name: string, pending: () => Promise<T>): Promise<T> {
  try { return await pending() } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? ` code ${String((error as { code: unknown }).code)}` : ''
    const message = error instanceof Error ? error.message : 'Wallet operation failed'
    throw new Error(`${name} failed${code}: ${message}`.slice(0, 200), { cause: error })
  }
}

export async function connectDesktopWallet (): Promise<{ wallet: WalletInterface, identityKey: string }> {
  const wallet = await step('Finding the wallet', discover)
  const { authenticated } = await step('Checking sign-in', () => wallet.isAuthenticated())
  if (!authenticated) throw new Error('Checking sign-in failed: the wallet reports you are not signed in')
  const { publicKey } = await step('Reading your identity key', () => wallet.getPublicKey({ identityKey: true }))
  return { wallet, identityKey: publicKey }
}
