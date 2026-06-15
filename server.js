import express from 'express';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchTab, fetchParticipants } from './src/sheetClient.js';
import { createSheetResultProvider } from './src/resultProvider.js';
import { computeStandings } from './src/standings.js';
import { matchPairKey, teamKey } from './src/parse.js';

const config = {
  sheetId: process.env.SHEET_ID,
  port: Number(process.env.PORT) || 3000,
  sheetRefreshSeconds: Number(process.env.SHEET_REFRESH_SECONDS) || 15,
  clientPollSeconds: Number(process.env.CLIENT_POLL_SECONDS) || 5,
  predictionsRefreshSeconds: Number(process.env.PREDICTIONS_REFRESH_SECONDS) || 300,
};

// Stabil identifierare för denna deploy. Render sätter RENDER_GIT_COMMIT per
// deploy; lokalt får varje npm start ett unikt timestamp-id. Klienten reloadar
// så fort den ser ett annat buildId från en poll än det sidan laddades med.
const BUILD_ID = process.env.RENDER_GIT_COMMIT || String(Date.now());

if (!config.sheetId) {
  console.error('SHEET_ID saknas. Sätt den i miljön (se .env.example).');
  process.exit(1);
}

const resultProvider = createSheetResultProvider({ sheetId: config.sheetId });

// Delad cache – alla klienter serveras samma beräknade svar, så 100 besökare
// ger ändå bara en ark-hämtning per intervall.
const state = {
  participants: [],
  predictionsByName: new Map(),
  facit: null,
  payload: null, // färdigt JSON-svar för /api/standings
  tipsByPair: null, // alla deltagares gruppmatchstips, grupperat på pair-nyckeln
  updatedAt: null,
};

// Plattat aggregat över alla deltagares gruppmatchstips, så headerns
// matchschema kan expandera och visa "allas tips" utan att blåsa upp
// /api/standings-payloaden (som bakas in i HTML för första målning).
function buildTipsByPair() {
  const byPair = new Map();
  for (const [name, predictions] of state.predictionsByName) {
    for (const m of predictions.matches) {
      if (m.homeGoals === null || m.awayGoals === null) continue;
      const key = matchPairKey(m);
      let list = byPair.get(key);
      if (!list) byPair.set(key, list = []);
      list.push({ name, h: m.homeGoals, a: m.awayGoals });
    }
  }
  for (const list of byPair.values()) {
    list.sort((x, y) => x.name.localeCompare(y.name, 'sv'));
  }
  return Object.fromEntries(byPair);
}

// Avsparkstider från det statiska schemat (public/schedule.js) så vi kan
// sortera spelade matcher kronologiskt – bladets radordning följer grupp
// (A→L), inte tid, så tre matcher samma dag kommer i fel ordning där.
const kickoffByPair = new Map();
try {
  const code = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'schedule.js'),
    'utf8',
  );
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  for (const day of sandbox.window.SCHEDULE ?? []) {
    for (const g of day.games ?? []) {
      if (!g.home) continue;
      kickoffByPair.set(
        `${teamKey(g.home)}|${teamKey(g.away)}`,
        `${day.date} ${g.time}`,
      );
    }
  }
} catch (err) {
  console.error(`Kunde inte läsa schedule.js för avsparkstider: ${err.message}`);
}

// State "innan senast spelade match" – plocka senaste match efter avsparkstid
// (ej bladets radordning) och kör om computeStandings med dess mål satta till
// null. Returnerar { rank, total } per namn så recompute() kan jämföra både
// rangordning och poäng. Kostnad: en till körning av computeStandings per
// recompute – mikrosekunder för rimliga storlekar.
function buildPrevStateByName() {
  if (!state.facit) return new Map();
  const played = state.facit.matches
    .map((m, i) => ({
      m,
      i,
      ts: kickoffByPair.get(matchPairKey(m)) ?? `${m.date} 99:99`,
    }))
    .filter(({ m }) => m.homeGoals !== null && m.awayGoals !== null);
  if (played.length === 0) return new Map();
  played.sort((a, b) =>
    a.ts < b.ts ? -1
      : a.ts > b.ts ? 1
        : a.i - b.i);
  const lastIdx = played[played.length - 1].i;
  const syntheticMatches = state.facit.matches.map((m, i) =>
    (i === lastIdx ? { ...m, homeGoals: null, awayGoals: null } : m));
  const syntheticFacit = { ...state.facit, matches: syntheticMatches };
  const prev = computeStandings({
    participants: state.participants,
    predictionsByName: state.predictionsByName,
    facit: syntheticFacit,
  });
  return new Map(prev.participants.map((p) => [p.name, { rank: p.rank, total: p.total }]));
}

