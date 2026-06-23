import { computeStandings } from './standings.js';
import { mergeLiveIntoFacit } from './liveMerge.js';
import { buildLiveView } from './liveView.js';

// Live-aware ställning. Snapshotet delas i två:
//  - avslutade matcher (status 'finished') behandlas som facit och vävs in i
//    bas-facit:et, så en avslutad match lämnar live-vyn och visas som ett
//    vanligt (settled) resultat – räknat i totalen, inte som ett pulsande delta.
//  - pågående matcher (status 'live') blir live-överlägg: delta + brickor.
// Arket vinner alltid – mergeLiveIntoFacit rör bara matcher arket saknar.
export function computeStandingsWithLive({ participants, predictionsByName, facit, live = [] }) {
  const finished = live.filter((m) => m.status === 'finished');
  const inPlay = live.filter((m) => m.status === 'live');

  const effectiveFacit = finished.length ? mergeLiveIntoFacit(facit, finished) : facit;
  const standings = computeStandings({ participants, predictionsByName, facit: effectiveFacit });

  let liveView = { byName: {}, matches: [] };
  if (inPlay.length) {
    const liveFacit = mergeLiveIntoFacit(effectiveFacit, inPlay);
    const prov = computeStandings({ participants, predictionsByName, facit: liveFacit });
    liveView = buildLiveView(standings.participants, prov.participants, inPlay);
  }

  // Fäst live-delta och rangordna om på den live-inkluderade totalen, så att
  // ordning och placering speglar det som faktiskt visas (bastotal + live).
  for (const p of standings.participants) {
    const v = liveView.byName[p.name];
    p.liveDelta = v ? v.delta : 0;
    p.liveRankDelta = v ? v.rankDelta : 0;
  }
  rankByLiveTotal(standings.participants);

  return { standings, effectiveFacit, liveView, inPlay };
}

const liveTotal = (p) => p.total + (p.liveDelta || 0);

// Sortera och sätt rank på live-inkluderad total (delad placering vid lika,
// svensk namnsortering som tiebreak – samma som computeStandings).
function rankByLiveTotal(participants) {
  participants.sort((a, b) => (liveTotal(b) - liveTotal(a)) || a.name.localeCompare(b.name, 'sv'));
  let prevTotal = null;
  let prevRank = 0;
  participants.forEach((p, i) => {
    const t = liveTotal(p);
    p.rank = t === prevTotal ? prevRank : i + 1;
    prevTotal = t;
    prevRank = p.rank;
  });
}
