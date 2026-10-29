import http from "node:http";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrivateKey, type WalletInterface } from "@bsv/sdk";
import { SetupClient } from "@bsv/wallet-toolbox-client";
import { createProbe } from "./probe.js";
import { loadEdition, loadCatalogue } from "./content.js";
import { Store } from "./store.js";
import { createLocalWalletManifest } from "./local-wallet-manifest.js";
import { purchaseGate } from "./purchase-gate.js";

if ((process.env.BSV_NETWORK ?? "main") !== "main")
  throw new Error("This spike is mainnet only");
const port = Number(process.env.PORT ?? 3108);
const origin = new URL(process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`);
if (origin.protocol !== "https:" && origin.hostname !== "localhost")
  throw new Error("Use HTTPS outside localhost");
const stateDirectory = resolve(process.env.PAGESTREAM_STATE_DIR ?? "data");
const purchasesPaused = purchaseGate(
  stateDirectory,
  process.env.PAGESTREAM_PURCHASES_ENABLED,
);
if (
  process.env.PAGESTREAM_REQUIRE_EXISTING_STATE === "1" &&
  (!existsSync(join(stateDirectory, "spike.sqlite")) ||
    !existsSync(join(stateDirectory, "PAID_REQUESTS_PAUSED")))
)
  throw new Error(
    "Import the existing paused database snapshot before starting this deployment; refusing a new empty ledger",
  );
await mkdir(stateDirectory, { recursive: true });
let wallet: WalletInterface | undefined;
let serverIdentity: string | undefined;
if (process.env.SERVER_PRIVATE_KEY) {
  // Official SDK parsing and wallet setup; no custom key derivation or signing.
  const rootKey = PrivateKey.fromString(process.env.SERVER_PRIVATE_KEY);
  wallet = await SetupClient.createWalletClientNoEnv({
    chain: "main",
    rootKeyHex: rootKey.toHex(),
    storageUrl:
      process.env.WALLET_STORAGE_URL ?? "https://storage.babbage.systems",
  });
  serverIdentity = (await wallet.getPublicKey({ identityKey: true })).publicKey;
}
const store = new Store(join(stateDirectory, "spike.sqlite"));
const research =
  process.env.NODE_ENV !== "production" &&
  process.env.PAGESTREAM_RESEARCH === "1";
const app = createProbe({
  store,
  edition: loadEdition(),
  catalogue: loadCatalogue(),
  wallet,
  serverIdentity,
  stateDirectory,
  purchasesPaused,
  research,
  manifestEnabled: process.env.SPIKE_MANIFEST !== "0",
});
const server = http.createServer({ maxHeaderSize: 1024 * 1024 }, app);
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Throwaway mainnet spike at ${origin.origin}; payment wallet ${wallet ? "ready" : "not configured"}`,
  ),
);
// Explicit development opt-in; localhost wallet authority can discard ports
// before fetching /manifest.json. Never alter/revoke/grant wallet permissions.
const localManifestServer =
  process.argv.includes("--local-wallet-manifest") && port !== 80
    ? http.createServer(createLocalWalletManifest(serverIdentity, port))
    : undefined;
localManifestServer?.on("error", () =>
  console.warn(
    "Local wallet manifest on port 80 unavailable; native grouped-permission discovery remains unverified.",
  ),
);
localManifestServer?.listen(80, "127.0.0.1", () =>
  console.log(
    "Public wallet manifest at http://localhost/manifest.json; reader remains on its existing port.",
  ),
);
const stop = () => {
  localManifestServer?.close();
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
