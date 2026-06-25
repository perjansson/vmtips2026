import { scoreParticipant, scoreGroupMatch } from './scoring.js';
import { computeGroupTable } from './groupTable.js';
import { computeAdvancement } from './advancement.js';
import { GROUPS, emptyRounds } from './sheetParse.js';
import { isPlayed, matchPairKey } from './parse.js';

const EMPTY_PREDICTIONS = { matches: [], rounds: emptyRounds() };

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i);

// Senaste 5 spelade (nyast först) och kommande 5 ospelade (i datumordning)
// ur facit. Radordningen i arket är per grupp, inte kronologisk, så vi
// sorterar på datumkolumnen (ISO-format) med radindex som stabil utväg.
function matchWindows(facitMatches) {
  const indexed = facitMatches.map((m, i) => ({ ...m, i }));
  const played = indexed.filter(isPlayed).sort(byDate);
  const upcoming = indexed.filter((m) => !isPlayed(m)).sort(byDate);
  return {
    recent: played.slice(-5).reverse(),
    upcoming: upcoming.slice(0, 5),
    playedDesc: played.slice().reverse(),
  };
}

function windowWithTips(windowMatches, predByPair) {
  return windowMatches.map((m) => {
    const pred = predByPair.get(matchPairKey(m)) ?? null;
    return {
      date: m.date,
      group: m.group,
      home: m.home,
      away: m.away,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      tipHome: pred?.homeGoals ?? null,
      tipAway: pred?.awayGoals ?? null,
      points: pred ? scoreGroupMatch(pred, m) : null,
    };
  });
}

// Komponerar API-svaret: poäng per deltagare (rangordnat, delad placering vid
// lika poäng) + facit-metadata, inkl. preliminärt avancemang när gruppspelet
// är färdigspelat ("ej fastställd"-fallet redovisas i stället för att gissas).
export function computeStandings({ participants, predictionsByName, facit }) {
  const windows = matchWindows(facit.matches);
  const scored = participants.map((name) => {
    const predictions = predictionsByName.get(name) ?? null;
    const score = scoreParticipant(predictions ?? EMPTY_PREDICTIONS, facit);
    const predByPair = new Map((predictions?.matches ?? []).map((m) => [matchPairKey(m), m]));
    return {
      name,
      missingTab: predictions === null,
      total: score.total,
      groupPoints: score.groupPoints,
      knockoutPoints: score.knockoutPoints,
      winnerPick: predictions?.rounds.winner ?? null,
      matches: {
        recent: windowWithTips(windows.recent, predByPair),
        upcoming: windowWithTips(windows.upcoming, predByPair),
      },
      breakdown: {
        group: {
          points: score.breakdown.group.points,
          scoredMatches: score.breakdown.group.scoredMatches,
        },
        knockout: {
          rounds: score.breakdown.knockout.rounds,
          winnerPoints: score.breakdown.knockout.winnerPoints,
        },
      },
    };
  });

  scored.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name, 'sv'));
  let prevTotal = null;
  let prevRank = 0;
  scored.forEach((p, i) => {
    p.rank = p.total === prevTotal ? prevRank : i + 1;
    prevTotal = p.total;
    prevRank = p.rank;
  });

  const playedMatches = facit.matches.filter(isPlayed).length;
  const groupStageComplete = facit.matches.length > 0 && playedMatches === facit.matches.length;

  let advancement = null;
  if (groupStageComplete) {
    const tables = GROUPS.map(
      (g) => computeGroupTable(facit.matches.filter((m) => m.group === g)),
    );
    advancement = computeAdvancement(tables);
  }

  return {
    participants: scored,
    facit: {
      // Alla spelade matcher, nyast först – för resultatlistan i headern.
      results: windows.playedDesc.map((m) => ({
        date: m.date,
        group: m.group,
        home: m.home,
        away: m.away,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      })),
      playedMatches,
      totalMatches: facit.matches.length,
      groupStageComplete,
      winner: facit.rounds.winner,
      advancement,
      // Lag som faktiskt tagit sig till varje slutspelsrond (litet, delas av
      // alla) – klienten färgar deltagarnas gissningar rätt/fel mot detta.
      rounds: {
        r32: facit.rounds.r32 ?? [],
        r16: facit.rounds.r16 ?? [],
        qf: facit.rounds.qf ?? [],
        sf: facit.rounds.sf ?? [],
        final: facit.rounds.final ?? [],
      },
    },
  };
}
