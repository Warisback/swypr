// Queue, clusters, answer bank, skip, per-message drafting, simulate-incoming.
// GET /api/queue never calls the LLM — drafts are prebaked or raw branch text.
import { Router } from "express";
import { store, getMessage, getTree, persistMessages } from "../lib/store.js";
import { getClusters, unansweredThemes, matchInbound } from "../lib/matching.js";
import { draftFor } from "../lib/drafts.js";
import { deliverReply } from "../lib/instagram.js";

const router = Router();

// One tap on a repeat instead of typing the answer out.
const MANUAL_SECONDS_PER_DM = 105; // ~1m45s to read + type a reply by hand
const TAP_SECONDS_PER_DM = 12; // read + approve a prepared draft

export function computeStats() {
  const total = store.messages.length;
  const clustered = store.messages.filter((m) => m.clusterId).length;
  return {
    totalMessages: total,
    clustered,
    coveragePct: total ? Math.round((clustered / total) * 100) : 0,
    savedAnswers: store.trees.length,
    hoursBefore: Math.round((total * MANUAL_SECONDS_PER_DM) / 3600),
    hoursAfter: Math.round((total * TAP_SECONDS_PER_DM) / 3600),
  };
}

function sortedMessages() {
  return [...store.messages].sort((a, b) => {
    const rank = (m) => (m.status === "unanswered" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const src = (m) => (m.source === "live" ? 0 : 1);
    if (src(a) !== src(b)) return src(a) - src(b);
    return new Date(b.receivedAt) - new Date(a.receivedAt);
  });
}

router.get("/api/queue", (req, res) => {
  res.json({ messages: sortedMessages(), stats: computeStats() });
});

router.get("/api/clusters", (req, res) => {
  res.json({ clusters: getClusters() });
});

router.get("/api/answer-bank", (req, res) => {
  res.json({ trees: store.trees, stats: computeStats(), unansweredThemes: unansweredThemes(3) });
});

router.post("/api/messages/:id/skip", (req, res) => {
  const m = getMessage(req.params.id);
  if (!m) return res.status(404).json({ error: "message not found" });
  m.status = "skipped";
  persistMessages();
  res.json({ ok: true });
});

router.post("/api/messages/:id/draft", async (req, res) => {
  const m = getMessage(req.params.id);
  if (!m) return res.status(404).json({ error: "message not found" });
  const tree = getTree(m.matchedTreeId);
  if (!tree) return res.status(400).json({ error: "message has no matched tree" });
  const context = req.body?.context ?? null;
  m.draft = await draftFor(m, tree, { context, allowLLM: true });
  persistMessages();
  res.json(m);
});

// Canned live-looking messages for the demo. "offmap" must land unmatched.
const PRESETS = {
  barrier: {
    sender: { id: "sim_nia", handle: "@nia.tries" },
    text: "wait so do i still need the barrier cream if im using the night serum every nite??",
  },
  glassdrop: {
    sender: { id: "sim_dara", handle: "@daradoesglow" },
    text: "is the glass drop serum actually worth it or is it hype 😭",
  },
  offmap: {
    sender: { id: "sim_orla", handle: "@orla.overseas" },
    text: "do u ship to ireland?",
  },
  // the second turn of the barrier conversation — same sender answers the clarifier
  reply: {
    sender: { id: "sim_nia", handle: "@nia.tries" },
    text: "dry!! like actually flaky rn",
  },
};
// Recorded-demo script (2026-09-20): each default press of L steps through this
// sequence in order — barrier question, the same sender's "dry" reply, a glass
// drop ask, then the honest off-map miss. R sends { reset: true } for retakes.
const SCRIPT = ["barrier", "reply", "glassdrop", "offmap"];
let scriptCursor = 0;
let simCounter = 0;

router.post("/api/simulate-incoming", async (req, res) => {
  if (req.body?.reset) {
    // clean the stage for a retake: drop every injected message, rewind the script
    store.messages = store.messages.filter((m) => !String(m.sender?.id || "").startsWith("sim_"));
    scriptCursor = 0;
    persistMessages();
    return res.json({ ok: true, reset: true });
  }
  const presetId = req.body?.presetId && PRESETS[req.body.presetId] ? req.body.presetId : null;
  const key = presetId || SCRIPT[scriptCursor++ % SCRIPT.length];
  const preset = PRESETS[key];

  const message = {
    id: `msg_sim_${Date.now()}_${simCounter++}`,
    source: "live",
    sender: preset.sender,
    text: preset.text,
    receivedAt: new Date().toISOString(),
    status: "unanswered",
    clusterId: null,
    matchedTreeId: null,
    draft: null,
  };

  // Canned presets are keyword-deterministic on purpose — no LLM classify.
  // Thread context first: a reply to an open clarifying question gets the branch draft.
  const { tree, context } = matchInbound(message);
  if (tree) message.draft = await draftFor(message, tree, { context, allowLLM: true });

  store.messages.push(message);
  persistMessages();

  if (tree?.autoSend && message.draft && !message.draft.needsContext) {
    await deliverReply(message, message.draft.text, { auto: true });
  }

  res.json(message);
});

export default router;
