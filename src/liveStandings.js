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

  return { standings, effectiveFacit, liveView, inPlay };
}
