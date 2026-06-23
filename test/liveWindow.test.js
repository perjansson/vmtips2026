import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickoffMs, isInLiveWindow, LIVE_WINDOW_MS } from '../src/liveWindow.js';

// Schemats tider är svensk tid (CEST, UTC+2) under hela turneringen. Fönstret
// måste bli rätt oavsett serverns tidszon – Render kör UTC, utvecklarens Mac
// CEST. Avspark 19:00 svensk tid = 17:00 UTC.

test('kickoffMs tolkar tiden som svensk (+02:00), inte serverns TZ', () => {
  assert.equal(kickoffMs('2026-06-23 19:00'), Date.parse('2026-06-23T17:00:00Z'));
});

test('i fönster 21 min efter avspark (regressionsfallet: 17:21 UTC)', () => {
  assert.equal(isInLiveWindow('2026-06-23 19:00', Date.parse('2026-06-23T17:21:00Z')), true);
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
