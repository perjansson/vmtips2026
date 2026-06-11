import { scoreParticipant } from './scoring.js';
import { computeGroupTable } from './groupTable.js';
import { computeAdvancement } from './advancement.js';
import { GROUPS } from './sheetParse.js';

const EMPTY_PREDICTIONS = {
  matches: [],
  rounds: { r32: [], r16: [], qf: [], sf: [], final: [], winner: null },
};

// Komponerar API-svaret: poäng per deltagare (rangordnat, delad placering vid
// lika poäng) + facit-metadata, inkl. preliminärt avancemang när gruppspelet
// är färdigspelat ("ej fastställd"-fallet redovisas i stället för att gissas).
export function computeStandings({ participants, predictionsByName, facit }) {
  const scored = participants.map((name) => {
    const predictions = predictionsByName.get(name) ?? null;
    const score = scoreParticipant(predictions ?? EMPTY_PREDICTIONS, facit);
    return {
      name,
      missingTab: predictions === null,
      total: score.total,
      groupPoints: score.groupPoints,
      knockoutPoints: score.knockoutPoints,
      winnerPick: predictions?.rounds.winner ?? null,
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

  const playedMatches = facit.matches.filter(
    (m) => m.homeGoals !== null && m.awayGoals !== null,
  ).length;
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
      playedMatches,
      totalMatches: facit.matches.length,
      groupStageComplete,
      winner: facit.rounds.winner,
      roundCounts: {
        r32: facit.rounds.r32.length,
        r16: facit.rounds.r16.length,
        qf: facit.rounds.qf.length,
        sf: facit.rounds.sf.length,
        final: facit.rounds.final.length,
      },
      advancement,
    },
  };
}
