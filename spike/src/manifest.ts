import { config } from './config.js'
export function manifest(identityKey: string, options: { channels?: boolean } = {}) {
  return {
    name: 'Pagereader', short_name: 'Pagereader', start_url: '/', display: 'standalone',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    metanet: { schemaVersion: 1, groupPermissions: {
      description: config.provisional.permissionCopy,
      spendingAuthorization: { amount: config.provisional.walletLimitSats, description: config.provisional.permissionCopy },
      protocolPermissions: [
        { protocolID: [2, 'auth message signature'], counterparty: identityKey, description: 'Authenticate reading and bookmark requests to Pagereader' },
        { protocolID: [2, 'server hmac'], counterparty: 'self', description: 'Create authentication and payment nonces' },
        { protocolID: [2, '3241645161d8'], counterparty: identityKey, description: 'Derive BRC-29 page payment outputs' },
        // Listed only where reading sessions are enabled: each grouped grant adds a token output.
        ...(options.channels ? [{ protocolID: [2, 'pagestream channel'], counterparty: identityKey, description: 'Sign each page of an approved reading session' }] : []),
      ],
    } },
  }
}
