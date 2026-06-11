import { parseCsv } from './csv.js';
import { parseMatchRows, parseKnockoutRows, parseParticipants } from './sheetParse.js';

// Hämtar via gviz-CSV. OBS: gviz typar kolumner per majoritet och tappar
// rader vars celler nullas (t.ex. text i datumkolumn) – därför hämtas varje
// flik i två positionssäkra delar, se docs/superpowers/specs/.
const BASE = 'https://docs.google.com/spreadsheets/d';

function gvizUrl(sheetId, tabName, range) {
  const params = new URLSearchParams({
    tqx: 'out:csv',
    headers: '0',
    sheet: tabName,
    range,
  });
  return `${BASE}/${sheetId}/gviz/tq?${params}`;
}

async function fetchCsv(sheetId, tabName, range) {
  const res = await fetch(gvizUrl(sheetId, tabName, range), { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Kunde inte hämta fliken "${tabName}" (${range}): HTTP ${res.status}`);
  }
  return parseCsv(await res.text());
}

// En flik (Resultat eller deltagare) → { matches, rounds }.
export async function fetchTab(sheetId, tabName) {
  const [matchRows, knockoutRows] = await Promise.all([
    fetchCsv(sheetId, tabName, 'A1:E96'),
    fetchCsv(sheetId, tabName, 'A98:B165'),
  ]);
  return {
    matches: parseMatchRows(matchRows),
    rounds: parseKnockoutRows(knockoutRows),
  };
}

// Deltagarnamn från Ställning, kolumn A rad 2 och nedåt.
export async function fetchParticipants(sheetId, tabName = 'Ställning') {
  return parseParticipants(await fetchCsv(sheetId, tabName, 'A2:A50'));
}
