// In-memory store backed by JSON files in /server/data.
// seed_messages.json is the read-only boot corpus; runtime message state
// (statuses, drafts, live DMs) lives in messages.json — delete that file
// to reset the demo to a clean seeded queue.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

const file = (name) => path.join(DATA_DIR, name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
}

export const store = {
  messages: [],
  trees: [],
  products: [],
  draftCache: {},
};

export function load() {
  store.products = readJson("products.json", []);
  store.trees = readJson("trees.json", []);
  store.draftCache = readJson("draft_cache.json", {});
  const runtime = readJson("messages.json", null);
  if (Array.isArray(runtime) && runtime.length > 0) {
    store.messages = runtime;
  } else {
    const seeds = readJson("seed_messages.json", []);
    store.messages = seeds.map((m) => ({ clusterId: null, matchedTreeId: null, draft: null, ...m }));
    persistMessages();
  }
}

export function persistMessages() {
  writeJson("messages.json", store.messages);
}

export function persistTrees() {
  writeJson("trees.json", store.trees);
}

export function persistDraftCache() {
  writeJson("draft_cache.json", store.draftCache);
}

export function appendWebhookLog(entry) {
  const log = readJson("webhook_log.json", []);
  log.push(entry);
  writeJson("webhook_log.json", log);
}

export function getMessage(id) {
  return store.messages.find((m) => m.id === id);
}

export function getTree(id) {
  return id ? store.trees.find((t) => t.id === id) : undefined;
}
