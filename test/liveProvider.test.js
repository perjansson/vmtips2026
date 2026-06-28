import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMockConfig, normalizeWorldcupGames } from '../src/liveProvider.js';

// --- Mock-konfig (LIVE_MOCK) -------------------------------------------------

test('parseMockConfig: en pågående match med minut', () => {
  const snap = parseMockConfig('Belgien|Iran 2-1 67');
  assert.deepEqual(snap, [
    { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'live', minute: 67, type: 'group' },
  ]);
});

test('parseMockConfig: valfri typ på slutet (slutspelsmatch)', () => {
  const snap = parseMockConfig('Sverige|Frankrike 2-1 FT r32');
  assert.equal(snap[0].type, 'r32');
  assert.equal(snap[0].status, 'finished');
  assert.equal(snap[0].home, 'Sverige');
  assert.equal(snap[0].away, 'Frankrike');
});

test('parseMockConfig: lagnamn med blanksteg', () => {
  const snap = parseMockConfig('Nya Zeeland|Bosnien och Hercegovina 0-3 45');
  assert.equal(snap[0].home, 'Nya Zeeland');
  assert.equal(snap[0].away, 'Bosnien och Hercegovina');
  assert.equal(snap[0].awayGoals, 3);
});

test('parseMockConfig: FT markerar slutspelad utan minut', () => {
  const snap = parseMockConfig('Spanien|Marocko 1-0 FT');
  assert.equal(snap[0].status, 'finished');
  assert.equal(snap[0].minute, null);
});

test('parseMockConfig: flera matcher separerade med semikolon', () => {
  const snap = parseMockConfig('Belgien|Iran 2-1 67; Spanien|Marocko 0-0 12');
  assert.equal(snap.length, 2);
});

test('parseMockConfig: tomt eller skräp ger tom lista', () => {
  assert.deepEqual(parseMockConfig(''), []);
  assert.deepEqual(parseMockConfig(undefined), []);
  assert.deepEqual(parseMockConfig('inget vettigt här'), []);
});

// --- worldcup26-normalisering ------------------------------------------------

const game = (over) => ({
  home_team_name_en: 'Belgium', away_team_name_en: 'Iran',
  home_score: '2', away_score: '1', finished: 'FALSE', time_elapsed: '67',
  ...over,
});

test('normalizeWorldcupGames: pågående match → svenska namn + minut', () => {
  const snap = normalizeWorldcupGames([game()]);
  assert.deepEqual(snap, [
    { home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'live', minute: 67, type: 'group' },
  ]);
});

test('normalizeWorldcupGames: bär med matchens typ (slutspel)', () => {
  const snap = normalizeWorldcupGames([game({ type: 'r32', home_team_name_en: 'Sweden', away_team_name_en: 'France' })]);
  assert.equal(snap[0].type, 'r32');
  assert.equal(snap[0].home, 'Sverige');
});

test('normalizeWorldcupGames: ej startad match hoppas över', () => {
  const snap = normalizeWorldcupGames([game({ time_elapsed: 'notstarted' })]);
  assert.deepEqual(snap, []);
});

test('normalizeWorldcupGames: slutspelad match → status finished', () => {
  const snap = normalizeWorldcupGames([game({ finished: 'TRUE', time_elapsed: '90' })]);
  assert.equal(snap[0].status, 'finished');
});

test('normalizeWorldcupGames: okänt lag hoppas över (ingen gissning)', () => {
  const snap = normalizeWorldcupGames([game({ home_team_name_en: 'Atlantis' })]);
  assert.deepEqual(snap, []);
});
