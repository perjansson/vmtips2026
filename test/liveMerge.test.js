import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveIntoFacit } from '../src/liveMerge.js';

const facit = () => ({
  matches: [
    // Spelad i arket (bekräftad)
    { group: 'A', date: '2026-06-15', home: 'Belgien', away: 'Egypten', homeGoals: 1, awayGoals: 1 },
    // Ospelad i arket (tom) – kandidat för live
    { group: 'A', date: '2026-06-21', home: 'Belgien', away: 'Iran', homeGoals: null, awayGoals: null },
    // Ospelad, ingen live-data
    { group: 'B', date: '2026-06-22', home: 'Spanien', away: 'Marocko', homeGoals: null, awayGoals: null },
  ],
  rounds: { winner: null },
});

test('fyller i tom match från live-snapshot (matchad på lagnamn)', () => {
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'live', minute: 67 }];
  const merged = mergeLiveIntoFacit(facit(), live);
  const m = merged.matches.find((x) => x.home === 'Belgien' && x.away === 'Iran');
  assert.equal(m.homeGoals, 2);
  assert.equal(m.awayGoals, 1);
});

test('arket vinner: en redan spelad match skrivs aldrig över av live', () => {
  const live = [{ home: 'Belgien', away: 'Egypten', homeGoals: 5, awayGoals: 0, status: 'live', minute: 80 }];
  const merged = mergeLiveIntoFacit(facit(), live);
  const m = merged.matches.find((x) => x.home === 'Belgien' && x.away === 'Egypten');
  assert.equal(m.homeGoals, 1);
  assert.equal(m.awayGoals, 1);
});

test('matcher utan live-data lämnas orörda', () => {
  const merged = mergeLiveIntoFacit(facit(), []);
  const m = merged.matches.find((x) => x.home === 'Spanien');
  assert.equal(m.homeGoals, null);
  assert.equal(m.awayGoals, null);
});

test('muterar inte indata-facit', () => {
  const original = facit();
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'live', minute: 67 }];
  mergeLiveIntoFacit(original, live);
  const m = original.matches.find((x) => x.home === 'Belgien' && x.away === 'Iran');
  assert.equal(m.homeGoals, null, 'originalet ska vara oförändrat');
});

test('ignorerar live-poster med ofullständiga mål (ej startad match)', () => {
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: null, awayGoals: null, status: 'live', minute: 0 }];
  const merged = mergeLiveIntoFacit(facit(), live);
  const m = merged.matches.find((x) => x.home === 'Belgien' && x.away === 'Iran');
  assert.equal(m.homeGoals, null);
});
