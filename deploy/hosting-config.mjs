export function httpsOrigin(value, name) {
  let url
  try { url = new URL(value) } catch { throw new Error(`${name} must be a public HTTPS origin`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      /^(localhost|127\..*|\[::1\])$/.test(url.hostname) || url.hostname.endsWith('.localhost')) {
    throw new Error(`${name} must be a public HTTPS origin without credentials, path, query or fragment`)
  }
  return url.origin
}

export function publicOrigin(env) {
  // The frontend hostname is authoritative when Vercel fronts the backend.
  // A provider-assigned backend URL is sufficient for first-host maintenance.
  if (!env.PUBLIC_ORIGIN && env.PAGESTREAM_MAINTENANCE !== '1') throw new Error('PUBLIC_ORIGIN must name the reader HTTPS origin before activation')
  const backendOrigin = env.RENDER_EXTERNAL_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined)
  return httpsOrigin(env.PUBLIC_ORIGIN || backendOrigin, 'PUBLIC_ORIGIN')
}

export function vercelConfig(env) {
  const backend = httpsOrigin(env.PAGESTREAM_BACKEND_ORIGIN, 'PAGESTREAM_BACKEND_ORIGIN')
  for (const host of [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && new URL(`https://${host}`).origin === backend) throw new Error('PAGESTREAM_BACKEND_ORIGIN must point to the backend, not this Vercel frontend')
  }
  const forwarded = ['/api/:path*', '/.well-known/auth', '/manifest.json', '/icon.svg', '/health']
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: null,
    installCommand: 'npm --prefix app/client ci --include=dev && npm --prefix spike ci --include=dev',
    buildCommand: 'npm --prefix app/client run build && node deploy/stage-frontend.mjs',
    outputDirectory: 'dist/vercel',
    redirects: [{ source: '/', destination: '/reader/', permanent: false }],
    rewrites: [
      ...forwarded.map(source => ({ source, destination: `${backend}${source}` })),
      { source: '/reader', destination: '/reader/index.html' },
      { source: '/reader/', destination: '/reader/index.html' },
    ],
    headers: forwarded.map(source => ({ source, headers: [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'CDN-Cache-Control', value: 'no-store' },
      { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
    ] })),
  }
}
