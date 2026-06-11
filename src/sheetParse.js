import { normalizeTeam, parseMatchString, parseGoals } from './parse.js';

export const GROUPS = 'ABCDEFGHIJKL'.split('');
const MATCHES_PER_GROUP = 6;
const TOTAL_MATCHES = GROUPS.length * MATCHES_PER_GROUP; // 72

// Etiketter i kolumn A på slutspelssektionernas första rad.
const ROUND_LABELS = new Map([
  ['16-delsfinal lag', 'r32'],
  ['åttondelsfinal lag', 'r16'],
  ['kvartsfinal lag', 'qf'],
  ['semifinal lag', 'sf'],
  ['final lag', 'final'],
  ['vm-vinnare', 'winner'],
]);

export const ROUND_KEYS = ['r32', 'r16', 'qf', 'sf', 'final'];

// Rader från gviz A1:E96&headers=0. gviz tappar grupprubriker och tomrader
// (kolumn A typas som datum), så exakt de 72 matchraderna överlever, i ordning.
// Match i tillhör grupp floor(i/6).
export function parseMatchRows(rows) {
  const matchRows = rows.filter((r) => parseMatchString(r[1] ?? ''));
  if (matchRows.length !== TOTAL_MATCHES) {
    throw new Error(`Förväntade ${TOTAL_MATCHES} matchrader, fick ${matchRows.length}`);
  }
  return matchRows.map((r, i) => {
    const { home, away } = parseMatchString(r[1]);
    return {
      group: GROUPS[Math.floor(i / MATCHES_PER_GROUP)],
      date: String(r[0] ?? '').trim(),
      home,
      away,
      homeGoals: parseGoals(r[2]),
      awayGoals: parseGoals(r[4]),
    };
  });
}

// Rader från gviz A98:B165&headers=0. Sektion byts när kolumn A matchar en
// känd etikett; lagnamn läses ur kolumn B. Tomma rader får falla bort fritt.
export function parseKnockoutRows(rows) {
  const rounds = { r32: [], r16: [], qf: [], sf: [], final: [], winner: null };
  let current = null;
  for (const row of rows) {
    const label = normalizeTeam(row[0] ?? '').toLowerCase();
    if (ROUND_LABELS.has(label)) current = ROUND_LABELS.get(label);
    const team = normalizeTeam(row[1] ?? '');
    if (!team || !current) continue;
    if (current === 'winner') rounds.winner = rounds.winner ?? team;
    else rounds[current].push(team);
  }
  return rounds;
}

// Rader från Ställning!A2:A50 → deltagarnamn.
export function parseParticipants(rows) {
  return rows.map((r) => normalizeTeam(r[0] ?? '')).filter(Boolean);
}
