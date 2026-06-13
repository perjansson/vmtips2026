# VM-tipset 2026 – Live Standings

A simple, responsive web app that shows the live standings of the FIFA World Cup 2026 betting pool ("VM-tipset"). It reads predictions and the answer key from a public Google Sheet, recomputes the points itself (ported Apps Script logic), and auto-updates the leaderboard.

## How it works

- **The server** (Node + Express) fetches the spreadsheet via gviz CSV on a
  background interval into a shared cache — regardless of how many visitors are
  connected, there's still only one sheet fetch per interval. `GET /api/standings`
  serves the pre-computed response (with `Last-Modified`).
- **The client** (plain HTML/CSS/JS, mobile-first) polls the API every 5 seconds
  and updates the board smoothly — FLIP-animated reorder, ▲/▼ on rank changes,
  a point flash on score changes. Light/dark mode follows the system.
- **The answer key in v1** is the `Resultat` tab of the sheet (behind a
  `ResultProvider` interface in `src/resultProvider.js`, so a sports API can be
  swapped in later).

### Scoring rules

| What | Points |
| --- | --- |
| Group match: correct outcome (1/X/2) | 3 p |
| Group match: exact goal count per team | 1 p per team (max 5 p/match) |
| Team advances to R32/R16/QF/SF/Final | 5 p per correct team and round |
| World Cup winner | 10 p |

Group-stage tie-breakers (FIFA World Cup 2026): points → head-to-head (points →
goal difference → goals scored) → overall goal difference → overall goals
scored → alphabetical. 32 teams advance = top 2 per group + 8 best
third-placed teams; third-placed teams that can't be separated for the last
spot are reported as **undecided**.

## Get started locally

```bash
npm install
cp .env.example .env        # adjust as needed
SHEET_ID=<spreadsheet-id> npm start
# or: export $(grep -v '^#' .env | xargs) && npm start
```

Open http://localhost:3000.

```bash
npm test                    # unit tests (node:test, no extra deps)
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `SHEET_ID` | – (required) | Google Spreadsheet ID (public sheet) |
| `PORT` | `3000` | Set by Render in production |
| `SHEET_REFRESH_SECONDS` | `15` | Interval for fetching the answer key (`Resultat`) + participant list |
| `CLIENT_POLL_SECONDS` | `5` | How often the client polls `/api/standings` |
| `PREDICTIONS_REFRESH_SECONDS` | `300` | Interval for re-fetching the participant tabs (predictions are locked once the tournament starts, so this can be sparse) |

No secrets needed — the sheet is publicly readable.

## Deploy on Render

1. Push the repo to GitHub/GitLab.
2. On [render.com](https://render.com): **New → Blueprint** and point it at the
   repo — `render.yaml` sets up the web service and env vars.
   (Or **New → Web Service** manually: runtime Node, build `npm ci`,
   start `npm start`, instance type Starter, plus the env vars above.)
3. Done. Instance type `starter` is always on (no cold starts); `free` also
   works but spins down when idle.

## Expected spreadsheet layout

- Tab `Ställning`: participant names in column A from row 2 (read dynamically).
- Tab `Resultat` + one tab per participant, identical layout:
  - Rows 1–96: 12 groups in 8-row blocks (header, 6 match rows, blank row).
    Col B = `"Home - Away"`, cols C/E = goals (empty = unplayed/unpredicted).
  - Knockout lists in col B: rows 98–129 (Round of 32), 131–146 (Round of 16),
    148–155 (quarterfinals), 157–160 (semifinals), 162–163 (final), 165
    (World Cup winner).

**Note (gviz quirk):** gviz CSV types columns by majority and drops rows whose
cells go null (e.g. text headers in the date column A) — even when you pass
`range`. That's why each tab is fetched in two positionally-safe parts:
the match rows `A1:E96` (exactly 72 rows survive, group = row-index / 6) and
the knockouts `A98:B165` (section break on the labels in column A). See
`docs/superpowers/specs/`.

## Future additions (prepared, not built)

- External football API as the results source behind the same `ResultProvider`
  interface (+ team-name mapping English → Swedish).
- History/graph of how the standings have evolved.
