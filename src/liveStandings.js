import { computeStandings } from './standings.js';
import { mergeLiveIntoFacit } from './liveMerge.js';
import { buildLiveView } from './liveView.js';
import { isKnockoutType, applyLiveKnockout, KO_NEXT_ROUND } from './liveKnockout.js';
import { matchPairKey, teamKey } from './parse.js';

// Plockar avslutade GRUPPmatcher ur ett live-snapshot in i en beständig karta
// (pair → resultat). Behålls som "settled" även när live-fönstret stängt och vi
// slutar polla – tills arket har resultatet (då vinner arket via merge-only-
// empty). Pågående matcher och slutspelsmatcher fångas inte här.
export function captureSettled(settled, snapshot) {
  for (const m of snapshot ?? []) {
    if (m.status === 'finished' && !isKnockoutType(m.type)
      && m.homeGoals != null && m.awayGoals != null) {
      settled.set(matchPairKey(m), {
        home: m.home,
        away: m.away,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        status: 'finished',
        type: 'group',
      });
    }
  }
  return settled;
}

// Som captureSettled, fast för avslutade SLUTSPELsmatcher (sparar typen så
// vinnaren kan vävas in i rätt rond). applyLiveKnockout avgör vinnare och
// arket-vinner-logiken; oavgjorda (straff) bidrar inget förrän arket har dem.
export function captureSettledRounds(settledRounds, snapshot) {
  for (const m of snapshot ?? []) {
    if (m.status === 'finished' && isKnockoutType(m.type)
      && m.homeGoals != null && m.awayGoals != null) {
      settledRounds.set(matchPairKey(m), {
        home: m.home,
        away: m.away,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        status: 'finished',
        type: m.type,
      });
    }
  }
  return settledRounds;
}

// Live-aware ställning. Snapshotet delas i två:
//  - avslutade matcher (status 'finished') behandlas som facit och vävs in i
//    bas-facit:et, så en avslutad match lämnar live-vyn och visas som ett
//    vanligt (settled) resultat – räknat i totalen, inte som ett pulsande delta.
//  - pågående matcher (status 'live') blir live-överlägg: delta + brickor.
// Arket vinner alltid – mergeLiveIntoFacit rör bara matcher arket saknar.
export function computeStandingsWithLive({ participants, predictionsByName, facit, live = [] }) {
  const finished = live.filter((m) => m.status === 'finished');
  const inPlay = live.filter((m) => m.status === 'live');
  const groupFinished = finished.filter((m) => !isKnockoutType(m.type));
  const koFinished = finished.filter((m) => isKnockoutType(m.type));
  const groupInPlay = inPlay.filter((m) => !isKnockoutType(m.type));
  const koInPlay = inPlay.filter((m) => isKnockoutType(m.type));

  // Effektivt facit: avslutade gruppmatcher fylls i .matches, avslutade
  // slutspelsmatcher väver in vinnaren i nästa rond i .rounds. Arket vinner.
  const effectiveFacit = {
    ...facit,
    matches: groupFinished.length ? mergeLiveIntoFacit(facit, groupFinished).matches : facit.matches,
    rounds: koFinished.length ? applyLiveKnockout(facit.rounds, koFinished) : facit.rounds,
  };
  const standings = computeStandings({ participants, predictionsByName, facit: effectiveFacit });

  // Live-överlägg (pulsande delta): pågående gruppmatcher (mål i .matches) OCH
  // pågående slutspelsmatchers ledare (provisoriskt vidare i .rounds). live.
  // matches visar ALLA pågående matcher som scoreline, även slutspel.
  let prov = standings;
  if (groupInPlay.length || koInPlay.length) {
    const liveFacit = {
      ...effectiveFacit,
      matches: groupInPlay.length ? mergeLiveIntoFacit(effectiveFacit, groupInPlay).matches : effectiveFacit.matches,
      rounds: koInPlay.length ? applyLiveKnockout(effectiveFacit.rounds, koInPlay) : effectiveFacit.rounds,
    };
    prov = computeStandings({ participants, predictionsByName, facit: liveFacit });
  }
  // En slutspelsmatch som arket redan avgjort (något av lagen finns i målronden)
  // ska sluta pulsa som live direkt – feeden kan ligga efter och rapportera
  // 'live' långt efter att vi vet vem som gått vidare. Gruppmatcher rörs inte.
  const koSettled = (m) => {
    if (!isKnockoutType(m.type)) return false;
    const next = KO_NEXT_ROUND[m.type];
    if (!next) return false;
    const roster = next === 'winner'
      ? [effectiveFacit.rounds?.winner].filter(Boolean)
      : (effectiveFacit.rounds?.[next] ?? []);
    const keys = new Set(roster.map(teamKey));
    return keys.has(teamKey(m.home)) || keys.has(teamKey(m.away));
  };
  const visibleInPlay = inPlay.filter((m) => !koSettled(m));
  const liveView = buildLiveView(standings.participants, prov.participants, visibleInPlay);

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
