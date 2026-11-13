// Free network check for the timings panel: compares the round trip to the
// server through the reader's own address (Vercel forwards /health to the
// backend) with a direct request to the backend. No wallet, payment or data.
export interface ConnectionCheck {
  checkedAt: string
  rounds: number
  viaReaderMs: { p50: number; p95: number }
  directMs: { p50: number; p95: number }
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)])
}

export async function checkConnection(directOrigin: string, rounds = 15,
  fetcher: typeof fetch = (...args) => fetch(...args), clock = () => performance.now()): Promise<ConnectionCheck> {
  const via = () => fetcher('/health', { cache: 'no-store' })
  // The backend sends no cross-site headers; an opaque response still times the round trip.
  const direct = () => fetcher(`${directOrigin}/health`, { cache: 'no-store', mode: 'no-cors' })
  const time = async (request: () => Promise<unknown>) => { const start = clock(); await request(); return clock() - start }
  // Warm both connections first so TLS setup is not counted.
  await time(via); await time(direct)
  const viaTimes: number[] = [], directTimes: number[] = []
  for (let round = 0; round < rounds; round++) {
    // Alternate the order so neither path always goes first.
    if (round % 2) { directTimes.push(await time(direct)); viaTimes.push(await time(via)) }
    else { viaTimes.push(await time(via)); directTimes.push(await time(direct)) }
  }
  return {
    checkedAt: new Date().toISOString(), rounds,
    viaReaderMs: { p50: percentile(viaTimes, 0.5), p95: percentile(viaTimes, 0.95) },
    directMs: { p50: percentile(directTimes, 0.5), p95: percentile(directTimes, 0.95) },
  }
}
