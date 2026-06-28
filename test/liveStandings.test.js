import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandingsWithLive, captureSettled, captureSettledRounds } from '../src/liveStandings.js';
import { emptyRounds } from '../src/sheetParse.js';

// --- Slutspel: avslutade matcher väver vinnaren in i rondlistorna ------------

const koLive = (over) => ({
  home: 'Sverige', away: 'Frankrike', homeGoals: 2, awayGoals: 1,
  status: 'finished', type: 'r32', ...over,
});
const koRun = (predRounds, live) => computeStandingsWithLive({
  participants: ['Anna'],
  predictionsByName: new Map([['Anna', { matches: [], rounds: { ...emptyRounds(), ...predRounds } }]]),
  facit: { matches: [], rounds: emptyRounds() },
  live,
});

test('avslutad slutspelsmatch ger +5 till den som tippade vinnaren i nästa rond', () => {
  const { standings } = koRun({ r16: ['Sverige'] }, [koLive()]);
  assert.equal(standings.participants[0].total, 5);
});

test('final-vinst ger +10 till den som tippade VM-vinnaren', () => {
  const { standings } = koRun({ winner: 'Sverige' }, [koLive({ type: 'final' })]);
  assert.equal(standings.participants[0].total, 10);
});

test('pågående slutspelsmatch ger inga poäng (bara avslutade räknas)', () => {
  const { standings } = koRun({ r16: ['Sverige'] }, [koLive({ status: 'live' })]);
  assert.equal(standings.participants[0].total, 0);
  assert.equal(standings.participants[0].liveDelta ?? 0, 0);
});

test('oavgjord (straffar) slutspelsmatch ger inga poäng från feed', () => {
  const { standings } = koRun({ r16: ['Sverige'] }, [koLive({ homeGoals: 1, awayGoals: 1 })]);
  assert.equal(standings.participants[0].total, 0);
});

