import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickoffMs, isInLiveWindow, shouldPollLive, LIVE_WINDOW_MS } from '../src/liveWindow.js';

// Schemats tider är svensk tid (CEST, UTC+2) under hela turneringen. Fönstret
// måste bli rätt oavsett serverns tidszon – Render kör UTC, utvecklarens Mac
// CEST. Avspark 19:00 svensk tid = 17:00 UTC.

test('kickoffMs tolkar tiden som svensk (+02:00), inte serverns TZ', () => {
  assert.equal(kickoffMs('2026-06-23 19:00'), Date.parse('2026-06-23T17:00:00Z'));
});

test('i fönster 21 min efter avspark (regressionsfallet: 17:21 UTC)', () => {
  assert.equal(isInLiveWindow('2026-06-23 19:00', Date.parse('2026-06-23T17:21:00Z')), true);
});

test('i fönster ~3 h efter avspark: slutspel med förlängning+straffar', () => {
  // Avspark 17:00 UTC; en straffavgjord match kan sluta ~3 h efter avspark.
  // Fönstret måste täcka det så FT fångas i matchens eget fönster (2.25 h
  // stängde för tidigt och missade straffavgjorda slutspel).
  assert.equal(isInLiveWindow('2026-06-23 19:00', Date.parse('2026-06-23T20:00:00Z')), true);
});

test('inte i fönster före avspark', () => {
  assert.equal(isInLiveWindow('2026-06-23 19:00', Date.parse('2026-06-23T16:30:00Z')), false);
});

test('inte i fönster efter att fönstret (2.25 h) stängt', () => {
  const past = Date.parse('2026-06-23T17:00:00Z') + LIVE_WINDOW_MS + 60_000;
  assert.equal(isInLiveWindow('2026-06-23 19:00', past), false);
});

test('exakt vid avspark räknas som i fönster', () => {
  assert.equal(isInLiveWindow('2026-06-23 19:00', Date.parse('2026-06-23T17:00:00Z')), true);
});

// Catch-up: utanför fönster pollar vi ändå i låg takt, så slutresultat som
// landar efter fönstret (eller efter en omstart) fångas utan att feeden pollas
// konstant. Vid uppstart (ej seedat) pollar vi alltid.
test('shouldPollLive: ej seedat (uppstart) → polla alltid', () => {
  assert.equal(shouldPollLive({ seeded: false, inWindow: false, now: 1e6, lastPollMs: 999_000, catchupMs: 600_000 }), true);
});

test('shouldPollLive: i fönster → polla', () => {
  assert.equal(shouldPollLive({ seeded: true, inWindow: true, now: 1e6, lastPollMs: 999_000, catchupMs: 600_000 }), true);
});

test('shouldPollLive: utanför fönster, nyligen pollat → hoppa', () => {
  assert.equal(shouldPollLive({ seeded: true, inWindow: false, now: 1e6, lastPollMs: 700_000, catchupMs: 600_000 }), false);
});

test('shouldPollLive: utanför fönster, catch-up förfallen → polla', () => {
  assert.equal(shouldPollLive({ seeded: true, inWindow: false, now: 1_400_000, lastPollMs: 700_000, catchupMs: 600_000 }), true);
});
