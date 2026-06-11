import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGroupTable } from '../src/groupTable.js';

const m = (home, away, hg, ag) => ({ group: 'A', home, away, homeGoals: hg, awayGoals: ag });

test('computes stats and ranks by points', () => {
  // Verklig fixtur: Pers Grupp A-tips; arkets egen tabell ger
  // Mexiko 7, Tjeckien 5, Sydkorea 4, Sydafrika 0.
  const table = computeGroupTable([
    m('Mexiko', 'Sydafrika', 2, 0),
    m('Sydkorea', 'Tjeckien', 1, 1),
    m('Tjeckien', 'Sydafrika', 2, 0),
    m('Mexiko', 'Sydkorea', 2, 1),
    m('Tjeckien', 'Mexiko', 1, 1),
    m('Sydafrika', 'Sydkorea', 0, 2),
  ]);
  assert.deepEqual(table.map((r) => [r.team, r.points]), [
    ['Mexiko', 7], ['Tjeckien', 5], ['Sydkorea', 4], ['Sydafrika', 0],
  ]);
  const mexiko = table[0];
  assert.deepEqual(
    { played: mexiko.played, won: mexiko.won, drawn: mexiko.drawn, lost: mexiko.lost, gf: mexiko.gf, ga: mexiko.ga, gd: mexiko.gd },
    { played: 3, won: 2, drawn: 1, lost: 0, gf: 5, ga: 2, gd: 3 },
  );
});

test('ignores unplayed matches but keeps all teams in table', () => {
  const table = computeGroupTable([
    m('A', 'B', 1, 0),
    m('C', 'D', null, null),
  ]);
  assert.equal(table.length, 4);
  assert.equal(table.find((r) => r.team === 'C').played, 0);
});

test('head-to-head beats total goal difference for teams tied on points', () => {
  // B slog A inbördes, men A har klart bättre total målskillnad via D.
  const table = computeGroupTable([
    m('A', 'B', 0, 1),
    m('A', 'D', 5, 0),
    m('B', 'D', 0, 1),
    m('A', 'C', 0, 1),
    m('B', 'C', 0, 1),
    m('C', 'D', 0, 1),
  ]);
  // A och B har båda 3 p; B vann mötet → B före A trots sämre total MS.
  const order = table.map((r) => r.team);
  assert.ok(order.indexOf('B') < order.indexOf('A'), `förväntade B före A: ${order}`);
});

test('circular three-way head-to-head tie falls through to total goal difference', () => {
  // A>B, B>C, C>A alla 1-0 → inbördes helt lika. Totalen skiljs via D.
  const table = computeGroupTable([
    m('A', 'B', 1, 0),
    m('B', 'C', 1, 0),
    m('C', 'A', 1, 0),
    m('A', 'D', 3, 0),
    m('B', 'D', 2, 0),
    m('C', 'D', 1, 0),
  ]);
  assert.deepEqual(table.map((r) => r.team), ['A', 'B', 'C', 'D']);
});

test('falls back to Swedish alphabetical order as stable last resort', () => {
  const table = computeGroupTable([
    m('Österrike', 'Albanien', 0, 0),
    m('Österrike', 'Zambia', 0, 0),
    m('Albanien', 'Zambia', 0, 0),
  ]);
  assert.deepEqual(table.map((r) => r.team), ['Albanien', 'Zambia', 'Österrike']);
});
