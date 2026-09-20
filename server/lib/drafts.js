// Draft generation. The rule that keeps the demo alive: every draft has a
// non-LLM base (branch answer, flat answer, or the clarifying question
// verbatim), the LLM only rewrites for voice, every call has a 3s timeout,
// and any failure falls back to the base text unmodified.
import Anthropic from "@anthropic-ai/sdk";
import { store, getTree, persistMessages, persistDraftCache } from "./store.js";

const DEFAULT_DRAFT_MODEL = "claude-sonnet-5";
const DEFAULT_CLASSIFY_MODEL = "claude-haiku-4-5-20251001";
// If a dated model string 404s, retry once with the undated alias.
const MODEL_FALLBACKS = { "claude-haiku-4-5-20251001": "claude-haiku-4-5" };
const modelAlias = {};

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ maxRetries: 0 });
  return client;
}

export function llmAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Generic short-text completion with hard timeout. Returns null on any failure.
export async function llmText({ kind = "draft", system, user, maxTokens = 200, timeoutMs = 3000 }) {
  const c = getClient();
  if (!c) return null;
  const requested =
    kind === "classify"
      ? process.env.CLASSIFY_MODEL || DEFAULT_CLASSIFY_MODEL
      : process.env.DRAFT_MODEL || DEFAULT_DRAFT_MODEL;
  const model = modelAlias[requested] || requested;
  try {
    const req = { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
    // keep draft rewrites snappy inside the 3s budget; haiku classify needs nothing
    if (kind === "draft" && !llmText._noThinkingParam) req.thinking = { type: "disabled" };
    const res = await c.messages.create(req, { timeout: timeoutMs });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    // haiku 4.5 predates the disabled-thinking param on some snapshots and the
    // dated id may 404 — degrade gracefully, one retry per failure class.
    if (err?.status === 404 && MODEL_FALLBACKS[requested] && modelAlias[requested] !== MODEL_FALLBACKS[requested]) {
      modelAlias[requested] = MODEL_FALLBACKS[requested];
      return llmText({ kind, system, user, maxTokens, timeoutMs });
    }
    if (err?.status === 400 && kind === "draft" && !llmText._noThinkingParam) {
      llmText._noThinkingParam = true; // model rejected the thinking param — drop it from now on
      return llmText({ kind, system, user, maxTokens, timeoutMs });
    }
    return null;
  }
}

function normalizeLocal(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function wordHit(normalizedText, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(normalizedText);
}

// If the DM itself reveals the branch condition ("im oily", "skin so dry"),
// skip the clarifying question and answer directly. Ambiguous → ask.
export function detectContext(message, tree) {
  if (!tree?.branches?.length) return null;
  const t = normalizeLocal(message.text);
  const hits = tree.branches.filter((b) => wordHit(t, normalizeLocal(b.condition)));
  return hits.length === 1 ? hits[0].condition : null;
}

// The deterministic draft: what we send if the LLM never answers.
export function baseAnswerFor(tree, context) {
  if (!tree) return null;
  if (tree.contextQuestion) {
    if (context) {
      const ctx = normalizeLocal(String(context));
      const branch = (tree.branches || []).find(
        (b) => normalizeLocal(b.condition) === ctx || wordHit(ctx, normalizeLocal(b.condition)),
      );
      if (branch) return { text: branch.answer, needsContext: false };
      if (tree.flatAnswer) return { text: tree.flatAnswer, needsContext: false };
    }
    return { text: tree.contextQuestion, needsContext: true };
  }
  if (tree.flatAnswer) return { text: tree.flatAnswer, needsContext: false };
  return null;
}

function hashOf(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

const MAYA_SYSTEM = [
  "you are maya, a beauty creator replying to a DM. rewrite the saved reply you are given so it reads like a fresh DM from you, with EXACTLY the same meaning, facts, prices and product names.",
  "voice: lowercase-leaning, dry, warm but decisive, short (1-2 sentences), zero corporate tone. no hashtags, no emojis unless the original had one, no sign-offs.",
  "never add a product, price, opinion or claim that is not in the saved reply. output only the rewritten reply text, nothing else.",
].join(" ");

async function polish(baseText, dmText) {
  const out = await llmText({
    kind: "draft",
    system: MAYA_SYSTEM,
    user: `their dm: "${dmText}"\nyour saved reply: "${baseText}"\n\nrewrite your saved reply as your response to this dm.`,
    maxTokens: 200,
  });
  if (!out) return null;
  const cleaned = out.replace(/^["']|["']$/g, "").trim();
  if (!cleaned || cleaned.length > 350) return null; // suspicious output → fall back
  return cleaned;
}

/**
 * Build the draft for a message matched to a tree.
 * - clarifying question → tree.contextQuestion verbatim, needsContext true, no LLM
 * - branch/flat answer  → cached rewrite, else LLM rewrite (3s), else raw text
 */
export async function draftFor(message, tree, { context = null, allowLLM = false } = {}) {
  if (!tree) return null;
  const ctx = context ?? detectContext(message, tree);
  const base = baseAnswerFor(tree, ctx);
  if (!base) return null;
  if (base.needsContext) return { text: base.text, needsContext: true };

  const hash = hashOf(`${tree.id}||${base.text}||${message.text}`);
  const cached = store.draftCache[message.id];
  if (cached && cached.hash === hash) return { text: cached.text, needsContext: false };

  if (allowLLM) {
    const polished = await polish(base.text, message.text);
    if (polished) {
      store.draftCache[message.id] = { hash, text: polished };
      persistDraftCache();
      return { text: polished, needsContext: false };
    }
  }
  return { text: base.text, needsContext: false };
}

// Instant pass: give every matched unanswered message a servable draft with
// zero LLM calls (cache hits still apply). Runs at boot and after tree changes.
export async function setImmediateDrafts() {
  for (const m of store.messages) {
    if (m.status !== "unanswered") continue;
    const tree = getTree(m.matchedTreeId);
    m.draft = tree ? await draftFor(m, tree, { allowLLM: false }) : null;
  }
  persistMessages();
}

// Background pass: upgrade raw branch text to Maya-voice rewrites and bake
// them into draft_cache.json. Stops probing after repeated failures so a bad
// key doesn't burn 3s per message.
export async function prewarmDrafts() {
  if (!llmAvailable()) return;
  let consecutiveFailures = 0;
  for (const m of [...store.messages]) {
    if (m.status !== "unanswered" || !m.matchedTreeId) continue;
    const tree = getTree(m.matchedTreeId);
    if (!tree) continue;
    const hadCache = Boolean(store.draftCache[m.id]);
    const d = await draftFor(m, tree, { allowLLM: consecutiveFailures < 3 });
    m.draft = d;
    if (d && !d.needsContext && !hadCache) {
      consecutiveFailures = store.draftCache[m.id] ? 0 : consecutiveFailures + 1;
    }
  }
  persistMessages();
}
