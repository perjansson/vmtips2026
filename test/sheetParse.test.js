import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMatchRows, parseKnockoutRows, parseParticipants } from '../src/sheetParse.js';

// Bygger 72 matchrader som de överlever gviz-exporten av A1:E96
// (grupprubriker och tomrader är redan borttappade av gviz).
function makeMatchRows() {
  const rows = [];
  for (let g = 0; g < 12; g++) {
    for (let m = 0; m < 6; m++) {
      rows.push(['2026-06-11', `Lag${g}${m}A - Lag${g}${m}B`, m === 0 ? '2' : '', '-', m === 0 ? '1' : '']);
    }
  }
  return rows;
}

test('parseMatchRows yields 72 matches with group by block index', () => {
  const matches = parseMatchRows(makeMatchRows());
  assert.equal(matches.length, 72);
  assert.equal(matches[0].group, 'A');
  assert.equal(matches[6].group, 'B');
  assert.equal(matches[71].group, 'L');
  assert.deepEqual(matches[0], {
    group: 'A', home: 'Lag00A', away: 'Lag00B', homeGoals: 2, awayGoals: 1,
  });
  assert.equal(matches[1].homeGoals, null);
  assert.equal(matches[1].awayGoals, null);
});

test('parseMatchRows throws on unexpected row count', () => {
  assert.throws(() => parseMatchRows(makeMatchRows().slice(0, 70)), /72/);
});

test('parseKnockoutRows splits sections on column A labels', () => {
  const rows = [
    ['16-delsfinal lag', 'Mexiko'],
    ['', 'Tjeckien'],
    ['', 'Sverige'],
    ['Åttondelsfinal lag', 'Spanien'],
    ['', 'Frankrike'],
    ['Kvartsfinal lag', 'Spanien'],
    ['Semifinal lag', 'Spanien'],
    ['Final lag', 'Spanien'],
    ['', 'Frankrike'],
    ['VM-vinnare', 'Spanien'],
  ];
  const rounds = parseKnockoutRows(rows);
  assert.deepEqual(rounds.r32, ['Mexiko', 'Tjeckien', 'Sverige']);
  assert.deepEqual(rounds.r16, ['Spanien', 'Frankrike']);
  assert.deepEqual(rounds.qf, ['Spanien']);
  assert.deepEqual(rounds.sf, ['Spanien']);
  assert.deepEqual(rounds.final, ['Spanien', 'Frankrike']);
  assert.equal(rounds.winner, 'Spanien');
});

test('parseKnockoutRows handles empty facit (no teams filled in)', () => {
  const rounds = parseKnockoutRows([]);
  assert.deepEqual(rounds.r32, []);
  assert.deepEqual(rounds.final, []);
  assert.equal(rounds.winner, null);
});

test('parseKnockoutRows ignores empty team cells and normalizes names', () => {
  const rounds = parseKnockoutRows([
    ['16-delsfinal lag', ''],
    ['', '  Bosnien och  Hercegovina '],
  ]);
  assert.deepEqual(rounds.r32, ['Bosnien och Hercegovina']);
});

test('parseParticipants reads names from column A, skipping blanks', () => {
  assert.deepEqual(
    parseParticipants([['Tomas'], ['Åsa'], [''], ['Per ']]),
    ['Tomas', 'Åsa', 'Per'],
  );
});
