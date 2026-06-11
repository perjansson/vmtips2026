import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGroupMatch, scoreRounds, scoreParticipant } from '../src/scoring.js';

const goals = (hg, ag) => ({ homeGoals: hg, awayGoals: ag });

test('exact score gives 5 (3 outcome + 1+1 exact goals)', () => {
  assert.equal(scoreGroupMatch(goals(2, 1), goals(2, 1)), 5);
});

test('correct outcome only gives 3', () => {
  assert.equal(scoreGroupMatch(goals(1, 0), goals(3, 2)), 3);
  assert.equal(scoreGroupMatch(goals(1, 1), goals(2, 2)), 3); // kryss
});

test('correct outcome plus one exact goal count gives 4', () => {
  assert.equal(scoreGroupMatch(goals(2, 0), goals(2, 1)), 4);
});

test('wrong outcome but one exact goal count gives 1', () => {
  assert.equal(scoreGroupMatch(goals(2, 1), goals(2, 2)), 1);
});

test('unplayed or untipped match is not scored (null, not 0)', () => {
  assert.equal(scoreGroupMatch(goals(2, 1), goals(null, null)), null);
  assert.equal(scoreGroupMatch(goals(null, null), goals(2, 1)), null);
  assert.equal(scoreGroupMatch(goals(2, null), goals(2, 1)), null);
});

const emptyRounds = { r32: [], r16: [], qf: [], sf: [], final: [], winner: null };

test('5 points per correct team per round, set-based and case-insensitive', () => {
  const pred = { ...emptyRounds, r32: ['Mexiko', 'Sverige', 'Japan'], qf: ['Spanien'] };
  const facit = { ...emptyRounds, r32: ['MEXIKO', 'Japan', 'Brasilien'], qf: ['Frankrike'] };
  const result = scoreRounds(pred, facit);
  assert.equal(result.rounds.r32.points, 10);
  assert.equal(result.rounds.r32.correct, 2);
  assert.equal(result.rounds.qf.points, 0);
  assert.equal(result.points, 10);
});

test('empty facit rounds give no points', () => {
  const pred = { ...emptyRounds, r32: ['Mexiko'], winner: 'Spanien' };
  const result = scoreRounds(pred, emptyRounds);
  assert.equal(result.points, 0);
  assert.equal(result.winnerPoints, 0);
});

test('correct winner gives 10', () => {
  const pred = { ...emptyRounds, winner: 'spanien' };
  const facit = { ...emptyRounds, winner: 'Spanien' };
  assert.equal(scoreRounds(pred, facit).winnerPoints, 10);
});

test('scoreParticipant aggregates group and knockout points', () => {
  const match = (home, away, hg, ag) => ({ group: 'A', home, away, homeGoals: hg, awayGoals: ag });
  const predictions = {
    matches: [match('X', 'Y', 2, 1), match('Y', 'Z', 0, 0)],
    rounds: { ...emptyRounds, r32: ['X', 'Y'], winner: 'X' },
  };
  const facit = {
    matches: [match('X', 'Y', 2, 1), match('Y', 'Z', null, null)],
    rounds: { ...emptyRounds, r32: ['X'], winner: 'X' },
  };
  const s = scoreParticipant(predictions, facit);
  assert.equal(s.groupPoints, 5);
  assert.equal(s.knockoutPoints, 5 + 10);
  assert.equal(s.total, 20);
  assert.equal(s.breakdown.group.scoredMatches, 1);
  assert.equal(s.breakdown.knockout.rounds.r32.correct, 1);
  assert.equal(s.breakdown.knockout.winnerPoints, 10);
});

test('scoreParticipant pairs matches by teams, not by index', () => {
  const match = (home, away, hg, ag) => ({ group: 'A', home, away, homeGoals: hg, awayGoals: ag });
  const predictions = {
    matches: [match('X', 'Y', 1, 0), match('Y', 'Z', 2, 2)],
    rounds: { ...emptyRounds },
  };
  const facit = {
    matches: [match('Y', 'Z', 2, 2), match('X', 'Y', 1, 0)],
    rounds: { ...emptyRounds },
  };
  assert.equal(scoreParticipant(predictions, facit).groupPoints, 10);
});
