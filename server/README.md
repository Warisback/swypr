# Swypr server

Express on `localhost:3001`. No database — the JSON files in `server/data` are
loaded into memory at boot and written back on change. The built frontend in
`dist/` is served from the same port.

## Run

```sh
pnpm install          # once, from the repo root (pnpm workspace)
pnpm run server       # or: pnpm run server:dev  (auto-restart on edit)
```

## Data files

- `seed_messages.json` — the inbox corpus, read-only at runtime
- `products.json` — the product catalogue the matcher and voice rules draw from
- `trees.json` — saved answers
- `messages.json`, `draft_cache.json`, `webhook_log.json` — runtime state,
  regenerated as needed and untracked. Delete `messages.json` and restart for
  a fresh queue.

## Environment (.env at repo root)

`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` — optional. Without a key every draft
falls back to the saved answer text; the app works with zero LLM calls.
`MODE=SIMULATE|LIVE`, `VERIFY_TOKEN`, `IG_ACCESS_TOKEN`, `IG_USER_ID`,
`WHITELIST_IGSIDS` (comma-separated tester ids, visible in
`data/webhook_log.json` once DMs arrive), `IG_GRAPH_VERSION`.

## Routes

- `GET  /api/health` → `{ ok, mode }`
- `GET  /api/queue` → `{ messages, stats }` (unanswered first, newest live on top; never calls the LLM)
- `GET  /api/clusters` · `GET /api/trees` · `GET /api/answer-bank`
- `POST /api/trees` (create + re-match unanswered) · `PATCH /api/trees/:id` (edits; enabling `autoSend` sweeps ready drafts) · `DELETE /api/trees/:id`
- `POST /api/messages/:id/skip` | `/draft` (body `{context?}`) | `/send` (body `{text}`)
- `POST /api/simulate-incoming` (scripted demo sequence; body `{presetId?}` or `{reset: true}`)
- `GET/POST /webhook/instagram` (Meta handshake / DM receiver — the only route that needs public exposure)

Sends return the message plus a `delivery` field (`{ via, simulated, fallback?, error? }`);
a failed live send falls back to simulate and flags it there.

## LLM usage

Drafts are rewritten into the creator's register with a 3-second timeout and a
raw-text fallback; classification runs only for live-source messages when the
keyword matcher misses. Seed drafts are pre-generated into `draft_cache.json`
in the background at boot.
