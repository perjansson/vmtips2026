// Portning av Apps Script-funktionen uppdateraSlutspel: vilka 32 lag går
// vidare till 16-delsfinal. 2 bästa per grupp (24) + 8 bästa treorna,
// rangordnade poäng → total målskillnad → totalt gjorda mål. Treor som
// krockar om sista platsen och inte kan särskiljas lämnas "ej fastställda".

const THIRD_SLOTS = 8;

const compareThirds = (a, b) => (b.points - a.points) || (b.gd - a.gd) || (b.gf - a.gf);
const thirdsEqual = (a, b) => compareThirds(a, b) === 0;

// tables: en rangordnad grupptabell (från computeGroupTable) per grupp.
export function computeAdvancement(tables) {
  const qualified = [];
  for (const table of tables) {
    for (const row of table.slice(0, 2)) qualified.push(row.team);
  }

  const thirds = tables.map((t) => t[2]).filter(Boolean).sort(compareThirds);
  const ranked = thirds.map((r) => r.team);

  let undecided = null;
  const last = thirds[THIRD_SLOTS - 1];
  const first9 = thirds[THIRD_SLOTS];
  if (last && first9 && thirdsEqual(last, first9)) {
    // Oseparerbart kluster över 8/9-gränsen: kvala bara de som är strikt
    // bättre, och redovisa resten som kandidater till de återstående platserna.
    const cluster = thirds.filter((t) => thirdsEqual(t, last));
    const clearlyIn = thirds.filter((t) => compareThirds(t, last) < 0);
    qualified.push(...clearlyIn.map((t) => t.team));
    undecided = {
      slots: THIRD_SLOTS - clearlyIn.length,
      candidates: cluster.map((t) => t.team),
    };
  } else {
    qualified.push(...thirds.slice(0, THIRD_SLOTS).map((t) => t.team));
  }

  return { qualified, thirds: { ranked, undecided } };
}
