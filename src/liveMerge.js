import { matchPairKey, isPlayed } from './parse.js';

// Bygger ett "provisoriskt facit": en kopia av arkets facit där matcher som
// arket ännu inte har resultat för fylls i med live-mål. Arket vinner alltid –
// redan spelade matcher lämnas orörda. Live-poster utan båda målen ifyllda
// (ej startad match) hoppas över. Returnerar ett nytt objekt, muterar inte.
export function mergeLiveIntoFacit(facit, live) {
  const liveByPair = new Map();
  for (const l of live ?? []) {
    if (l.homeGoals === null || l.homeGoals === undefined) continue;
    if (l.awayGoals === null || l.awayGoals === undefined) continue;
    liveByPair.set(matchPairKey(l), l);
  }
  const matches = facit.matches.map((m) => {
    if (isPlayed(m)) return m;
    const l = liveByPair.get(matchPairKey(m));
    if (!l) return m;
    return { ...m, homeGoals: l.homeGoals, awayGoals: l.awayGoals };
  });
  return { ...facit, matches };
}
