import { vercelConfig } from './deploy/hosting-config.mjs'

// Evaluated by Vercel at build time. This value is a public backend URL,
// never a browser-exposed wallet key or a VITE_* payment endpoint override.
export const config = vercelConfig(process.env)

// The page-36 pilot is complete. Continuous one-page preparation is available
// only after visible user opt-in; every reload/book change/logout stops it.
// This enables the feature, not a payment or another paid test.
config.buildCommand = 'VITE_PAGESTREAM_READ_AHEAD=1 VITE_PAGESTREAM_READ_AHEAD_MODE=continuous ' + config.buildCommand
