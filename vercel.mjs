import { vercelConfig } from './deploy/hosting-config.mjs'

// Evaluated by Vercel at build time. This value is a public backend URL,
// never a browser-exposed wallet key or a VITE_* payment endpoint override.
export const config = vercelConfig(process.env)

// Temporary, owner-approved native pilot. Public identity/edition/page only;
// every other purchase retains serial delivery. Remove this prefix after the
// single-page test; no Vercel account-wide environment change is needed.
const pilotTarget = '030ddc151d6a23c8cb56bebdc53cbfbdd849d3e8f5fe5d08e73dab79e77b1c7f57/1661-922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0-paragraphs-1800-v1/35'
config.buildCommand = `VITE_PAGESTREAM_PAYMENT_OVERLAP_TARGET=${pilotTarget} ${config.buildCommand}`
