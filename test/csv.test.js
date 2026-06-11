import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';

test('parses simple rows', () => {
  assert.deepEqual(parseCsv('a,b,c\nd,e,f'), [['a', 'b', 'c'], ['d', 'e', 'f']]);
});

test('parses quoted fields with commas', () => {
  assert.deepEqual(parseCsv('"a,b",c'), [['a,b', 'c']]);
});

test('parses escaped quotes inside quoted fields', () => {
  assert.deepEqual(parseCsv('"sa ""citat"" här",x'), [['sa "citat" här', 'x']]);
});

test('handles CRLF and trailing newline', () => {
  assert.deepEqual(parseCsv('a,b\r\nc,d\n'), [['a', 'b'], ['c', 'd']]);
});

test('handles empty fields', () => {
  assert.deepEqual(parseCsv('"","x",""'), [['', 'x', '']]);
});

test('empty input gives no rows', () => {
  assert.deepEqual(parseCsv(''), []);
});

test('newline inside quoted field stays in field', () => {
  assert.deepEqual(parseCsv('"rad1\nrad2",x'), [['rad1\nrad2', 'x']]);
});
