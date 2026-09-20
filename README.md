# Swypr

A mobile-first creator inbox in React 18, Vite, Tailwind and Framer Motion. Includes a custom SVG identity, swipe queue, contextual answer editor, answer builder, Answer Bank and installable web app metadata.

## Run

```sh
pnpm install
pnpm dev
```

`pnpm build` creates `dist`. `pnpm preview` serves that production build.

## Backend connection

The frontend defaults to an in-memory demo loaded from `public/mock/seed.json`. Demo changes reset on reload. Copy `.env.example` to `.env.local`, set `VITE_USE_MOCK=false`, and restart Vite to use the backend. The local `/api` proxy targets `http://localhost:3001`; set `VITE_API_BASE` for a different backend origin. Cross-origin backends must allow the frontend origin through CORS. Production API values are build-time Vite variables. The hosted preview is mock mode and does not send real Instagram messages.

Every request goes through `src/api.js`. Routes and message/tree/stat field names match the supplied contract. Draft responses accept the direct draft object, `{ draft }`, or `{ message: { draft } }`. Mutation responses may be empty; the UI refreshes authoritative state after saving. Live queue polling runs every two seconds and does not overwrite an open reply.

The contract does not provide monthly cluster counts, per-tree asked counts, or today's auto-handled total. Queue/bank frequency is therefore explicitly labelled as the count in the returned inbox; today's count is derived from returned `auto_sent` messages. If the live queue excludes completed messages, the backend must supply those records or agree a contract extension for a complete daily total. Monthly coverage and hours come directly from API Stats. `builtFrom.length` is the number of supplied source replies.

After `POST /api/trees`, the backend must re-match relevant messages on the next `GET /api/queue`; no undocumented message-association fields are sent. Timeouts on send trigger reconciliation and preserve the edited draft. The contract has no idempotency or delivery-receipt fields, so a network-ambiguous send asks the creator to check before retrying.

## Demo

- Swipe left or press × to skip. Swipe right, tap a card, or use “make it yours” to answer.
- Dry/oily context chips demonstrate the saved branches; sending a clarifying question uses the normal send endpoint.
- `L`: simulate an incoming message. `G`: move Glass Drop to the top. `?`: shortcuts. `Esc`: return to inbox. Shortcuts ignore text fields.
- The fixture includes 20 DMs, 6 saved answers, 3 unanswered themes, and all required scenarios.

## Design

Colours, type and radii are CSS variables at the top of `src/styles.css`. Brand assets are `public/swypr-logo.svg` and `public/swypr-icon.svg`; PNG app icons are provided at 192px and 512px. The mock palette, typography and layout can be adjusted without changing the data layer.
