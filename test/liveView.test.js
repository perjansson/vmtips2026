import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveView } from '../src/liveView.js';

const confirmed = [
  { name: 'Per', total: 50, rank: 1 },
  { name: 'Krisse', total: 40, rank: 2 },
  { name: 'Åsa', total: 30, rank: 3 },
];

test('delta = provisorisk − bekräftad poäng per deltagare', () => {
  const provisional = [
    { name: 'Per', total: 50, rank: 2 },
    { name: 'Krisse', total: 53, rank: 1 },
    { name: 'Åsa', total: 30, rank: 3 },
  ];
  const view = buildLiveView(confirmed, provisional, []);
  assert.equal(view.byName.Krisse.delta, 13);
  assert.equal(view.byName.Per.delta, 0);
});

test('rankDelta är positiv när man klättrar provisoriskt', () => {
  const provisional = [
    { name: 'Krisse', total: 53, rank: 1 },
    { name: 'Per', total: 50, rank: 2 },
    { name: 'Åsa', total: 30, rank: 3 },
  ];
  const view = buildLiveView(confirmed, provisional, []);
  assert.equal(view.byName.Krisse.rankDelta, 1); // 2 → 1
  assert.equal(view.byName.Per.rankDelta, -1); // 1 → 2
  assert.equal(view.byName.Åsa.rankDelta, 0);
});

test('matches får en pair-nyckel och bär status/minut', () => {
  const live = [{ home: 'Belgien', away: 'Iran', homeGoals: 2, awayGoals: 1, status: 'live', minute: 67 }];
  const view = buildLiveView(confirmed, confirmed, live);
  assert.equal(view.matches.length, 1);
  assert.equal(view.matches[0].pair, 'belgien|iran');
  assert.equal(view.matches[0].status, 'live');
  assert.equal(view.matches[0].minute, 67);
  assert.equal(view.matches[0].homeGoals, 2);
});

test('tom live-snapshot ger inga matcher och nolldeltan', () => {
  const view = buildLiveView(confirmed, confirmed, []);
  assert.deepEqual(view.matches, []);
  assert.equal(view.byName.Per.delta, 0);
  assert.equal(view.byName.Per.rankDelta, 0);
});
