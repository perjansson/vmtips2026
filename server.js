import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchTab, fetchParticipants } from './src/sheetClient.js';
import { createSheetResultProvider } from './src/resultProvider.js';
import { computeStandings } from './src/standings.js';

const config = {
  sheetId: process.env.SHEET_ID,
  port: Number(process.env.PORT) || 3000,
  sheetRefreshSeconds: Number(process.env.SHEET_REFRESH_SECONDS) || 15,
  clientPollSeconds: Number(process.env.CLIENT_POLL_SECONDS) || 5,
  predictionsRefreshSeconds: Number(process.env.PREDICTIONS_REFRESH_SECONDS) || 300,
};

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
  updatedAt: null,
};

function recompute() {
  if (!state.facit) return;
  const standings = computeStandings({
    participants: state.participants,
    predictionsByName: state.predictionsByName,
    facit: state.facit,
  });
  state.updatedAt = new Date();
  state.payload = {
    updatedAt: state.updatedAt.toISOString(),
    clientPollSeconds: config.clientPollSeconds,
    ...standings,
  };
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

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

// Startsidan serveras med aktuell ställning inbakad, så att första målningen
// redan har data i stället för en tom tavla som väntar på första pollen.
// JSON:en escapas (< → <) så den inte kan bryta sig ur script-taggen.
const indexTemplate = readFileSync(path.join(publicDir, 'index.html'), 'utf8');
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
