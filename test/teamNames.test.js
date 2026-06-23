import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSwedish, swedishTeams } from '../src/teamNames.js';

// Alla 48 svenska lagnamn som förekommer i gruppspelet (public/schedule.js).
// Live-API:t levererar engelska namn; varje fixture måste kunna mappas tillbaka
// till exakt dessa, annars tappas matchen i matchningen mot arket.
const SWEDISH_TEAMS = [
  'Algeriet', 'Argentina', 'Australien', 'Belgien', 'Bosnien och Hercegovina',
  'Brasilien', 'Colombia', 'Curaçao', 'DR Kongo', 'Ecuador', 'Egypten',
  'Elfenbenskusten', 'England', 'Frankrike', 'Ghana', 'Haiti', 'Irak', 'Iran',
  'Japan', 'Jordanien', 'Kanada', 'Kap Verde', 'Kroatien', 'Marocko', 'Mexiko',
  'Nederländerna', 'Norge', 'Nya Zeeland', 'Österrike', 'Panama', 'Paraguay',
  'Portugal', 'Qatar', 'Saudiarabien', 'Schweiz', 'Senegal', 'Skottland',
  'Spanien', 'Sverige', 'Sydafrika', 'Sydkorea', 'Tjeckien', 'Tunisien',
  'Turkiet', 'Tyskland', 'Uruguay', 'USA', 'Uzbekistan',
];

test('mappar engelska standardnamn till svenska', () => {
  assert.equal(toSwedish('Mexico'), 'Mexiko');
  assert.equal(toSwedish('South Africa'), 'Sydafrika');
  assert.equal(toSwedish('Germany'), 'Tyskland');
  assert.equal(toSwedish('Netherlands'), 'Nederländerna');
});

test('tål skiftläge och kringliggande blanksteg', () => {
  assert.equal(toSwedish('  belgium '), 'Belgien');
  assert.equal(toSwedish('IRAN'), 'Iran');
});

test('hanterar vanliga API-aliasvarianter', () => {
  assert.equal(toSwedish('Korea Republic'), 'Sydkorea');
  assert.equal(toSwedish('United States'), 'USA');
  assert.equal(toSwedish('Czech Republic'), 'Tjeckien');
  assert.equal(toSwedish('Türkiye'), 'Turkiet');
  assert.equal(toSwedish("Côte d'Ivoire"), 'Elfenbenskusten');
});

test('okänt lag ger null (matchen hoppas hellre över än gissas)', () => {
  assert.equal(toSwedish('Atlantis'), null);
  assert.equal(toSwedish(''), null);
  assert.equal(toSwedish(null), null);
});

test('kartan täcker alla 48 gruppspelslag', () => {
  // Varje svenskt namn i schemat måste vara ett målvärde i kartan – annars
  // finns en live-fixture vi inte kan matcha mot arket.
  const covered = new Set(swedishTeams);
  const missing = SWEDISH_TEAMS.filter((sv) => !covered.has(sv));
  assert.deepEqual(missing, [], `Saknade lag i kartan: ${missing.join(', ')}`);
});
