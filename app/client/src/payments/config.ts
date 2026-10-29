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
  segmenterVersion: 'paragraphs-1800-v1',
  targetCharacters: 1800,
  timingSampleCount: 20,
  targetP95Ms: 500,
} as const
