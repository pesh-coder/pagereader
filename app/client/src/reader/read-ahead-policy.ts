export function readAheadPermitted(enabled: boolean, mode: string, target: string,
  identity: string, edition: string, page: number) {
  if (!enabled || !identity || !edition || !Number.isSafeInteger(page) || page < 3) return false
  if (mode === 'continuous') return true
  if (mode !== 'scoped') return false
  return target === `${identity}/${edition}/${page}`
}
