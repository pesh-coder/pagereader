import { PrivateKey, ProtoWallet, P2PKH, Script, Transaction, SatoshisPerKilobyte, type WalletInterface } from '@bsv/sdk'
import { WalletPermissionsManager, type GroupedPermissionRequest } from '@bsv/wallet-toolbox-client'
import { config } from '../src/config.js'
import { manifest } from '../src/manifest.js'

// Build the displayed permission shape with official wallet/PushDrop crypto and
// throw before the synthetic wallet can fund, sign or broadcast any action.
export async function modelPermissionCost(Manager = WalletPermissionsManager) {
  const synthetic = new ProtoWallet(PrivateKey.fromRandom())
  const server = new ProtoWallet(PrivateKey.fromRandom())
  const declaration = manifest((await server.getPublicKey({ identityKey: true })).publicKey).metanet.groupPermissions
  // The native screenshots show these two protocols; auth-message signing was
  // not offered in this observed group. Do not invent another saved grant.
  declaration.protocolPermissions = declaration.protocolPermissions.filter(p => p.protocolID[1] !== 'auth message signature')
  let captured: Parameters<WalletInterface['createAction']>[0] | undefined
  let interceptedActions = 0
  const stop = new Error('CAPTURE_ONLY_NO_WALLET_ACTION')
  const underlying = new Proxy(synthetic, { get(target, property) {
    if (property === 'listOutputs') return async () => ({ outputs: [], totalOutputs: 0 })
    if (property === 'listActions') return async () => ({ actions: [], totalActions: 0 })
    if (property === 'createAction') return async (args: Parameters<WalletInterface['createAction']>[0]) => { captured = args; interceptedActions++; throw stop }
    if (['signAction', 'internalizeAction', 'abortAction', 'waitForAuthentication'].includes(String(property))) return async () => { throw new Error('Unexpected synthetic wallet action') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as unknown as WalletInterface
  const manager = new Manager(underlying, 'synthetic-admin.example', { seekGroupedPermission: true, seekSpendingPermissions: true })
  const originalFetch = globalThis.fetch
  const manifestRequests: string[] = []
  globalThis.fetch = async input => {
    manifestRequests.push(String(input))
    return new Response(JSON.stringify({ metanet: { groupPermissions: declaration } }), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    manager.bindCallback('onGroupedPermissionRequested', async (request: GroupedPermissionRequest) => {
      await manager.grantGroupedPermission({ requestID: request.requestID, granted: request.permissions })
    })
    try { await manager.waitForAuthentication({}, 'localhost:3108') }
    catch (error) { if (error !== stop) throw error }
  } finally { globalThis.fetch = originalFetch }
  if (!captured?.outputs?.length || interceptedActions !== 1) throw new Error('Expected one intercepted batched permission action')
  const outputs = captured.outputs
  const tokenSats = outputs.reduce((sum, output) => sum + output.satoshis, 0)
  const changeScript = new P2PKH().lock(PrivateKey.fromRandom().toAddress())
  const scenarios = []
  for (const scenario of config.provisional.permissionModelScenarios) {
    // Conventional maximum-length P2PKH inputs; dummy bytes, never signatures.
    const tx = new Transaction(1, Array.from({ length: scenario.inputs }, (_, i) => ({ sourceTXID: '00'.repeat(32), sourceOutputIndex: i, sequence: 4294967295, unlockingScript: Script.fromBinary(Array(108).fill(0)) })), [
      ...outputs.map(output => ({ satoshis: output.satoshis, lockingScript: Script.fromHex(output.lockingScript) })),
      ...Array.from({ length: scenario.changeOutputs }, () => ({ satoshis: 1, lockingScript: changeScript })),
    ])
    const modeledFeeSats = await new SatoshisPerKilobyte(config.provisional.permissionModelFeeRateSatsPerKb).computeFee(tx)
    scenarios.push({ ...scenario, modeledBytes: tx.toBinary().length, modeledFeeSats, modeledTokenAndFeeSats: tokenSats + modeledFeeSats })
  }
  return {
    mode: 'OFFLINE_SYNTHETIC_NOT_A_NATIVE_QUOTE',
    allowanceSats: config.provisional.walletLimitSats,
    outputCount: outputs.length, tokenSats,
    outputs: outputs.map((output, index) => ({ permission: index === 0 ? 'monthly spending allowance' : String(declaration.protocolPermissions[index - 1].protocolID[1]), basket: output.basket, satoshis: output.satoshis, scriptBytes: output.lockingScript.length / 2 })),
    modeledFeeRateSatsPerKb: config.provisional.permissionModelFeeRateSatsPerKb,
    scenarios, manifestRequests, interceptedActions,
    nativeWalletCalls: 0, fundedActions: 0, signedActions: 0, broadcasts: 0,
    limitation: 'Actual native input/change selection, fees, renewals and token persistence can differ. This is neither a quote nor an enforceable grant-cost cap. The page-fee cap does not apply.',
  }
}
