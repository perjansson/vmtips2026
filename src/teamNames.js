// Engelska lagnamn (med vanliga API-varianter) → svenska, så live-API:ets
// fixtures kan matchas mot arket/schemat som använder svenska namn. Listan
// täcker exakt de 48 lagen i public/schedule.js. Aliasen är gissningar för hur
// worldcup26/andra leverantörer kan stava namnen – verifiera mot riktiga svar.
const MAP = [
  ['Algeriet', ['Algeria']],
  ['Argentina', ['Argentina']],
  ['Australien', ['Australia']],
  ['Belgien', ['Belgium']],
  ['Bosnien och Hercegovina', ['Bosnia and Herzegovina', 'Bosnia & Herzegovina', 'Bosnia-Herzegovina', 'Bosnia']],
  ['Brasilien', ['Brazil']],
  ['Colombia', ['Colombia']],
  ['Curaçao', ['Curacao']],
  ['DR Kongo', ['DR Congo', 'Congo DR', 'Democratic Republic of the Congo', 'Congo Democratic Republic']],
  ['Ecuador', ['Ecuador']],
  ['Egypten', ['Egypt']],
  ['Elfenbenskusten', ["Côte d'Ivoire", 'Ivory Coast']],
  ['England', ['England']],
  ['Frankrike', ['France']],
  ['Ghana', ['Ghana']],
  ['Haiti', ['Haiti']],
  ['Irak', ['Iraq']],
  ['Iran', ['Iran', 'IR Iran']],
  ['Japan', ['Japan']],
  ['Jordanien', ['Jordan']],
  ['Kanada', ['Canada']],
  ['Kap Verde', ['Cape Verde', 'Cabo Verde']],
  ['Kroatien', ['Croatia']],
  ['Marocko', ['Morocco']],
  ['Mexiko', ['Mexico']],
  ['Nederländerna', ['Netherlands', 'Holland']],
  ['Norge', ['Norway']],
  ['Nya Zeeland', ['New Zealand']],
  ['Österrike', ['Austria']],
  ['Panama', ['Panama']],
  ['Paraguay', ['Paraguay']],
  ['Portugal', ['Portugal']],
  ['Qatar', ['Qatar']],
  ['Saudiarabien', ['Saudi Arabia']],
  ['Schweiz', ['Switzerland']],
  ['Senegal', ['Senegal']],
  ['Skottland', ['Scotland']],
  ['Spanien', ['Spain']],
  ['Sverige', ['Sweden']],
  ['Sydafrika', ['South Africa']],
  ['Sydkorea', ['South Korea', 'Korea Republic', 'Republic of Korea', 'Korea']],
  ['Tjeckien', ['Czechia', 'Czech Republic']],
  ['Tunisien', ['Tunisia']],
  ['Turkiet', ['Turkey', 'Türkiye']],
  ['Tyskland', ['Germany']],
  ['Uruguay', ['Uruguay']],
  ['USA', ['United States', 'United States of America']],
  ['Uzbekistan', ['Uzbekistan']],
];

// Normaliserar för uppslagning: NFD-fäller accenter, gemener, ihopslagna
// blanksteg, trimmat. Gör "Türkiye"→"turkiye", "Curaçao"→"curacao".
const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const lookup = new Map();
for (const [sv, aliases] of MAP) {
  lookup.set(fold(sv), sv); // svenska namnet matchar också sig självt
  for (const en of aliases) lookup.set(fold(en), sv);
}

// Alla svenska namn kartan kan producera – används av testet för täckning.
export const swedishTeams = MAP.map(([sv]) => sv);

// Engelskt (eller svenskt) lagnamn → svenskt standardnamn, eller null om okänt.
export function toSwedish(name) {
  const key = fold(name);
  if (!key) return null;
  return lookup.get(key) ?? null;
}
