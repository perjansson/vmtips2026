import { toSwedish } from './teamNames.js';

// Live-leverantör: ger getLive() → snapshot i svenska nycklar, samma form
// oavsett källa: [{ home, away, homeGoals, awayGoals, status, minute }].
// status ∈ {'live','finished'}. Provider-agnostiskt så en betald nyckel kan
// droppas in via env utan kodändring (jfr resultProvider.getFacit).

const toInt = (s) => {
  const n = Number(String(s ?? '').trim());
  return Number.isInteger(n) ? n : null;
};

// "Belgien|Iran 2-1 67; Spanien|Marocko 1-0 FT" → snapshot. Lagnamn före "|"
// och efter "|" får innehålla blanksteg; sista två token är score och minut
// (heltal = pågående minut, "FT" = slutspelad). För lokal testning.
export function parseMockConfig(str) {
  const out = [];
  for (const entry of String(str ?? '').split(';')) {
    const e = entry.trim();
    const bar = e.indexOf('|');
    if (bar < 0) continue;
    const home = e.slice(0, bar).trim();
    // "Borta h-a MINUT [typ]" – valfri typ på slutet (t.ex. r32) för slutspel.
    const m = e.slice(bar + 1).trim().match(/^(.+?)\s+(\d+)-(\d+)\s+(\d+|FT)(?:\s+(\w+))?$/i);
    if (!home || !m) continue;
    const minToken = m[4].toUpperCase();
    const live = /^\d+$/.test(minToken);
    out.push({
      home,
      away: m[1].trim(),
      homeGoals: Number(m[2]),
      awayGoals: Number(m[3]),
      status: live ? 'live' : 'finished',
      minute: live ? Number(minToken) : null,
      type: m[5] ? m[5].toLowerCase() : 'group',
    });
  }
  return out;
}

// Råa worldcup26-spel → snapshot. Ej startade matcher och okända lag (utanför
// 48-lagskartan) hoppas över hellre än gissas.
export function normalizeWorldcupGames(games) {
  const out = [];
  for (const g of games ?? []) {
    const finished = String(g.finished ?? '').toUpperCase() === 'TRUE';
    const elapsed = String(g.time_elapsed ?? '').trim().toLowerCase();
    if (!finished && (elapsed === '' || elapsed === 'notstarted')) continue;
    const home = toSwedish(g.home_team_name_en);
    const away = toSwedish(g.away_team_name_en);
    if (!home || !away) continue;
    out.push({
      home,
      away,
      homeGoals: toInt(g.home_score),
      awayGoals: toInt(g.away_score),
      status: finished ? 'finished' : 'live',
      minute: finished ? null : toInt(g.time_elapsed),
      type: g.type ?? 'group',
    });
  }
  return out;
}

function mockProvider(mockStr) {
  return {
    name: 'mock',
    requiresWindow: false, // mock ignorerar live-fönster så den alltid syns lokalt
    async getLive() {
      return parseMockConfig(mockStr);
    },
  };
}

function worldcupProvider({ baseUrl, token }) {
  return {
    name: 'worldcup26',
    requiresWindow: true,
    async getLive() {
      const res = await fetch(`${baseUrl}/get/games`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`worldcup26 HTTP ${res.status}`);
      const body = await res.json();
      const games = Array.isArray(body) ? body : (body.games ?? body.data ?? []);
      return normalizeWorldcupGames(games);
    },
  };
}

// Väljer leverantör ur env. LIVE_MOCK satt ⇒ mock (om inte LIVE_PROVIDER
// uttryckligen säger annat). Annars worldcup26 (kräver LIVE_TOKEN), eller
// 'none' för att stänga av helt.
export function createLiveProvider(env = process.env) {
  const mockStr = env.LIVE_MOCK;
  const name = env.LIVE_PROVIDER || (mockStr ? 'mock' : 'worldcup26');
  if (name === 'mock') return mockProvider(mockStr);
  if (name === 'none') {
    return { name: 'none', requiresWindow: false, async getLive() { return []; } };
  }
  return worldcupProvider({
    baseUrl: env.LIVE_BASE_URL || 'https://worldcup26.ir',
    token: env.LIVE_TOKEN || null,
  });
}
