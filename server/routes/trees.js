// Answer trees: list, create (re-runs matching over unanswered messages),
// patch (edits + the autoSend toggle, which sweeps ready drafts out the door).
import { Router } from "express";
import { store, getTree, persistTrees, persistMessages } from "../lib/store.js";
import { rematchUnanswered } from "../lib/matching.js";
import { setImmediateDrafts, prewarmDrafts } from "../lib/drafts.js";
import { deliverReply } from "../lib/instagram.js";

const router = Router();

const STOPWORDS = new Set(["the", "a", "an", "i", "do", "is", "it", "if", "my", "me", "u", "you", "what", "with", "for", "to", "of", "and", "or"]);

function makeTreeId(question) {
  const words = String(question)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .slice(0, 2);
  let base = `tree_${words.join("_") || "answer"}`;
  let id = base;
  let n = 2;
  while (getTree(id)) id = `${base}_${n++}`;
  return id;
}

function validateTreeBody(body) {
  if (!body || typeof body.question !== "string" || !body.question.trim()) {
    return "question is required";
  }
  if (body.branches && (!Array.isArray(body.branches) || body.branches.length > 2)) {
    return "branches must be an array of at most 2";
  }
  return null;
}

// After any tree change: relink clusters → trees, refresh drafts instantly
// (no LLM), then upgrade voices in the background.
async function refreshMatching() {
  rematchUnanswered();
  await setImmediateDrafts();
  prewarmDrafts().catch(() => {});
}

// AutoSend sweep: everything unanswered on this tree with a complete draft
// (not a clarifying question) goes out as auto_sent.
async function sweepAutoSend(tree) {
  const pending = store.messages.filter(
    (m) => m.status === "unanswered" && m.matchedTreeId === tree.id && m.draft && !m.draft.needsContext,
  );
  for (const m of pending) {
    await deliverReply(m, m.draft.text, { auto: true });
  }
  return pending.length;
}

router.get("/api/trees", (req, res) => {
  res.json({ trees: store.trees });
});

router.post("/api/trees", async (req, res) => {
  const err = validateTreeBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const tree = {
    id: makeTreeId(b.question),
    question: b.question.trim(),
    contextQuestion: b.contextQuestion ?? null,
    branches: b.branches ?? [],
    flatAnswer: b.flatAnswer ?? null,
    autoSend: Boolean(b.autoSend),
    usedCount: Number.isFinite(b.usedCount) ? b.usedCount : 0,
    builtFrom: Array.isArray(b.builtFrom) ? b.builtFrom : [],
    createdAt: new Date().toISOString(),
  };
  store.trees.push(tree);
  persistTrees();
  await refreshMatching();
  if (tree.autoSend) await sweepAutoSend(tree);
  res.json(tree);
});

router.delete("/api/trees/:id", async (req, res) => {
  const tree = getTree(req.params.id);
  if (!tree) return res.status(404).json({ error: "tree not found" });
  store.trees = store.trees.filter((t) => t.id !== tree.id);
  persistTrees();
  await refreshMatching(); // messages that pointed here go back to unmatched
  res.json({ ok: true });
});

router.patch("/api/trees/:id", async (req, res) => {
  const tree = getTree(req.params.id);
  if (!tree) return res.status(404).json({ error: "tree not found" });
  const b = req.body || {};
  if (b.branches && (!Array.isArray(b.branches) || b.branches.length > 2)) {
    return res.status(400).json({ error: "branches must be an array of at most 2" });
  }

  const contentKeys = ["question", "contextQuestion", "branches", "flatAnswer", "builtFrom"];
  let contentChanged = false;
  for (const key of contentKeys) {
    if (key in b) {
      tree[key] = b[key];
      contentChanged = true;
    }
  }
  const autoSendTurnedOn = "autoSend" in b && Boolean(b.autoSend) && !tree.autoSend;
  if ("autoSend" in b) tree.autoSend = Boolean(b.autoSend);
  persistTrees();

  if (contentChanged) {
    // answers changed → drafts built from them are stale
    for (const m of store.messages) {
      if (m.status === "unanswered" && m.matchedTreeId === tree.id) delete store.draftCache[m.id];
    }
    await refreshMatching();
  }
  if (autoSendTurnedOn) await sweepAutoSend(tree);
  persistMessages();
  res.json(tree);
});

export default router;
