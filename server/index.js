// SWYPR backend — Express on localhost:3001. JSON files in /server/data are
// the whole database. Only /webhook/instagram is meant to be exposed (ngrok).
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import { load, store } from "./lib/store.js";
import { rematchUnanswered } from "./lib/matching.js";
import { setImmediateDrafts, prewarmDrafts, llmAvailable } from "./lib/drafts.js";
import { mode, whitelist } from "./lib/instagram.js";
import queueRoutes from "./routes/queue.js";
import treeRoutes from "./routes/trees.js";
import sendRoutes from "./routes/send.js";
import webhookRoutes from "./routes/webhook.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const app = express();
app.use(cors()); // open — localhost frontend + ngrok host
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mode: mode() });
});

app.use(queueRoutes);
app.use(treeRoutes);
app.use(sendRoutes);
app.use(webhookRoutes);

// Serve the built frontend so the whole app runs from this one port
// (run `pnpm run build` after frontend changes).
app.use(express.static(path.join(ROOT, "dist")));

app.use((req, res) => {
  res.status(404).json({ error: `no such route: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "internal error" });
});

const PORT = 3001;

async function boot() {
  load();
  rematchUnanswered();
  await setImmediateDrafts(); // queue is fully servable before we listen, zero LLM calls

  app.listen(PORT, () => {
    const stats = {
      messages: store.messages.length,
      trees: store.trees.length,
      products: store.products.length,
      mode: mode(),
      llm: process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : process.env.OPENAI_API_KEY
          ? "openai"
          : "NONE (drafts fall back to raw tree text)",
      whitelistedIgsids: whitelist().length,
    };
    console.log(`[swypr] server on http://localhost:${PORT}`);
    console.log(`[swypr] boot:`, stats);
    prewarmDrafts()
      .then(() => console.log("[swypr] draft prewarm done"))
      .catch((err) => console.error("[swypr] draft prewarm failed:", err));
  });
}

boot().catch((err) => {
  console.error("[swypr] boot failed:", err);
  process.exit(1);
});
