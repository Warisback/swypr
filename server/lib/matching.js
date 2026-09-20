// Keyword-first cluster matching. Order matters: first cluster whose keyword
// group fully matches wins, so product-specific clusters sit above generic stems.
// A keyword group is AND (every term must hit); groups within a cluster are OR.
// The LLM (haiku) is only consulted for live-source messages when keywords miss.
import { store, getTree } from "./store.js";
import { llmText, detectContext } from "./drafts.js";

const CLUSTER_DEFS = [
  {
    id: "cluster_glassdrop",
    label: "is glass drop worth £62?",
    groups: [["glass drop"], ["glassdrop"]],
  },
  {
    id: "cluster_barrier",
    label: "do i need barrier cream with the night serum?",
    groups: [["barrier"], ["night serum"], ["daily gel"]],
  },
  {
    id: "cluster_cloud",
    label: "is cloud cream worth £38?",
    groups: [["cloud"]],
  },
  {
    id: "cluster_shade",
    label: "what shade / foundation does maya wear?",
    groups: [["shade"], ["foundation"], ["skin tint"], ["second skin"]],
  },
  {
    id: "cluster_skin_type",
    label: "i don't know my skin type",
    groups: [["skin type"], ["what type of skin"], ["sensitive"]],
  },
  {
    id: "cluster_keep_one",
    label: "if you could only keep one product",
    groups: [["only keep"], ["keep one"], ["only one"], ["one product"], ["had to pick"], ["pick one"]],
  },
  {
    id: "cluster_first_date",
    label: "first date friday — face plan",
    groups: [["first date"], ["date friday"], ["date on friday"], ["date this friday"]],
  },
  {
    id: "cluster_budget_dry",
    label: "dry skin recs under £60",
    groups: [["dry", "60"], ["dry", "budget"], ["dry", "afford"]],
  },
  {
    id: "cluster_payday",
    label: "payday — what should i get?",
    groups: [["payday"], ["pay day"], ["paid friday"]],
  },
  {
    id: "cluster_wwyb",
    label: "what would you buy if you were me?",
    groups: [["if you were me"], ["if u were me"], ["what would you buy"], ["what would u buy"], ["what should i buy"]],
  },
  {
    id: "cluster_routine",
    label: "simplest 2-product routine",
    groups: [["routine"]],
  },
];

// Product names from products.json feed the keyword map (build step 2 of the
// brief). Each known product routes to the cluster its questions belong to.
const PRODUCT_CLUSTER_MAP = {
  "glass drop": "cluster_glassdrop",
  "night serum": "cluster_barrier",
  "cloud cream": "cluster_cloud",
  "barrier cream": "cluster_barrier",
  "daily gel": "cluster_barrier",
  "second skin tint": "cluster_shade",
};

let productKeywordsApplied = false;
function applyProductKeywords() {
  if (productKeywordsApplied) return;
  for (const p of store.products) {
    const name = String(p.name || "").toLowerCase();
    const clusterId = PRODUCT_CLUSTER_MAP[name];
    if (!clusterId) continue;
    const def = CLUSTER_DEFS.find((d) => d.id === clusterId);
    if (def && !def.groups.some((g) => g.length === 1 && g[0] === name)) {
      def.groups.push([name]);
    }
  }
  productKeywordsApplied = true;
}

export function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchKeyword(normalizedText, keyword) {
  if (keyword.includes(" ")) return normalizedText.includes(keyword);
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`).test(normalizedText);
}

export function matchMessage(text) {
  applyProductKeywords();
  const t = normalize(text);
  for (const def of CLUSTER_DEFS) {
    if (def.groups.some((group) => group.every((kw) => matchKeyword(t, kw)))) {
      return def.id;
    }
  }
  return null;
}

export function clusterForTree(tree) {
  return matchMessage(tree?.question || "");
}

// Latest tree matching a cluster wins.
export function treeForCluster(clusterId) {
  if (!clusterId) return undefined;
  for (let i = store.trees.length - 1; i >= 0; i--) {
    if (clusterForTree(store.trees[i]) === clusterId) return store.trees[i];
  }
  return undefined;
}

// Re-run keyword matching + tree linkage over unanswered messages.
// Never downgrades a cluster the LLM assigned (keyword miss keeps existing id).
export function rematchUnanswered() {
  for (const m of store.messages) {
    if (m.status !== "unanswered") continue;
    const kw = matchMessage(m.text);
    m.clusterId = kw || m.clusterId || null;
    const tree = treeForCluster(m.clusterId);
    m.matchedTreeId = tree ? tree.id : null;
    if (!m.matchedTreeId) m.draft = null;
  }
}

export function getClusters() {
  applyProductKeywords();
  return CLUSTER_DEFS.map((def) => {
    const matched = store.messages.filter((m) => m.clusterId === def.id);
    const tree = treeForCluster(def.id);
    return {
      id: def.id,
      label: def.label,
      count: matched.length,
      treeId: tree ? tree.id : null,
      exampleMessageIds: matched.slice(0, 2).map((m) => m.id),
    };
  });
}

export function unansweredThemes(limit = 3) {
  return getClusters()
    .filter((c) => !c.treeId)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => ({
      label: c.label,
      count: c.count,
      // verbatim message texts from the corpus, never paraphrases
      examples: store.messages
        .filter((m) => m.clusterId === c.id)
        .slice(0, 2)
        .map((m) => m.text),
    }));
}

// Conversations: if our last reply to this sender was a tree's clarifying
// question, their next inbound message is read as the answer to it. Returns
// the open tree, or null when the thread isn't waiting on context.
export function openContextThread(senderId) {
  for (let i = store.messages.length - 1; i >= 0; i--) {
    const m = store.messages[i];
    if (m.sender?.id !== senderId || !["answered", "auto_sent"].includes(m.status)) continue;
    const tree = getTree(m.matchedTreeId);
    if (!tree?.contextQuestion) return null;
    const wasClarifier =
      (m.reply?.text || "").trim() === tree.contextQuestion.trim() || m.draft?.needsContext === true;
    return wasClarifier ? tree : null;
  }
  return null;
}

// Shared inbound pipeline for webhook + simulate: thread context first,
// then keywords; sets clusterId/matchedTreeId and returns the matched tree.
export function matchInbound(message) {
  const openTree = openContextThread(message.sender?.id);
  if (openTree) {
    const ctx = detectContext(message, openTree);
    if (ctx) {
      message.clusterId = clusterForTree(openTree);
      message.matchedTreeId = openTree.id;
      return { tree: openTree, context: ctx };
    }
  }
  message.clusterId = matchMessage(message.text);
  const tree = treeForCluster(message.clusterId);
  message.matchedTreeId = tree ? tree.id : null;
  return { tree: tree || null, context: null };
}

// Haiku classification — live-source messages only, when keywords miss.
export async function classifyWithLLM(text) {
  applyProductKeywords();
  const list = CLUSTER_DEFS.map((d) => `${d.id} — ${d.label}`).join("\n");
  const out = await llmText({
    kind: "classify",
    system:
      "you sort instagram DMs sent to a beauty creator into known question clusters. reply with exactly one cluster id from the list, or NONE if none fit. no other words.",
    user: `clusters:\n${list}\n\ndm: "${text}"`,
    maxTokens: 20,
  });
  if (!out) return null;
  const hit = out.match(/cluster_[a-z_]+/);
  if (hit && CLUSTER_DEFS.some((d) => d.id === hit[0])) return hit[0];
  return null;
}
