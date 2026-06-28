import express from 'express';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchTab, fetchParticipants } from './src/sheetClient.js';
import { createSheetResultProvider } from './src/resultProvider.js';
import { createLiveProvider } from './src/liveProvider.js';
import { computeStandingsWithLive, captureSettled, captureSettledRounds } from './src/liveStandings.js';
import { isInLiveWindow } from './src/liveWindow.js';
import { computeStandings } from './src/standings.js';
import { matchPairKey, teamKey } from './src/parse.js';

const config = {
  sheetId: process.env.SHEET_ID,
  port: Number(process.env.PORT) || 3000,
  sheetRefreshSeconds: Number(process.env.SHEET_REFRESH_SECONDS) || 15,
  clientPollSeconds: Number(process.env.CLIENT_POLL_SECONDS) || 5,
  predictionsRefreshSeconds: Number(process.env.PREDICTIONS_REFRESH_SECONDS) || 300,
  liveRefreshSeconds: Number(process.env.LIVE_REFRESH_SECONDS) || 15,
  liveEnabled: process.env.LIVE_ENABLED !== 'false',
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
const liveProvider = createLiveProvider();

// Delad cache – alla klienter serveras samma beräknade svar, så 100 besökare
// ger ändå bara en ark-hämtning per intervall.
const state = {
  participants: [],
  predictionsByName: new Map(),
  facit: null,
  payload: null, // färdigt JSON-svar för /api/standings
  tipsByPair: null, // alla deltagares gruppmatchstips, grupperat på pair-nyckeln
  knockoutByName: null, // namn → { r32, r16, qf, sf, final } slutspelsgissningar
  live: [], // pågående matcher (transient), [] när inget spelas just nu
  settled: new Map(), // pair → avslutat grupp-resultat, behålls tills arket har det
  settledRounds: new Map(), // pair → avslutad slutspelsmatch (vinnare → nästa rond)
  settledSeeded: false, // har vi pollat minst en gång (seedat settled)?
  liveUpdatedAt: null,
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

// Per deltagare: gissade lag per slutspelsrond. Statiskt (låst efter start),
// så det serveras via /api/match-tips (hämtas en gång) i stället för att blåsa
// upp /api/standings-pollen. Klienten färgar mot facit.rounds från pollen.
function buildKnockoutByName() {
  const out = {};
  for (const [name, predictions] of state.predictionsByName) {
    const r = predictions.rounds ?? {};
    out[name] = {
      r32: r.r32 ?? [],
      r16: r.r16 ?? [],
      qf: r.qf ?? [],
      sf: r.sf ?? [],
      final: r.final ?? [],
      winner: r.winner ?? null,
    };
  }
  return out;
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
function buildPrevStateByName(facit) {
  if (!facit) return new Map();
  const played = facit.matches
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
  const syntheticMatches = facit.matches.map((m, i) =>
    (i === lastIdx ? { ...m, homeGoals: null, awayGoals: null } : m));
  const syntheticFacit = { ...facit, matches: syntheticMatches };
  const prev = computeStandings({
    participants: state.participants,
    predictionsByName: state.predictionsByName,
    facit: syntheticFacit,
  });
  return new Map(prev.participants.map((p) => [p.name, { rank: p.rank, total: p.total }]));
}

function recompute() {
  if (!state.facit) return;
  // Avslutade live-matcher vävs in i facit:et (settled, arket vinner ändå);
  // pågående matcher blir live-överlägg. Resten räknar på det "effektiva"
  // facit:et så avslutade matcher visas precis som arkbekräftade resultat.
  // Avslutade resultat (beständiga, även mellan live-fönster) + pågående matcher.
  const live = [...state.settled.values(), ...state.settledRounds.values(), ...state.live];
  const { standings, effectiveFacit, liveView } = computeStandingsWithLive({
    participants: state.participants,
    predictionsByName: state.predictionsByName,
    facit: state.facit,
    live,
  });

  // Striktare pillogik: räkna faktiska omkörningar istället för att titta på
  // rank-nummer. Att gå från solo-3:a till delad 2:a innebär att vi *delar*
  // platsen med någon – inte att vi körde om dem. rankDelta = (antal som var
  // strikt före men nu är strikt bakom) − (antal i motsatt riktning).
  // Jämför mot live-inkluderad total så pilen stämmer med den visade
  // placeringen (som också rankas på bastotal + live).
  const prevState = buildPrevStateByName(effectiveFacit);
  if (prevState.size > 0) {
    for (const p of standings.participants) {
      const ps = prevState.get(p.name);
      if (!ps) continue;
      p.prevRank = ps.rank;
      const pTotal = p.total + p.liveDelta;
      let passed = 0;
      let overtaken = 0;
      for (const q of standings.participants) {
        if (q.name === p.name) continue;
        const qs = prevState.get(q.name);
        if (!qs) continue;
        const qTotal = q.total + q.liveDelta;
        if (qs.total > ps.total && qTotal < pTotal) passed++;
        else if (qs.total < ps.total && qTotal > pTotal) overtaken++;
      }
      p.rankDelta = passed - overtaken;
    }
  }

  // Turneringsbreda totaler. Gruppmatcher släpper 5p per spelad match;
  // slutspelets poäng låses upp rond för rond när nästa rondens lag-roster
  // är känd (r16 full ⇒ R32-ronden klar ⇒ 16 matcher + 16 lag-vidare-poäng).
  // Final + bronsmatch ger inga avancemangspoäng, men vinnaren ger 10p extra.
  const rounds = effectiveFacit.rounds ?? {};
  const groupPlayed = standings.facit.playedMatches;
  const groupTotal = effectiveFacit.matches.length || 72;

  let knockoutPlayed = 0;
  let pointsAtStake = groupPlayed * 5;
  if (groupPlayed === groupTotal) pointsAtStake += 32 * 5; // R32-avancemang spikat

  const ROUND_SIZES = [['r16', 16], ['qf', 8], ['sf', 4], ['final', 2]];
  for (const [key, size] of ROUND_SIZES) {
    if ((rounds[key] ?? []).length === size) {
      knockoutPlayed += size;
      pointsAtStake += size * 5;
    }
  }
  if (rounds.winner) {
    knockoutPlayed += 2; // final + bronsmatch
    pointsAtStake += 10;
  }

  standings.facit.totalAllMatches = groupTotal + 32; // 104
  standings.facit.matchesPlayedTotal = groupPlayed + knockoutPlayed;
  standings.facit.pointsAtStake = pointsAtStake;
  // Per person max över hela turneringen: 72×5 (grupp) + 5×(32+16+8+4+2)
  // (lag-vidare) + 10 (vinnare) = 360 + 310 + 10 = 680.
  standings.facit.pointsTotal = groupTotal * 5 + (32 + 16 + 8 + 4 + 2) * 5 + 10;

  // Live-överlägg = bara pågående matcher (avslutade ligger redan i totalen).
  // p.liveDelta/liveRankDelta och placeringen sätts i computeStandingsWithLive.
  standings.live = {
    matches: liveView.matches,
    provider: liveProvider.name,
    updatedAt: state.liveUpdatedAt ? state.liveUpdatedAt.toISOString() : null,
  };
  // Avslutade slutspelsmatchers slutresultat (från feeden, behålls även efter
  // att arket har avancemanget). Endast för visning – påverkar inga poäng.
  standings.koResults = [...state.settledRounds.entries()].map(([pair, m]) => ({
    pair, homeGoals: m.homeGoals, awayGoals: m.awayGoals,
  }));

  state.updatedAt = new Date();
  state.payload = {
    updatedAt: state.updatedAt.toISOString(),
    clientPollSeconds: config.clientPollSeconds,
    buildId: BUILD_ID,
    ...standings,
  };
  state.tipsByPair = buildTipsByPair();
  state.knockoutByName = buildKnockoutByName();
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

// Är någon schemalagd match i sitt live-fönster just nu? Avsparkstiderna är
// svensk tid; isInLiveWindow tolkar dem som +02:00 så detta blir rätt även när
// servern kör UTC (Render). Se src/liveWindow.js.
function anyMatchInWindow(now = Date.now()) {
  for (const ts of kickoffByPair.values()) {
    if (isInLiveWindow(ts, now)) return true;
  }
  return false;
}

// Live-snapshot, varje LIVE_REFRESH_SECONDS. Pollar bara providern inom ett
// schemalagt live-fönster (såvida providern inte själv ignorerar det, t.ex.
// mock). Fel/timeout → behåll förra snapshot (självläkande), kasta aldrig.
async function refreshLive() {
  if (!config.liveEnabled) return;
  try {
    // Utanför live-fönster pollar vi inte (kvotvänligt) – MEN bara när vi redan
    // seedat de avslutade resultaten minst en gång, så en omstart mitt i natten
    // ändå hämtar gårdagens slutresultat. state.settled (avslutade) behålls
    // alltid; bara pågående matcher (state.live) är transienta.
    if (liveProvider.requiresWindow && state.settledSeeded && !anyMatchInWindow()) {
      if (state.live.length > 0) { state.live = []; recompute(); }
      return;
    }
    const snap = await liveProvider.getLive();
    captureSettled(state.settled, snap);
    captureSettledRounds(state.settledRounds, snap);
    state.live = (Array.isArray(snap) ? snap : []).filter((m) => m.status === 'live');
    state.settledSeeded = true;
    state.liveUpdatedAt = new Date();
    recompute();
  } catch (err) {
    console.error(`Live-uppdatering misslyckades: ${err.message}`);
  }
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
    knockoutByName: state.knockoutByName ?? {},
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
await refreshLive();

setInterval(refreshFacit, config.sheetRefreshSeconds * 1000);
setInterval(refreshPredictions, config.predictionsRefreshSeconds * 1000);
if (config.liveEnabled) setInterval(refreshLive, config.liveRefreshSeconds * 1000);

app.listen(config.port, () => {
  console.log(`Lyssnar på http://localhost:${config.port} (ark-uppdatering var ${config.sheetRefreshSeconds}s)`);
});
