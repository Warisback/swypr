// POST /api/messages/:id/send — LIVE mode sends via Instagram for whitelisted
// IGSIDs, simulates for everyone else. delivery.simulated / delivery.fallback
// let the UI show a quiet "simulated" tag when a live send fell back.
import { Router } from "express";
import { getMessage } from "../lib/store.js";
import { deliverReply } from "../lib/instagram.js";

const router = Router();

router.post("/api/messages/:id/send", async (req, res) => {
  const m = getMessage(req.params.id);
  if (!m) return res.status(404).json({ error: "message not found" });
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "text is required" });
  const delivery = await deliverReply(m, text, { auto: false });
  res.json({ ...m, delivery });
});

export default router;
