import { vercelConfig } from './deploy/hosting-config.mjs'

// Evaluated by Vercel at build time. This value is a public backend URL,
// never a browser-exposed wallet key or a VITE_* payment endpoint override.
export const config = vercelConfig(process.env)

// Owner-approved single-page Browser pilot. This public target cannot prepare
// any other identity, edition or page. Remove both flags after the pilot.
config.buildCommand = 'VITE_PAGESTREAM_READ_AHEAD=1 VITE_PAGESTREAM_READ_AHEAD_TARGET=030ddc151d6a23c8cb56bebdc53cbfbdd849d3e8f5fe5d08e73dab79e77b1c7f57/1661-922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0-paragraphs-1800-v1/36 ' + config.buildCommand
