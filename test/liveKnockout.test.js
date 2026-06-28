import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveKnockout, isKnockoutType, KO_NEXT_ROUND } from '../src/liveKnockout.js';
import { emptyRounds } from '../src/sheetParse.js';

const m = (over) => ({
  home: 'Sverige', away: 'Frankrike', homeGoals: 2, awayGoals: 1,
  status: 'finished', type: 'r32', ...over,
});

test('isKnockoutType skiljer slutspel från gruppspel', () => {
  assert.equal(isKnockoutType('r32'), true);
  assert.equal(isKnockoutType('final'), true);
  assert.equal(isKnockoutType('third'), true);
  assert.equal(isKnockoutType('group'), false);
  assert.equal(isKnockoutType(undefined), false);
  assert.equal(KO_NEXT_ROUND.r32, 'r16');
});

test('avslutad r32-match: vinnaren läggs i r16', () => {
  assert.deepEqual(applyLiveKnockout(emptyRounds(), [m()]).r16, ['Sverige']);
});

test('bortavinst lägger bortalaget i r16', () => {
  assert.deepEqual(applyLiveKnockout(emptyRounds(), [m({ homeGoals: 0, awayGoals: 3 })]).r16, ['Frankrike']);
});

test('oavgjort (straffar) avgörs inte från feed → inget läggs till', () => {
  assert.deepEqual(applyLiveKnockout(emptyRounds(), [m({ homeGoals: 1, awayGoals: 1 })]).r16, []);
});

test('final-vinnare sätter VM-vinnaren (10p-ronden)', () => {
  assert.equal(applyLiveKnockout(emptyRounds(), [m({ type: 'final' })]).winner, 'Sverige');
});

test('bronsmatch (third) ger inga poäng', () => {
  const r = applyLiveKnockout(emptyRounds(), [m({ type: 'third' })]);
  assert.deepEqual(r.r16, []);
  assert.equal(r.winner, null);
});

test('bara avslutade matcher räknas (pågående hoppas över)', () => {
  assert.deepEqual(applyLiveKnockout(emptyRounds(), [m({ status: 'live' })]).r16, []);
});

test('arket vinner per match: om arket redan har något av lagen i r16, läggs inget till', () => {
  const rounds = { ...emptyRounds(), r16: ['Frankrike'] }; // arket har avgjort matchen
  assert.deepEqual(applyLiveKnockout(rounds, [m()]).r16, ['Frankrike']); // feed (Sverige) ignoreras
});

test('arket har redan satt VM-vinnare → final-feed override:ar inte', () => {
  const rounds = { ...emptyRounds(), winner: 'Frankrike' };
  assert.equal(applyLiveKnockout(rounds, [m({ type: 'final' })]).winner, 'Frankrike');
});

test('flera matcher till samma rond ackumuleras', () => {
  const ko = [m(), m({ home: 'Spanien', away: 'Italien', homeGoals: 0, awayGoals: 2 })];
  assert.deepEqual(applyLiveKnockout(emptyRounds(), ko).r16, ['Sverige', 'Italien']);
});

test('muterar inte indata-rounds', () => {
  const rounds = emptyRounds();
  applyLiveKnockout(rounds, [m()]);
  assert.deepEqual(rounds.r16, []);
});
