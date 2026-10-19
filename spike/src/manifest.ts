import { config } from './config.js'
export function manifest(identityKey: string) {
  return {
    name: 'Pagestream tier-1 spike', short_name: 'Pagestream', start_url: '/', display: 'standalone',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    metanet: { schemaVersion: 1, groupPermissions: {
      description: config.provisional.permissionCopy,
      spendingAuthorization: { amount: config.provisional.walletLimitSats, description: config.provisional.permissionCopy },
      protocolPermissions: [
        { protocolID: [2, 'auth message signature'], counterparty: identityKey, description: 'Authenticate reading and bookmark requests to Pagestream' },
        { protocolID: [2, 'server hmac'], counterparty: 'self', description: 'Create authentication and payment nonces' },
        { protocolID: [2, '3241645161d8'], counterparty: identityKey, description: 'Derive BRC-29 page payment outputs' },
      ],
    } },
  }
}
