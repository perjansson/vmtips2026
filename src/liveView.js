import { matchPairKey } from './parse.js';

// Diffar bekräftad mot provisorisk ställning → per-deltagare poäng-delta och
// rank-delta (positiv = klättrar provisoriskt), plus live-matcher med
// pair-nyckel som klienten slår upp schemats LIVE-brickor på.
export function buildLiveView(confirmed, provisional, live) {
  const provByName = new Map(provisional.map((p) => [p.name, p]));
  const byName = {};
  for (const c of confirmed) {
    const p = provByName.get(c.name);
    byName[c.name] = {
      delta: p ? p.total - c.total : 0,
      rankDelta: p ? c.rank - p.rank : 0,
    };
  }
  const matches = (live ?? []).map((l) => ({
    pair: matchPairKey(l),
    home: l.home,
    away: l.away,
    homeGoals: l.homeGoals,
    awayGoals: l.awayGoals,
    status: l.status,
    minute: l.minute,
  }));
  return { byName, matches };
}
