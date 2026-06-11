import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAdvancement } from '../src/advancement.js';

// Fabricerar en grupptabell (redan rangordnad) med given trea.
function makeTable(group, third) {
  const row = (team, points, gd, gf) => ({ team, points, gd, gf });
  return [
    row(`Etta${group}`, 9, 6, 7),
    row(`Tvåa${group}`, 6, 2, 5),
    { team: `Trea${group}`, ...third },
    row(`Fyra${group}`, 0, -8, 1),
  ];
}

const GROUPS = 'ABCDEFGHIJKL'.split('');

function makeTables(thirdStats) {
  return GROUPS.map((g, i) => makeTable(g, thirdStats[i]));
}

test('top two per group plus eight best thirds qualify', () => {
  // Treor med fallande poäng 12..1 → treor A–H kvalar, I–L inte.
  const tables = makeTables(GROUPS.map((_, i) => ({ points: 12 - i, gd: 0, gf: 0 })));
  const { qualified, thirds } = computeAdvancement(tables);
  assert.equal(qualified.length, 32);
  assert.ok(qualified.includes('EttaA') && qualified.includes('TvåaL'));
  assert.ok(qualified.includes('TreaA') && qualified.includes('TreaH'));
  assert.ok(!qualified.includes('TreaI'));
  assert.equal(thirds.undecided, null);
});

test('thirds boundary tie separable by goals scored is decided', () => {
  const stats = GROUPS.map((_, i) => ({ points: 12 - i, gd: 0, gf: 0 }));
  stats[7] = { points: 4, gd: 1, gf: 3 }; // TreaH
  stats[8] = { points: 4, gd: 1, gf: 2 }; // TreaI – samma poäng & MS, färre mål
  const { qualified, thirds } = computeAdvancement(makeTables(stats));
  assert.ok(qualified.includes('TreaH'));
  assert.ok(!qualified.includes('TreaI'));
  assert.equal(thirds.undecided, null);
});

test('unseparable three-way tie across the 8th slot is marked undecided', () => {
  const stats = GROUPS.map((_, i) => ({ points: 12 - i, gd: 0, gf: 0 }));
  // Position 7, 8, 9 (TreaG, TreaH, TreaI) helt lika – 2 platser, 3 kandidater.
  stats[6] = { points: 4, gd: 1, gf: 3 };
  stats[7] = { points: 4, gd: 1, gf: 3 };
  stats[8] = { points: 4, gd: 1, gf: 3 };
  const { qualified, thirds } = computeAdvancement(makeTables(stats));
  assert.equal(qualified.length, 24 + 6); // 6 klara treor
  assert.ok(qualified.includes('TreaF'));
  assert.ok(!qualified.includes('TreaG'));
  assert.deepEqual(thirds.undecided.slots, 2);
  assert.deepEqual([...thirds.undecided.candidates].sort(), ['TreaG', 'TreaH', 'TreaI']);
});

test('tie entirely above the boundary does not block qualification', () => {
  const stats = GROUPS.map((_, i) => ({ points: 12 - i, gd: 0, gf: 0 }));
  stats[2] = { points: 9, gd: 2, gf: 2 };
  stats[3] = { points: 9, gd: 2, gf: 2 }; // lika, men båda klart topp 8
  const { qualified, thirds } = computeAdvancement(makeTables(stats));
  assert.ok(qualified.includes('TreaC') && qualified.includes('TreaD'));
  assert.equal(thirds.undecided, null);
});
