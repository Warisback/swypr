// Meta webhook. GET = verification handshake. POST = receiver:
// log the raw payload first (trust the log over assumptions), ack 200
// immediately, then process: whitelist filter, drop echoes/read receipts/
// anything without message.text, match + draft, push to queue as source "live".
import { Router } from "express";
import { store, persistMessages, appendWebhookLog } from "../lib/store.js";
import { matchMessage, classifyWithLLM, treeForCluster } from "../lib/matching.js";
import { draftFor } from "../lib/drafts.js";
import { deliverReply, isWhitelisted } from "../lib/instagram.js";

const router = Router();

router.get("/webhook/instagram", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

const seenMids = new Set();
let liveCounter = 0;

async function processEvent(ev) {
  const senderId = ev?.sender?.id;
  const msg = ev?.message;
  // Read receipts, reactions, postbacks arrive without message.text;
  // stickers and gifs never produce text; echoes are our own sends.
  if (!senderId || !msg || msg.is_echo || typeof msg.text !== "string" || !msg.text.trim()) return;
  if (!isWhitelisted(senderId)) return; // silent drop — nothing off-whitelist ever renders
  if (msg.mid) {
    if (seenMids.has(msg.mid) || store.messages.some((m) => m.mid === msg.mid)) return;
    seenMids.add(msg.mid);
  }

  const message = {
    id: `msg_live_${Date.now()}_${liveCounter++}`,
    mid: msg.mid || null,
    source: "live",
    sender: { id: String(senderId), handle: `@tester_${String(senderId).slice(-4)}` },
    text: msg.text,
    receivedAt: new Date(ev.timestamp || Date.now()).toISOString(),
    status: "unanswered",
    clusterId: null,
    matchedTreeId: null,
    draft: null,
  };

  message.clusterId = matchMessage(message.text);
  if (!message.clusterId) {
    // live source + keyword miss is the one place the classifier runs
    message.clusterId = await classifyWithLLM(message.text).catch(() => null);
  }
  const tree = treeForCluster(message.clusterId);
  message.matchedTreeId = tree ? tree.id : null;
  if (tree) message.draft = await draftFor(message, tree, { allowLLM: true });

  store.messages.push(message);
  persistMessages();

  if (tree?.autoSend && message.draft && !message.draft.needsContext) {
    await deliverReply(message, message.draft.text, { auto: true });
  }
}

router.post("/webhook/instagram", (req, res) => {
  const payload = req.body;
  appendWebhookLog({ receivedAt: new Date().toISOString(), payload });
  res.sendStatus(200); // ack fast — Meta retries slow endpoints

  (async () => {
    for (const entry of payload?.entry || []) {
      for (const ev of entry?.messaging || []) {
        await processEvent(ev);
      }
    }
  })().catch((err) => console.error("[webhook] processing error:", err));
});

export default router;
