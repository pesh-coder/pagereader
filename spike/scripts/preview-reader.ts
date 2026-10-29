import http from "node:http";
import { createProbe } from "../src/probe.js";
import { Store } from "../src/store.js";
import { loadCatalogue, loadEdition } from "../src/content.js";

// UI-only preview: in-memory app state, no .env and no receiving wallet setup.
// This cannot receive or broadcast a payment and never opens the real ledger.
const store = new Store(":memory:");
const app = createProbe({
  store,
  edition: loadEdition(),
  catalogue: loadCatalogue(),
  research: false,
  purchasesPaused: () => true,
});
const server = http.createServer(app);
server.listen(3112, "127.0.0.1", () =>
  console.log("Wallet-free reader preview: http://localhost:3112/reader/"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
