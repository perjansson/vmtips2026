import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandingsWithLive } from '../src/liveStandings.js';
import { emptyRounds } from '../src/sheetParse.js';

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

test('arket vinner: facit-resultat skrivs aldrig över av avslutad feed', () => {
  // Arket har redan Belgien–Iran 0–0; feed säger 2–1 (avslutad). Arket gäller.
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'finished', minute: null }];
  const { standings } = run(facit([0, 0]), live);
  const anna = standings.participants.find((p) => p.name === 'Anna');
  // pred 2–1 mot facit 0–0: fel utgång, 0p.
  assert.equal(anna.total, 0);
});
