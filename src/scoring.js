import { teamKey } from './parse.js';
import { ROUND_KEYS } from './sheetParse.js';

export const POINTS = {
  outcome: 3,
  exactGoals: 1, // per lag
  roundTeam: 5,
  winner: 10,
};

const sign = (a, b) => Math.sign(a - b);

// Gruppmatch: 3 p för rätt utgång (1/X/2) + 1 p per lag vars exakta målantal
// prickas. Poäng ges bara när både facit och tips har båda målen ifyllda.
export function scoreGroupMatch(pred, actual) {
  const values = [pred.homeGoals, pred.awayGoals, actual.homeGoals, actual.awayGoals];
  if (values.some((v) => v === null || v === undefined)) return null;
  let points = 0;
  if (sign(pred.homeGoals, pred.awayGoals) === sign(actual.homeGoals, actual.awayGoals)) {
    points += POINTS.outcome;
  }
  if (pred.homeGoals === actual.homeGoals) points += POINTS.exactGoals;
  if (pred.awayGoals === actual.awayGoals) points += POINTS.exactGoals;
  return points;
}

const matchPairKey = (m) => `${teamKey(m.home)}|${teamKey(m.away)}`;

function scoreGroups(predMatches, facitMatches) {
  const facitByPair = new Map(facitMatches.map((m) => [matchPairKey(m), m]));
  let points = 0;
  let scoredMatches = 0;
  const perMatch = [];
  for (const pred of predMatches) {
    const actual = facitByPair.get(matchPairKey(pred));
    const matchPoints = actual ? scoreGroupMatch(pred, actual) : null;
    if (matchPoints !== null) {
      points += matchPoints;
      scoredMatches++;
    }
    perMatch.push(matchPoints);
  }
  return { points, scoredMatches, perMatch };
}

// 5 p per lag i deltagarens rondlista som finns i facitlistan för samma rond,
// 10 p för rätt VM-vinnare. Delvis ifyllt facit ger delvisa poäng.
export function scoreRounds(predRounds, facitRounds) {
  const rounds = {};
  let points = 0;
  for (const round of ROUND_KEYS) {
    const facitSet = new Set((facitRounds[round] ?? []).map(teamKey));
    const predTeams = new Set((predRounds[round] ?? []).map(teamKey));
    const correct = [...predTeams].filter((t) => facitSet.has(t)).length;
    rounds[round] = { points: correct * POINTS.roundTeam, correct };
    points += rounds[round].points;
  }
  const winnerPoints = (facitRounds.winner && predRounds.winner
    && teamKey(facitRounds.winner) === teamKey(predRounds.winner)) ? POINTS.winner : 0;
  return { rounds, winnerPoints, points };
}

// Hela poängen för en deltagare mot facit.
export function scoreParticipant(predictions, facit) {
  const group = scoreGroups(predictions.matches, facit.matches);
  const knockout = scoreRounds(predictions.rounds, facit.rounds);
  const groupPoints = group.points;
  const knockoutPoints = knockout.points + knockout.winnerPoints;
  return {
    total: groupPoints + knockoutPoints,
    groupPoints,
    knockoutPoints,
    breakdown: { group, knockout },
  };
}
