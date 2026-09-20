# SWYPR server

Express on `localhost:3001`. No DB — JSON files in `server/data` are loaded at
boot and written back on change. Contract lives in the build brief / ASTRA.md.

## Run

```
pnpm install          # once, from repo root (this repo is pnpm, not npm)
pnpm run server       # or: pnpm run server:dev  (auto-restart on edit)
```

## Reset the demo

Stop the server and delete `server/data/messages.json` — it regenerates from
`seed_messages.json` on next boot. `seed_messages.json` itself is read-only at
runtime, so hand-edits to the seed corpus are safe (content pass, task C1).
If trees were changed during rehearsal, restore `trees.json` too.

## Env (.env at repo root)

`ANTHROPIC_API_KEY` — optional. Without it every draft falls back to the raw
tree text / clarifying question; the demo survives with zero LLM calls.
`MODE=SIMULATE|LIVE`, `VERIFY_TOKEN`, `IG_ACCESS_TOKEN`, `IG_USER_ID`,
`WHITELIST_IGSIDS` (comma-separated, copy from `data/webhook_log.json`),
`IG_GRAPH_VERSION` (exact version from the Meta quickstart — don't guess).
Env is read per request, but restart after edits to be safe.

## ⚠ products.json is a best-effort reconstruction

The case-file PDF wasn't in this repo. Glass Drop / Night Serum / Cloud Cream /
Barrier Cream / Daily Gel match the brief; the other five are invented
placeholders. **Task C2: replace with the case-file table word-for-word.**
Product names feed the keyword matcher, so renames flow through automatically
(known names are mapped in `lib/matching.js` → `PRODUCT_CLUSTER_MAP`).

## Routes (all answer curl)

- `GET  /api/health` → `{ ok, mode }`
- `GET  /api/queue` → `{ messages, stats }` (unanswered first, newest live on top; never calls the LLM)
- `GET  /api/clusters`, `GET /api/trees`, `GET /api/answer-bank`
- `POST /api/trees` (tree without id → creates + re-matches unanswered)
- `PATCH /api/trees/:id` (edits; flipping `autoSend` on sweeps ready drafts out as `auto_sent`)
- `POST /api/messages/:id/skip` | `/draft` (body `{context?}`) | `/send` (body `{text}`)
- `POST /api/simulate-incoming` (body `{presetId?}` — `barrier`, `glassdrop`, `offmap`; no body cycles through them)
- `GET/POST /webhook/instagram` (handshake / receiver — the only route to expose via ngrok)

Sends return the message plus a `delivery` field: `{ via, simulated, fallback?, error? }` —
a failed live send falls back to simulate and flags it there.

## LLM usage

- Drafts: `claude-sonnet-5`, 3s timeout, falls back to raw branch text.
- Classification: `claude-haiku-4-5-20251001` (auto-falls back to
  `claude-haiku-4-5` on 404), live-source messages only, only when keywords miss.
- Boot pre-generates seed drafts into `draft_cache.json` in the background.