function recompute() {
  if (!state.facit) return;
  const standings = computeStandings({
    participants: state.participants,
    predictionsByName: state.predictionsByName,
    facit: state.facit,
  });

  // Striktare pillogik: räkna faktiska omkörningar istället för att titta på
  // rank-nummer. Att gå från solo-3:a till delad 2:a innebär att vi *delar*
  // platsen med någon – inte att vi körde om dem. rankDelta = (antal som var
  // strikt före men nu är strikt bakom) − (antal i motsatt riktning).
  const prevState = buildPrevStateByName();
  if (prevState.size > 0) {
    for (const p of standings.participants) {
      const ps = prevState.get(p.name);
      if (!ps) continue;
      p.prevRank = ps.rank;
      let passed = 0;
      let overtaken = 0;
      for (const q of standings.participants) {
        if (q.name === p.name) continue;
        const qs = prevState.get(q.name);
        if (!qs) continue;
        if (qs.total > ps.total && q.total < p.total) passed++;
        else if (qs.total < ps.total && q.total > p.total) overtaken++;
      }
      p.rankDelta = passed - overtaken;
    }
  }

  state.updatedAt = new Date();
  state.payload = {
    updatedAt: state.updatedAt.toISOString(),
    clientPollSeconds: config.clientPollSeconds,
    buildId: BUILD_ID,
    ...standings,
  };
  state.tipsByPair = buildTipsByPair();
}

// Facit + deltagarlista, varje SHEET_REFRESH_SECONDS. Fel → behåll cachen.
async function refreshFacit() {
  try {
    const [facit, participants] = await Promise.all([
      resultProvider.getFacit(),
      fetchParticipants(config.sheetId),
    ]);
    const newNames = participants.filter((n) => !state.predictionsByName.has(n));
    // Rensa tips för deltagare som tagits bort ur Ställning – annars skulle en
    // återinlagd deltagare serveras gammal cache tills nästa tips-uppdatering.
    for (const name of [...state.predictionsByName.keys()]) {
      if (!participants.includes(name)) state.predictionsByName.delete(name);
    }
    state.facit = facit;
    state.participants = participants;
    recompute();
    if (newNames.length > 0) await refreshPredictions(newNames);
  } catch (err) {
    console.error(`Facit-uppdatering misslyckades: ${err.message}`);
  }
}

// Deltagarnas tips, varje PREDICTIONS_REFRESH_SECONDS (statiska efter start,
// så detta intervall kan vara glest). Sekventiellt för att vara snäll mot
// Googles rate limits. Fel per flik → behåll deltagarens gamla tips.
async function refreshPredictions(names = state.participants) {
  for (const name of names) {
    try {
      state.predictionsByName.set(name, await fetchTab(config.sheetId, name));
    } catch (err) {
      console.error(`Kunde inte läsa fliken "${name}": ${err.message}`);
    }
  }
  recompute();
}

const app = express();
app.disable('x-powered-by');

app.get('/api/standings', (req, res) => {
  if (!state.payload) {
    res.status(503).json({ error: 'Ställningen är inte laddad ännu, försök strax igen.' });
    return;
  }
  res.set('Cache-Control', 'no-cache');
  res.set('Last-Modified', state.updatedAt.toUTCString());
  res.json(state.payload);
});

// Allas tips per gruppmatch. Klienten prefetchar detta efter första målning
// och cachar lokalt; eftersom tipsen är låsta efter turneringsstart räcker
// en hämtning per sidladdning.
app.get('/api/match-tips', (req, res) => {
  if (!state.tipsByPair) {
    res.status(503).json({ error: 'Tipsen är inte laddade ännu, försök strax igen.' });
    return;
  }
  res.set('Cache-Control', 'no-cache');
  res.set('Last-Modified', state.updatedAt.toUTCString());
  res.json({
    updatedAt: state.updatedAt.toISOString(),
    tipsByPair: state.tipsByPair,
  });
});

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

// Startsidan serveras med aktuell ställning inbakad, så att första målningen
// redan har data i stället för en tom tavla som väntar på första pollen.
// JSON:en escapas (< → <) så den inte kan bryta sig ur script-taggen.
// Statiska asset-URL:er får ?v=BUILD_ID som cache-buster så att en deploy
// faktiskt drar in ny JS/CSS i stället för 5-min-cachen.
const indexTemplate = readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  .replaceAll('__BUILD_VERSION__', BUILD_ID);
app.get(['/', '/index.html'], (req, res) => {
  const json = state.payload
    ? JSON.stringify(state.payload).replaceAll('<', '\\u003c')
    : 'null';
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(indexTemplate.replace('/*__INITIAL__*/null', json));
});

// Statiska filer får cachas en stund av mobilen – minskar risken för
// ostylad sida vid omladdning på segt nät. ETag gör att de ändå
// revalideras billigt efter en deploy.
app.use(express.static(publicDir, { maxAge: '5m', index: false }));

await refreshFacit();
await refreshPredictions();

setInterval(refreshFacit, config.sheetRefreshSeconds * 1000);
setInterval(refreshPredictions, config.predictionsRefreshSeconds * 1000);

app.listen(config.port, () => {
  console.log(`Lyssnar på http://localhost:${config.port} (ark-uppdatering var ${config.sheetRefreshSeconds}s)`);
});
