import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeam, teamKey, parseMatchString, parseGoals } from '../src/parse.js';

test('normalizeTeam trims and collapses whitespace incl NBSP', () => {
  assert.equal(normalizeTeam('  Bosnien och  Hercegovina '), 'Bosnien och Hercegovina');
});

test('teamKey is case-insensitive', () => {
  assert.equal(teamKey(' MEXIKO '), teamKey('Mexiko'));
  assert.notEqual(teamKey('Mexiko'), teamKey('Marocko'));
});

test('parseMatchString splits on hyphen with spaces', () => {
  assert.deepEqual(parseMatchString('Mexiko - Sydafrika'), { home: 'Mexiko', away: 'Sydafrika' });
});

test('parseMatchString tolerates en/em dash and NBSP', () => {
  assert.deepEqual(parseMatchString('Mexiko – Sydafrika'), { home: 'Mexiko', away: 'Sydafrika' });
  assert.deepEqual(parseMatchString('Mexiko — Sydafrika'), { home: 'Mexiko', away: 'Sydafrika' });
});

test('parseMatchString keeps hyphenated team names intact', () => {
  assert.deepEqual(parseMatchString('Guinea-Bissau - Sydafrika'), { home: 'Guinea-Bissau', away: 'Sydafrika' });
});

test('parseMatchString returns null when unparseable', () => {
  assert.equal(parseMatchString(''), null);
  assert.equal(parseMatchString('Bara ett lag'), null);
});

test('parseGoals parses integers and rejects junk', () => {
  assert.equal(parseGoals('2'), 2);
  assert.equal(parseGoals(' 0 '), 0);
  assert.equal(parseGoals(''), null);
  assert.equal(parseGoals('-'), null);
  assert.equal(parseGoals('abc'), null);
  assert.equal(parseGoals('1.5'), null);
});
