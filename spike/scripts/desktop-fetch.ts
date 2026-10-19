import http from 'node:http'
import { config } from '../src/config.js'

// SDK-supplied fetch adapter for operator scripts. Node's default fetch can
// time out on headers while Desktop is still waiting for human approval.
// No retry: a lost wallet response must never create a replacement action.
export function desktopFetch(timeoutMs: number = config.provisional.nativeApprovalTimeoutMs): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Desktop transport is restricted to local HTTP')
    if (init?.body != null && typeof init.body !== 'string') throw new Error('Desktop transport expects SDK JSON text')
    return new Promise<Response>((resolve, reject) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries())
      const request = http.request(url, { method: init?.method ?? 'GET', headers, signal: init?.signal ?? undefined }, response => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > config.provisional.nativeResponseLimitBytes) { request.destroy(new Error('Desktop response exceeds the permitted size')); return }
          chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('aborted', () => reject(new Error('Desktop response was interrupted; reconcile before retrying')))
        response.on('end', () => {
          const resultHeaders = new Headers()
          for (const [name, value] of Object.entries(response.headers)) if (value != null) {
            for (const item of Array.isArray(value) ? value : [value]) resultHeaders.append(name, item)
          }
          resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 500, headers: resultHeaders }))
        })
      })
      const deadline = setTimeout(() => request.destroy(new Error('Desktop approval deadline exceeded; do not authorize the stale request or retry payment')), timeoutMs)
      request.on('close', () => clearTimeout(deadline))
      request.on('error', reject)
      request.end(init?.body ?? undefined)
    })
  }
}
