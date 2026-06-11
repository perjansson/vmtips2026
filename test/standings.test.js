import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings } from '../src/standings.js';

const emptyRounds = { r32: [], r16: [], qf: [], sf: [], final: [], winner: null };
const match = (home, away, hg, ag) => ({ group: 'A', home, away, homeGoals: hg, awayGoals: ag });

const facit = {
  matches: [match('X', 'Y', 2, 1), match('Y', 'Z', null, null)],
  rounds: { ...emptyRounds, winner: 'X' },
};

test('ranks participants by total, ties share rank, then name order', () => {
  const predictionsByName = new Map([
    ['Beata', { matches: [match('X', 'Y', 2, 1)], rounds: { ...emptyRounds } }], // 5 p
    ['Adam', { matches: [match('X', 'Y', 1, 0)], rounds: { ...emptyRounds } }], // 3 p
    ['Cesar', { matches: [match('X', 'Y', 3, 2)], rounds: { ...emptyRounds } }], // 3 p
  ]);
  const standings = computeStandings({
    participants: ['Adam', 'Beata', 'Cesar'],
    predictionsByName,
    facit,
  });
  assert.deepEqual(
    standings.participants.map((p) => [p.rank, p.name, p.total]),
    [[1, 'Beata', 5], [2, 'Adam', 3], [2, 'Cesar', 3]],
  );
});

test('participant without a readable tab gets zero points and a flag', () => {
  const standings = computeStandings({
    participants: ['Adam'],
    predictionsByName: new Map(),
    facit,
  });
  assert.deepEqual(
    [standings.participants[0].total, standings.participants[0].missingTab],
    [0, true],
  );
});

test('exposes facit meta: played matches and winner', () => {
  const standings = computeStandings({ participants: [], predictionsByName: new Map(), facit });
  assert.equal(standings.facit.playedMatches, 1);
  assert.equal(standings.facit.totalMatches, 2);
  assert.equal(standings.facit.winner, 'X');
});