test('captureSettledRounds behåller bara avslutade slutspelsmatcher', () => {
  const sr = new Map();
  captureSettledRounds(sr, [
    koLive(), // avslutad r32 → behålls
    koLive({ status: 'live' }), // pågående → nej
    { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', type: 'group' }, // grupp → nej
  ]);
  assert.equal(sr.size, 1);
  assert.equal([...sr.values()][0].type, 'r32');
});

test('captureSettled behåller avslutade matcher, inte pågående', () => {
  const settled = new Map();
  captureSettled(settled, [
    { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', minute: null },
    { home: 'Spanien', away: 'Marocko', homeGoals: 1, awayGoals: 0, status: 'live', minute: 30 },
  ]);
  assert.equal(settled.size, 1);
  assert.deepEqual(settled.get('belgien|iran'), {
    home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', type: 'group',
  });
});

test('captureSettled persisterar över anrop (även när snapshot blir tomt)', () => {
  const settled = new Map();
  captureSettled(settled, [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished' }]);
  captureSettled(settled, []); // utanför fönster: tomt snapshot
  assert.equal(settled.size, 1, 'tidigare avslutat resultat finns kvar');
});

const facit = (a, b) => ({
  matches: [
    { group: 'A', date: '2026-06-21', home: 'Belgien', away: 'Iran', homeGoals: a?.[0] ?? null, awayGoals: a?.[1] ?? null },
    { group: 'B', date: '2026-06-21', home: 'Spanien', away: 'Marocko', homeGoals: b?.[0] ?? null, awayGoals: b?.[1] ?? null },
  ],
  rounds: emptyRounds(),
});

const participants = ['Anna'];
const predictionsByName = new Map([['Anna', {
  matches: [
    { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1 },
    { home: 'Spanien', away: 'Marocko', homeGoals: 1, awayGoals: 0 },
  ],
  rounds: emptyRounds(),
}]]);

const run = (facitObj, live) => computeStandingsWithLive({ participants, predictionsByName, facit: facitObj, live });

test('avslutad live-match räknas IN i bastotalen (settled), inte i live-delta', () => {
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', minute: null }];
  const { standings, liveView } = run(facit(), live);
  const anna = standings.participants.find((p) => p.name === 'Anna');
  assert.equal(anna.total, 5, 'exakt 2–1 ger 5p i totalen');
  assert.equal(liveView.byName.Anna?.delta ?? 0, 0, 'avslutad match ger ingen live-delta');
  assert.equal(liveView.matches.length, 0, 'avslutad match är inte ett live-överlägg');
});

test('pågående match är live-överlägg (delta + bricka), inte i bastotalen', () => {
  const live = [{ home: 'Spanien', away: 'Marocko', homeGoals: 1, awayGoals: 0, status: 'live', minute: 30 }];
  const { standings, liveView } = run(facit(), live);
  const anna = standings.participants.find((p) => p.name === 'Anna');
  assert.equal(anna.total, 0, 'pågående match ligger inte i bastotalen');
  assert.equal(liveView.byName.Anna.delta, 5, 'pågående match ger live-delta');
  assert.equal(liveView.matches.length, 1);
  assert.equal(liveView.matches[0].pair, 'spanien|marocko');
});

test('avslutad + pågående samtidigt: en settled, en live', () => {
  const live = [
    { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', minute: null },
    { home: 'Spanien', away: 'Marocko', homeGoals: 1, awayGoals: 0, status: 'live', minute: 30 },
  ];
  const { standings, liveView } = run(facit(), live);
  const anna = standings.participants.find((p) => p.name === 'Anna');
  assert.equal(anna.total, 5, 'avslutad i totalen');
  assert.equal(liveView.byName.Anna.delta, 5, 'pågående som delta');
  assert.equal(liveView.matches.length, 1, 'bara pågående visas som live');
});

test('placering rankas på live-inkluderad total (bastotal + live)', () => {
  // A leder på bastotal, men B går om via en pågående match.
  const facitObj = {
    matches: [
      { group: 'A', date: '2026-06-21', home: 'Belgien', away: 'Iran', homeGoals: 1, awayGoals: 0 },
      { group: 'B', date: '2026-06-21', home: 'Spanien', away: 'Marocko', homeGoals: null, awayGoals: null },
    ],
    rounds: emptyRounds(),
  };
  const preds = new Map([
    ['A', { matches: [
      { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 0 }, // mot 1–0: rätt utgång + borta exakt = 4p bas
      { home: 'Spanien', away: 'Marocko', homeGoals: 0, awayGoals: 1 }, // mot live 2–0: fel utgång = 0p live
    ], rounds: emptyRounds() }],
    ['B', { matches: [
      { home: 'Belgien', away: 'Iran', homeGoals: 0, awayGoals: 0 }, // mot 1–0: 0p bas
      { home: 'Spanien', away: 'Marocko', homeGoals: 2, awayGoals: 0 }, // mot live 2–0: exakt = 5p live
    ], rounds: emptyRounds() }],
  ]);
  const live = [{ home: 'Spanien', away: 'Marocko', homeGoals: 2, awayGoals: 0, status: 'live', minute: 30 }];
  const { standings } = computeStandingsWithLive({ participants: ['A', 'B'], predictionsByName: preds, facit: facitObj, live });
  // Bas: A=4, B=0. Live: A=4, B=5 → B etta.
  const byName = Object.fromEntries(standings.participants.map((p) => [p.name, p]));
  assert.equal(byName.B.rank, 1, 'B leder med live-poäng');
  assert.equal(byName.A.rank, 2);
  assert.equal(standings.participants[0].name, 'B', 'listan är ordnad på live-total');
});

test('arket vinner: facit-resultat skrivs aldrig över av avslutad feed', () => {
  // Arket har redan Belgien–Iran 0–0; feed säger 2–1 (avslutad). Arket gäller.
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', minute: null }];
  const { standings } = run(facit([0, 0]), live);
  const anna = standings.participants.find((p) => p.name === 'Anna');
  // pred 2–1 mot facit 0–0: fel utgång, 0p.
  assert.equal(anna.total, 0);
});
