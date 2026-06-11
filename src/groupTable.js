import { teamKey } from './parse.js';

// Portning av Apps Script-funktionen GRUPPTABELL.
// Rangordning (FIFA VM 2026 per spec): poäng → inbördes möten bland poänglika
// lag (poäng → målskillnad → gjorda mål) → total målskillnad → totalt gjorda
// mål → bokstavsordning (sv) som stabil utväg.

function emptyRow(team) {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

function tally(rows, matches) {
  for (const match of matches) {
    if (match.homeGoals === null || match.awayGoals === null) continue;
    const home = rows.get(teamKey(match.home));
    const away = rows.get(teamKey(match.away));
    home.played++; away.played++;
    home.gf += match.homeGoals; home.ga += match.awayGoals;
    away.gf += match.awayGoals; away.ga += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won++; away.lost++; home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.won++; home.lost++; away.points += 3;
    } else {
      home.drawn++; away.drawn++; home.points += 1; away.points += 1;
    }
  }
  for (const row of rows.values()) row.gd = row.gf - row.ga;
}

export function computeGroupTable(matches) {
  const rows = new Map();
  for (const match of matches) {
    for (const team of [match.home, match.away]) {
      if (!rows.has(teamKey(team))) rows.set(teamKey(team), emptyRow(team));
    }
  }
  tally(rows, matches);

  // Inbördes mini-tabell per poängkluster.
  const byPoints = new Map();
  for (const row of rows.values()) {
    if (!byPoints.has(row.points)) byPoints.set(row.points, []);
    byPoints.get(row.points).push(teamKey(row.team));
  }
  const h2h = new Map(); // teamKey → mini-rad inom sitt poängkluster
  for (const cluster of byPoints.values()) {
    if (cluster.length < 2) continue;
    const clusterSet = new Set(cluster);
    const mini = new Map(cluster.map((k) => [k, emptyRow(rows.get(k).team)]));
    tally(mini, matches.filter(
      (match) => clusterSet.has(teamKey(match.home)) && clusterSet.has(teamKey(match.away)),
    ));
    for (const [k, row] of mini) h2h.set(k, row);
  }

  const zero = emptyRow('');
  return [...rows.values()].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    const ha = h2h.get(teamKey(a.team)) ?? zero;
    const hb = h2h.get(teamKey(b.team)) ?? zero;
    return (hb.points - ha.points)
      || (hb.gd - ha.gd)
      || (hb.gf - ha.gf)
      || (b.gd - a.gd)
      || (b.gf - a.gf)
      || a.team.localeCompare(b.team, 'sv');
  });
}
