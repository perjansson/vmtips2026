import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings } from '../src/standings.js';

const emptyRounds = { r32: [], r16: [], qf: [], sf: [], final: [], winner: null };
const match = (home, away, hg, ag, date = '2026-06-11') => (
  { group: 'A', date, home, away, homeGoals: hg, awayGoals: ag }
);

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

test('gives each participant the 5 most recent and 5 next matches with their tips', () => {
  // 7 spelade (datum 1–7 juni) + 7 ospelade (10–16 juni), blandad radordning.
  const played = [1, 2, 3, 4, 5, 6, 7].map(
    (d) => match(`H${d}`, `B${d}`, 1, 0, `2026-06-0${d}`),
  );
  const upcoming = [16, 15, 14, 13, 12, 11, 10].map(
    (d) => match(`H${d}`, `B${d}`, null, null, `2026-06-${d}`),
  );
  const facitMixed = { matches: [...upcoming, ...played], rounds: emptyRounds };
  const predictionsByName = new Map([
    ['Adam', {
      matches: [match('H7', 'B7', 1, 0, '2026-06-07'), match('H10', 'B10', 2, 2, '2026-06-10')],
      rounds: { ...emptyRounds },
    }],
  ]);
  const standings = computeStandings({ participants: ['Adam'], predictionsByName, facit: facitMixed });
  const adam = standings.participants[0];

  // Senaste 5: nyast först (7 juni → 3 juni).
  assert.deepEqual(adam.matches.recent.map((m) => m.date),
    ['2026-06-07', '2026-06-06', '2026-06-05', '2026-06-04', '2026-06-03']);
  // Kommande 5: i datumordning (10 juni → 14 juni) trots blandad radordning.
  assert.deepEqual(adam.matches.upcoming.map((m) => m.date),
    ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14']);

  const recent7 = adam.matches.recent[0];
  assert.deepEqual(
    [recent7.home, recent7.homeGoals, recent7.awayGoals, recent7.tipHome, recent7.tipAway, recent7.points],
    ['H7', 1, 0, 1, 0, 5],
  );
  // Otippad spelad match: tips och poäng saknas.
  assert.deepEqual(
    [adam.matches.recent[1].tipHome, adam.matches.recent[1].points],
    [null, null],
  );
  // Kommande match med tips men utan resultat.
  const next10 = adam.matches.upcoming[0];
  assert.deepEqual(
    [next10.homeGoals, next10.tipHome, next10.tipAway, next10.points],
    [null, 2, 2, null],
  );
});

test('exposes facit meta: played matches and winner', () => {
  const standings = computeStandings({ participants: [], predictionsByName: new Map(), facit });
  assert.equal(standings.facit.playedMatches, 1);
  assert.equal(standings.facit.totalMatches, 2);
  assert.equal(standings.facit.winner, 'X');
});
