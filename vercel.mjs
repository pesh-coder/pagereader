import { vercelConfig } from './deploy/hosting-config.mjs'

// Evaluated by Vercel at build time. This value is a public backend URL,
// never a browser-exposed wallet key or a VITE_* payment endpoint override.
export const config = vercelConfig(process.env)

// Reading sessions are the reader's payment flow. The backend decides which
// wallets may open one (PAGESTREAM_CHANNELS_ENABLED / PAGESTREAM_CHANNEL_IDENTITIES).
