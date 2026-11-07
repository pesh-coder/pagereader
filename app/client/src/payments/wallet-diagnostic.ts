export interface WalletDiagnostic {
  kind: 'proof-depth-limit'
  limit: number
}

// Persist only a recognized public error shape, never arbitrary wallet messages
// (which can contain transaction bytes, URLs, arguments or other private data).
export function walletDiagnostic(error: unknown): WalletDiagnostic | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as { code?: unknown; message?: unknown }
  if (value.code !== 'WERR_INVALID_OPERATION' || typeof value.message !== 'string') return undefined
  const match = /^Maximum BEEF depth exceeded\. Limit is ([1-9]\d{0,3})\.?$/.exec(value.message)
  return match ? { kind: 'proof-depth-limit', limit: Number(match[1]) } : undefined
}
