# app — agent guide

Scaffolded by `create-bsv-app` (layout: **monorepo**, network: **main**). BSV capabilities live under `src/bsv`. Re-run `npx create-bsv-app` inside this folder to add more capabilities.

## Install dependencies

### client/

Dependencies are already in `package.json` — just install:

```
cd client && npm i
```

Included:
  @bsv/auth@^0.1.0
  @bsv/sdk@^2.1.0
  @bsv/wallet-relay@^0.2.0
  react@>=18
  react-router-dom@^7.0.0

### server/

Dependencies are already in `package.json` — just install:

```
cd server && npm i
```

Included:
  @bsv/auth@^0.1.0
  @bsv/sdk@^2.1.0
  @bsv/wallet-relay@^0.2.0
  qrcode@^1.5.0
  ws@^8.0.0

## Wiring

Base files (`main.tsx`, `App.tsx`, `server`) were wired automatically.

## wallet-connect (base)

Connect any BRC-100 wallet — desktop (`@bsv/sdk` `WalletClient('auto')`) or mobile/relay (`@bsv/wallet-relay`) — use it app-wide, and sign/verify the `@bsv/auth` proofs that `wallet-login` and `signed-requests` build on.

### How it works
- Connecting is a small state machine: it tries the desktop/extension wallet first; if none is found it opens a modal to pair a mobile wallet over a relay (QR) or install a desktop one. The connected wallet lives in React context, reachable anywhere via `useWallet()`.
- The **mobile/relay path needs a server**: the base server entry runs `new WalletRelayService({ app, server, wallet: serverWallet, origin })` from `@bsv/wallet-relay`, which registers `GET /api/session` (+ `/:id`, `POST /api/request/:id`) and a `/ws` WebSocket upgrade on the raw HTTP server. The client (`useWalletRelayClient`, pointed at `API_BASE_URL`) creates a session, shows its QR, and pairs over `/ws`. Frontend-only projects (no server) get desktop connect only.
- The proof primitive (`auth.ts`) uses the wallet to sign a message bound to `{ counterparty, action, body? }` and verifies it server-side (BRC-103). That's identity (and request auth) without passwords or shared secrets.
- The server publishes its own identity key at `GET /api/identity`; `getServerIdentity()` accepts that key under the configured API origin's HTTPS/local-development authority. This is convenient endpoint trust, not an independent identity proof. Pin the expected key through the login/signed-request hooks when continuity must survive DNS, certificate, proxy, or deployment changes.
- Every generated API call uses `apiClient.ts`: safe fixed-origin paths, no redirects or credentials, a 10-second whole-response deadline, 1 MiB request/response ceilings, validated unencoded lengths, and strict UTF-8 JSON. Production requires an explicit HTTPS `VITE_API_URL`.

### How it's used
- `auth.ts` (shared) — `createAuthProof(wallet, { counterparty, action, body? })` and `verifyAuthProof(serverWallet, proof, { action, body? }, consumeNonce)`.
- `config.ts` (client) — `API_BASE_URL` (from `VITE_API_URL`, default `http://localhost:3000`); the server base every fetch helper targets.
- `apiClient.ts` (client) — the shared bounded, redirect-free client used by generated identity, login, and signed-request calls.
- `serverIdentity.ts` (client) — `getServerIdentity()` fetches + caches the server's identity key from `GET /api/identity`.
- `walletAcquisition.ts` (client) — `connectDesktopWallet()`.
- `WalletConnectionContext.tsx` / `WalletContext.tsx` / `WalletProviders.tsx` (client) — relay session + wallet state; consume via `useWallet()`.
- `ConnectWallet.tsx` (client) — the connect button + desktop-fail modal.
- New projects (glue on): `src/main.tsx` wraps `<App/>` in `<WalletProviders>`, and a generated `Home.tsx` hub links to each installed capability's page once a wallet connects. With `--no-glue` / add mode: wrap your root in `<WalletProviders>` and build your own home.

### Future integrations
- Persist the connection across reloads (re-probe the desktop wallet / restore the relay session on load).
- Reuse the proof primitive for any action beyond login — bind a proof to any `{ action, body }` (that's exactly what `signed-requests` does).
- Layer identity certificates (BRC-52/103) on top of the raw identity key when you need verified attributes, not just a public key.
