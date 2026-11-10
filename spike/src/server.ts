import http from "node:http";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Beef, PrivateKey, type WalletInterface } from "@bsv/sdk";
import { Services, SetupClient } from "@bsv/wallet-toolbox-client";
import type { Broadcast } from "./channel-service.js";
import { createProbe } from "./probe.js";
import { loadEdition, loadCatalogue } from "./content.js";
import { Store } from "./store.js";
import { createLocalWalletManifest } from "./local-wallet-manifest.js";
import { purchaseGate } from "./purchase-gate.js";
import { instrumentReceiver, inspectReceiver } from "./receiver-profile.js";

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
let receiverDiagnostics: ((tx: number[]) => Promise<unknown>) | undefined;
if (process.env.SERVER_PRIVATE_KEY) {
  // Official SDK parsing and wallet setup; no custom key derivation or signing.
  const rootKey = PrivateKey.fromString(process.env.SERVER_PRIVATE_KEY);
  const receiver = await SetupClient.createWalletClientNoEnv({
    chain: "main",
    rootKeyHex: rootKey.toHex(),
    storageUrl:
      process.env.WALLET_STORAGE_URL ?? "https://storage.babbage.systems",
  });
  instrumentReceiver(receiver);
  receiverDiagnostics = tx => inspectReceiver(receiver, tx);
  wallet = receiver;
  serverIdentity = (await wallet.getPublicKey({ identityKey: true })).publicKey;
}
const store = new Store(join(stateDirectory, "spike.sqlite"));
// Reading sessions stay off unless explicitly enabled for listed identities
// ("all" opens them to every wallet). Funding and zero-payment settlements are
// broadcast through the official wallet services; paid settlements are
// received (and broadcast) by the receiving wallet itself.
const channelIdentities = (process.env.PAGESTREAM_CHANNEL_IDENTITIES ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
let services: Services | undefined;
const broadcast: Broadcast = async (atomicBeef, txid) => {
  services ??= new Services("main");
  const results = await services.postBeef(Beef.fromBinary(atomicBeef), [txid]);
  if (!results.some((result) => result.txidResults.some((r) =>
    r.txid === txid && r.status === "success" && !r.doubleSpend)))
    throw new Error("Transaction was not accepted for broadcast");
};
const channels = wallet && process.env.PAGESTREAM_CHANNELS_ENABLED === "1"
  ? { broadcast, enabled: (identity: string) =>
      channelIdentities.includes("all") || channelIdentities.includes(identity),
      maxCapacity: Number(process.env.PAGESTREAM_CHANNEL_MAX_SATS) || undefined }
  : undefined;
const research =
  process.env.NODE_ENV !== "production" &&
  process.env.PAGESTREAM_RESEARCH === "1";
const app = createProbe({
  store,
  edition: loadEdition(),
  catalogue: loadCatalogue(),
  wallet,
  serverIdentity,
  receiverDiagnostics,
  stateDirectory,
  purchasesPaused,
  research,
  knownAncestorsEnabled: identity => process.env.PAGESTREAM_KNOWN_ANCESTORS_ENABLED !== '0' &&
    !(process.env.PAGESTREAM_KNOWN_ANCESTORS_DISABLED_IDENTITIES ?? '').split(',').map(s => s.trim()).includes(identity),
  manifestEnabled: process.env.SPIKE_MANIFEST !== "0",
  channels,
});
const sweep = channels
  ? setInterval(() => void app.locals.channels.settleIdle().catch(() => {}), 60_000)
  : undefined;
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
  clearInterval(sweep);
  localManifestServer?.close();
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
