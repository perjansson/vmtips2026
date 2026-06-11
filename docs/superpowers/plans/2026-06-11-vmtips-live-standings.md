# VM 2026 Live Standings – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live standings webapp for the VM 2026 tipping game, reading a public Google Sheet, on Render.

**Architecture:** Express server polls the sheet on a background interval into a shared cache,
computes standings with ported Apps Script logic, serves `GET /api/standings` + static frontend.
Frontend polls the API every 5 s and updates softly. See the spec doc for verified sheet layout
and the position-safe gviz strategy.

**Tech Stack:** Node 18+ (built-in `fetch`, `node:test`), Express 4, vanilla HTML/CSS/JS. No other deps.

User instruction: short plan, stepwise delivery. TDD per module; commit per task.

---

### Task 1: Project scaffold
- [ ] `npm init -y`, install `express`, set `"type": "module"`, scripts: `start` → `node server.js`, `test` → `node --test`.
- [ ] `.gitignore` (node_modules, .env), `.env.example` (SHEET_ID, PORT, SHEET_REFRESH_SECONDS=15, CLIENT_POLL_SECONDS=5, PREDICTIONS_REFRESH_SECONDS=300).
- [ ] Commit.

### Task 2: CSV + parsing utilities (`src/csv.js`, `src/parse.js`, tests)
- [ ] TDD `parseCsv(text)` → string[][] handling quoted fields, embedded commas/quotes, CRLF.
- [ ] TDD `normalizeTeam(name)`: trim, NBSP→space, collapse spaces; `teamKey(name)` lowercase for comparison.
- [ ] TDD `parseMatchString("Hemmalag - Bortalag")` → `{home, away}`, tolerant of `-`/`–`/`—` and NBSP around separator; returns null if unparseable.
- [ ] TDD `parseGoals(cell)` → integer or null (empty/non-numeric → null).
- [ ] Commit.

### Task 3: Sheet tab parsing (`src/sheetParse.js`, tests)
- [ ] TDD `parseMatchRows(rows)` — input: the 72 surviving CSV rows from `A1:E96&headers=0`; output: 72 matches `{group: 'A'..'L', home, away, homeGoals, awayGoals}`; group = floor(i/6). Throw/flag if row count ≠ 72.
- [ ] TDD `parseKnockoutRows(rows)` — input rows from `A98:B165&headers=0`; label anchors in col A (`16-delsfinal lag`, `Åttondelsfinal lag`, `Kvartsfinal lag`, `Semifinal lag`, `Final lag`, `VM-vinnare`) switch section; col B non-empty values collected per round → `{r32:[], r16:[], qf:[], sf:[], final:[], winner: name|null}`.
- [ ] TDD `parseParticipants(rows)` from `Ställning!A2:A50` → string[].
- [ ] Commit.

### Task 4: Group table – GRUPPTABELL port (`src/groupTable.js`, tests)
- [ ] TDD `computeGroupTable(matches)` (played matches only) → rows `{team, played, won, drawn, lost, gf, ga, gd, points}` ranked: points → head-to-head among tied subset (points → GD → GF within subset) → total GD → total GF → alphabetical (sv locale).
- [ ] Test cases: simple table; two-team tie resolved by head-to-head; three-team circular tie falling through to total GD; alphabetical last resort.
- [ ] Commit.

### Task 5: Advancement – uppdateraSlutspel port (`src/advancement.js`, tests)
- [ ] TDD `computeAdvancement(groupTables)` → `{qualified: [teams...], undecided: {slots, candidates}|null}`: top 2 per group (24) + 8 best thirds ranked points → total GD → total GF. Thirds tied across the 8/9 boundary on all three keys → those teams excluded, `undecided` populated.
- [ ] Test cases: clean case; two-way tie at boundary separable by GF; three-way unseparable tie at boundary → exactly the unseparable slot(s) marked undecided, clearly-qualified thirds still included.
- [ ] Commit.

### Task 6: Scoring (`src/scoring.js`, tests)
- [ ] TDD `scoreGroupMatch(pred, actual)` → 0–5: 3 for correct 1/X/2 + 1 per exact team goal count; 0/null if either side unplayed/untipped.
- [ ] TDD `scoreRounds(predRounds, actualRounds)` → 5 p per predicted team present in same round's facit list (set membership via teamKey), per round r32/r16/qf/sf/final; winner: 10 p if match.
- [ ] TDD `scoreParticipant(predictions, facit)` → `{total, groupPoints, knockoutPoints, breakdown}` with per-round `{points, correct, possible}` and group `{outcomePoints, exactGoalPoints, scoredMatches}`.
- [ ] Commit.

### Task 7: Sheet client + ResultProvider (`src/sheetClient.js`, `src/resultProvider.js`)
- [ ] `fetchTab(sheetId, tabName)` → gviz URLs (encodeURIComponent tab), two fetches per spec strategy, returns `{matches, rounds}`; `fetchParticipants(sheetId)`. Non-200 → throw.
- [ ] `createSheetResultProvider({sheetId})` with `getFacit()` → `{matches, rounds}` from `Resultat`. Interface point for future API source.
- [ ] Smoke-test against the real sheet manually (not in unit tests).
- [ ] Commit.

### Task 8: Standings assembly + server (`src/standings.js`, `server.js`)
- [ ] `computeStandings({participants, predictionsByName, facit})` → ranked list (ties share rank, sorted total desc then name), plus facit-derived extras: group tables + projected advancement (for "ej fastställd" display), counts of played matches. Unit test with synthetic data.
- [ ] `server.js`: env config; background refresh loops (facit every SHEET_REFRESH_SECONDS; participants+predictions every PREDICTIONS_REFRESH_SECONDS; initial load before listen, tolerant of per-tab failure → keep stale, flag `stale`); `GET /api/standings` serves cached JSON + `Last-Modified` + `updatedAt` + `clientPollSeconds`; `express.static('public')`.
- [ ] Manual verify: `npm start`, `curl localhost:3000/api/standings`.
- [ ] Commit.

### Task 9: Frontend (`public/index.html`, `public/style.css`, `public/app.js`)
- [ ] Mobile-first leaderboard: rank badges (gold/silver/bronze top 3), name, total, group/knockout split chips, leader highlight, "Senast uppdaterad" footer, movement arrows ▲▼ vs previous poll, FLIP reorder animation, expandable per-participant detail (breakdown per round + winner pick).
- [ ] Scoreboard aesthetic: grass-green accent, light/dark via `prefers-color-scheme`, system font stack, cards, no horizontal scroll, aria labels/roles, keyboard-expandable details.
- [ ] Poll `/api/standings` at server-provided interval; soft DOM updates (no blink); offline/error → keep last data, show subtle stale note.
- [ ] Commit.

### Task 10: Deploy + docs + verification
- [ ] `render.yaml` (web service, Hobby plan, `npm install`/`npm start`, env vars incl. SHEET_ID).
- [ ] `README.md`: setup, env vars, local run, test, Render deploy steps.
- [ ] Run full test suite; start server; spot-check totals vs sheet's own `Ställning!B` column (all 0 pre-results; also verify with a synthetic facit fixture through the scoring pipeline).
- [ ] Commit.

## Self-review notes
- Spec coverage: §2 gviz strategy → T2/T3/T7; §3 ResultProvider → T7; §4a → T4; §4b incl. "ej fastställd" → T5; §5 → T6; §6 server/cache/env → T8; §6b UI → T9; §7 acceptance → T10 (tests T2–T6,T8).
- Acceptance #4 graceful handling: nulls handled in T2 (parseGoals), T6 (skip unscored), T5 (undecided), T9 (UI shows "ej fastställd").
