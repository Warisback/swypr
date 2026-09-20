// Instagram send (LIVE mode) + the shared delivery pipeline.
// LIVE only ever fires for whitelisted IGSIDs; everything else simulates.
// A failed live send falls back to simulate and flags it so the UI can show
// a quiet "simulated" tag.
import { getTree, persistMessages, persistTrees } from "./store.js";

export function mode() {
  return (process.env.MODE || "SIMULATE").toUpperCase() === "LIVE" ? "LIVE" : "SIMULATE";
}

export function whitelist() {
  return (process.env.WHITELIST_IGSIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isWhitelisted(igsid) {
  return whitelist().includes(String(igsid));
}

export async function sendInstagramDM(igsid, text) {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) return { sent: false, error: "IG_ACCESS_TOKEN missing" };
  // Version must come from the quickstart in the Meta app dashboard —
  // set IG_GRAPH_VERSION in .env; the default is only a placeholder.
  const version = process.env.IG_GRAPH_VERSION || "v23.0";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://graph.instagram.com/${version}/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { id: String(igsid) }, message: { text } }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `IG ${res.status}: ${body.slice(0, 300)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: String(err?.message || err) };
  }
}

/**
 * Send (or simulate) a reply, update message status + tree usedCount, persist.
 * Returns a delivery descriptor: { via: "instagram"|"simulated", simulated,
 * fallback?, error? }.
 */
export async function deliverReply(message, text, { auto = false } = {}) {
  let delivery;
  if (mode() === "LIVE" && message.source === "live" && isWhitelisted(message.sender?.id)) {
    const r = await sendInstagramDM(message.sender.id, text);
    delivery = r.sent
      ? { via: "instagram", simulated: false }
      : { via: "simulated", simulated: true, fallback: true, error: r.error };
  } else {
    delivery = { via: "simulated", simulated: true };
  }
  message.status = auto ? "auto_sent" : "answered";
  message.reply = { text, sentAt: new Date().toISOString(), via: delivery.via, auto };
  const tree = getTree(message.matchedTreeId);
  if (tree) {
    tree.usedCount = (tree.usedCount || 0) + 1;
    persistTrees();
  }
  persistMessages();
  return delivery;
}
