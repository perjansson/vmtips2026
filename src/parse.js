const NBSP = /[  ]/g;

// Normaliserar lagnamn så de matchar mellan flikar: NBSP → mellanslag,
// ihopslagna mellanslag, trimmat.
export function normalizeTeam(name) {
  return String(name ?? '').replace(NBSP, ' ').replace(/\s+/g, ' ').trim();
}

// Nyckel för jämförelse mellan flikar (case-okänslig).
export function teamKey(name) {
  return normalizeTeam(name).toLowerCase();
}

// "Hemmalag - Bortalag" → {home, away}. Tål -, – och — som separator,
// även med hårda mellanslag runt om. Bindestreck inuti lagnamn
// (utan omgivande mellanslag) lämnas orörda.
export function parseMatchString(s) {
  const normalized = normalizeTeam(s);
  const m = normalized.split(/\s+[-–—]\s+/);
  if (m.length !== 2 || !m[0] || !m[1]) return null;
  return { home: m[0], away: m[1] };
}

// Målcell → heltal eller null (tom/ej numerisk = ospelad/otippad).
export function parseGoals(cell) {
  const s = String(cell ?? '').replace(NBSP, ' ').trim();
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}
