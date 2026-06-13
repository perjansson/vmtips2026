# CLAUDE.md

Notes for Claude Code working in this repo. Complements `README.md` (user-facing) with the non-obvious context and house rules. Note: `README.md` is in English, but the running UI is in Swedish.

## What this is

Live standings page for a Swedish FIFA World Cup 2026 betting pool. Express + vanilla JS, no build step. Page at `/`, JSON at `/api/standings`. Reads a public Google Sheet via gviz CSV, scores it server-side, serves a shared cached payload. See `README.md` for scoring rules and deploy.

## Run, test, deploy

- `npm install && SHEET_ID=<id> npm start` — `SHEET_ID` is required. Defaults in `.env.example`.
- `npm test` — `node:test` suite, no extra deps. Run after backend changes (`src/`, `server.js`).
- Server listens on `:3000`. Page at `/`, API at `/api/standings`.
- Render.com auto-deploys via `render.yaml`.

## Non-obvious context

- **All UI strings are Swedish.** Match that tone in user-facing text.
- **`public/schedule.js` is the source of truth** for fixture order, kick-off times, TV channel, and which person owns TV4 Play on each date. The sheet has no timestamps; live scores from the sheet are matched in by team name.
- **gviz quirk** (see README): each participant tab is fetched in two positional ranges — `A1:E96` (group stage, exactly 72 surviving rows) and `A98:B165` (knockout sections). Don't try to fetch the whole tab in one call.
- **No build step.** `public/` is served directly by Express. `index.html` has critical CSS inlined and an `/*__INITIAL__*/` placeholder that the server replaces with the current standings JSON for first paint.
- **Mobile-first CSS.** Default styles target mobile; desktop kicks in at `min-width: 600px` (and `1000px`).
- **ESM only** (`"type": "module"`).

## House rules

- **Edit existing files; don't create new ones** unless the task genuinely requires it.
- **No emojis in code or comments** unless asked. UI emoji (📺 etc.) is fine where the design already uses it.
- **Default to no comments.** Only add one when the *why* is non-obvious (a constraint, workaround, surprising invariant). Don't restate what the code says.
- **Don't claim a UI change works without verifying it in a browser.** `npm start` then refresh; if you can't open a browser, say so explicitly.
- **Run `npm test` after touching `src/` or `server.js`.**
- **Commit only the files that belong to the change.** `npm install` can regenerate `package-lock.json` metadata — leave those bystander edits out of feature commits.

## Where to look

- Design spec: `docs/superpowers/specs/2026-06-11-vmtips-live-standings-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-11-vmtips-live-standings.md`
- Expected sheet layout (ranges, gviz quirk): `README.md` § *Expected spreadsheet layout*
