// Single source for all provisional spike values and copy, shared by both bundles.
export const config = {
  priceSats: 5,
  freePages: 2,
  // Two disjoint 20-purchase cohorts on one identity: 3–22 and 23–42.
  maxProbePage: 43,
  provisional: {
    walletLimitSats: 5000,
    feeEstimateSats: null as number | null,
    maxPageFeeSats: 1,
    // Reader-only ceiling after explicit consent for the current open reader.
    // Historical operator scripts and unapproved calls retain the 1-sat default.
    readerMaxPageFeeSats: 23,
    // Offline permission-cost illustrations, never a native grant quote/cap.
    permissionModelFeeRateSatsPerKb: 1,
    permissionModelScenarios: [
      { label: 'One input and one change output', inputs: 1, changeOutputs: 1 },
      {
        label: 'One input and eight change outputs (historical grant shape)',
        inputs: 1,
        changeOutputs: 8,
      },
    ],
    liveTestPermitMs: 300000,
    nativeApprovalTimeoutMs: 900000,
    nativeResponseLimitBytes: 16777216,
    permissionCopy:
      'PROVISIONAL: your wallet may offer a monthly app allowance, including fees. Record the actual prompts and grant; one prompt is not yet proven.',
    readerPermissionCopy:
      'Your wallet may request a separate saved permission. Review any additional cost before approving.',
    unknownFeeCopy: 'fees not yet measured',
  },
  // Unidirectional payment channel ("reading session"): one funding approval,
  // then one wallet signature per page and one settlement when reading stops.
  channel: {
    // Half the 5,000-sat monthly wallet allowance: the wallet counts every balance
    // opened in a month and never subtracts returned sats, so a balance equal to
    // the allowance leaves no room for a second one without an on-chain renewal.
    capacitySats: 2500,
    minCapacitySats: 60,
    // Reader-funded fee carried by the single settlement (≈265 bytes at 100 sat/kB).
    settlementFeeSats: 30,
    // A reading balance lasts months: the reader's refund unlocks after 60 days
    // and each top-up starts a new balance with a new refund.
    refundDelaySeconds: 60 * 24 * 60 * 60,
    // Leaving keeps the balance. After 30 days without reading, the server
    // returns what is left to the reader's wallet.
    idleSettleMs: 30 * 24 * 60 * 60 * 1000,
    // Without a top-up, settle well before the reader's refund unlocks.
    maxSessionMs: 55 * 24 * 60 * 60 * 1000,
    // Pages delivered ahead of payment that were never paid for, per session.
    maxForfeitedCredits: 2,
  },
  segmenterVersion: 'paragraphs-1800-v1',
  targetCharacters: 1800,
  timingSampleCount: 20,
  targetP95Ms: 500,
} as const
