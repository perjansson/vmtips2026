// Statiskt matchschema för VM 2026 i kronologisk ordning, grupperat per dag
// (svensk tidszon) precis som det redovisades. Kalkylarket saknar tidsstämplar,
// så DETTA är källan för ordning, avsparkstider, TV-kanal och vilken dag som
// täcks av Pers respektive Tomas TV4 Play-abonnemang.
//
// Resultat (poäng) kommer fortfarande live från arket via /api/standings och
// matchas mot gruppmatcherna nedan på lagnamn. Slutspelsrader är platshållare
// (title i stället för home/away) och får inget resultat förrän lagen är klara.
//
// Fält per dag: date (ISO), label, tv4 ('Per' | 'Tomas' | null = endast SVT).
// Fält per match: time ('HH:MM'), ch ('TV4' | 'SVT'), och antingen
// {home, away} (gruppmatch), {home, away, ko: '<rond>'} (slutspelsmatch med
// kända lag; ko är rondtypen 'r32'|'r16'|'qf'|'sf'|'final' så klienten vet
// nästa rond – räknas inte som gruppmatch) eller {title, note?} (platshållare).

window.SCHEDULE = [
  { date: '2026-06-11', label: 'Tor 11 juni', tv4: 'Per', games: [
    { time: '21:00', home: 'Mexiko', away: 'Sydafrika', ch: 'TV4' },
  ] },
  { date: '2026-06-12', label: 'Fre 12 juni', tv4: 'Per', games: [
    { time: '04:00', home: 'Sydkorea', away: 'Tjeckien', ch: 'TV4' },
    { time: '21:00', home: 'Kanada', away: 'Bosnien och Hercegovina', ch: 'SVT' },
  ] },
  { date: '2026-06-13', label: 'Lör 13 juni', tv4: 'Tomas', games: [
    { time: '03:00', home: 'USA', away: 'Paraguay', ch: 'TV4' },
    { time: '21:00', home: 'Qatar', away: 'Schweiz', ch: 'TV4' },
  ] },
  { date: '2026-06-14', label: 'Sön 14 juni', tv4: 'Tomas', games: [
    { time: '00:00', home: 'Brasilien', away: 'Marocko', ch: 'SVT' },
    { time: '03:00', home: 'Haiti', away: 'Skottland', ch: 'SVT' },
    { time: '06:00', home: 'Australien', away: 'Turkiet', ch: 'TV4' },
    { time: '19:00', home: 'Tyskland', away: 'Curaçao', ch: 'TV4' },
    { time: '22:00', home: 'Nederländerna', away: 'Japan', ch: 'TV4' },
  ] },
  { date: '2026-06-15', label: 'Mån 15 juni', tv4: 'Per', games: [
    { time: '01:00', home: 'Elfenbenskusten', away: 'Ecuador', ch: 'TV4' },
    { time: '04:00', home: 'Sverige', away: 'Tunisien', ch: 'SVT' },
    { time: '18:00', home: 'Spanien', away: 'Kap Verde', ch: 'SVT' },
    { time: '21:00', home: 'Belgien', away: 'Egypten', ch: 'SVT' },
  ] },
  { date: '2026-06-16', label: 'Tis 16 juni', tv4: 'Per', games: [
    { time: '00:00', home: 'Saudiarabien', away: 'Uruguay', ch: 'TV4' },
    { time: '03:00', home: 'Iran', away: 'Nya Zeeland', ch: 'TV4' },
    { time: '21:00', home: 'Frankrike', away: 'Senegal', ch: 'SVT' },
  ] },
  { date: '2026-06-17', label: 'Ons 17 juni', tv4: 'Tomas', games: [
    { time: '00:00', home: 'Irak', away: 'Norge', ch: 'TV4' },
    { time: '03:00', home: 'Argentina', away: 'Algeriet', ch: 'TV4' },
    { time: '06:00', home: 'Österrike', away: 'Jordanien', ch: 'TV4' },
    { time: '19:00', home: 'Portugal', away: 'DR Kongo', ch: 'TV4' },
    { time: '22:00', home: 'England', away: 'Kroatien', ch: 'TV4' },
  ] },
  { date: '2026-06-18', label: 'Tor 18 juni', tv4: 'Tomas', games: [
    { time: '01:00', home: 'Ghana', away: 'Panama', ch: 'TV4' },
    { time: '04:00', home: 'Uzbekistan', away: 'Colombia', ch: 'TV4' },
    { time: '18:00', home: 'Tjeckien', away: 'Sydafrika', ch: 'TV4' },
    { time: '21:00', home: 'Schweiz', away: 'Bosnien och Hercegovina', ch: 'TV4' },
  ] },
  { date: '2026-06-19', label: 'Fre 19 juni', tv4: 'Per', games: [
    { time: '00:00', home: 'Kanada', away: 'Qatar', ch: 'TV4' },
    { time: '03:00', home: 'Mexiko', away: 'Sydkorea', ch: 'TV4' },
    { time: '21:00', home: 'USA', away: 'Australien', ch: 'SVT' },
  ] },
  { date: '2026-06-20', label: 'Lör 20 juni', tv4: 'Per', games: [
    { time: '00:00', home: 'Skottland', away: 'Marocko', ch: 'SVT' },
    { time: '03:00', home: 'Brasilien', away: 'Haiti', ch: 'TV4' },
    { time: '06:00', home: 'Turkiet', away: 'Paraguay', ch: 'TV4' },
    { time: '19:00', home: 'Nederländerna', away: 'Sverige', ch: 'TV4' },
    { time: '22:00', home: 'Tyskland', away: 'Elfenbenskusten', ch: 'TV4' },
  ] },
  { date: '2026-06-21', label: 'Sön 21 juni', tv4: 'Tomas', games: [
    { time: '02:00', home: 'Ecuador', away: 'Curaçao', ch: 'TV4' },
    { time: '06:00', home: 'Tunisien', away: 'Japan', ch: 'SVT' },
    { time: '18:00', home: 'Spanien', away: 'Saudiarabien', ch: 'TV4' },
    { time: '21:00', home: 'Belgien', away: 'Iran', ch: 'TV4' },
  ] },
  { date: '2026-06-22', label: 'Mån 22 juni', tv4: 'Tomas', games: [
    { time: '00:00', home: 'Uruguay', away: 'Kap Verde', ch: 'TV4' },
    { time: '03:00', home: 'Nya Zeeland', away: 'Egypten', ch: 'TV4' },
    { time: '19:00', home: 'Argentina', away: 'Österrike', ch: 'SVT' },
    { time: '23:00', home: 'Frankrike', away: 'Irak', ch: 'SVT' },
  ] },
  { date: '2026-06-23', label: 'Tis 23 juni', tv4: 'Per', games: [
    { time: '02:00', home: 'Norge', away: 'Senegal', ch: 'SVT' },
    { time: '05:00', home: 'Jordanien', away: 'Algeriet', ch: 'TV4' },
    { time: '19:00', home: 'Portugal', away: 'Uzbekistan', ch: 'SVT' },
    { time: '22:00', home: 'England', away: 'Ghana', ch: 'SVT' },
  ] },
  { date: '2026-06-24', label: 'Ons 24 juni', tv4: 'Per', games: [
    { time: '01:00', home: 'Panama', away: 'Kroatien', ch: 'TV4' },
    { time: '04:00', home: 'Colombia', away: 'DR Kongo', ch: 'TV4' },
    { time: '21:00', home: 'Schweiz', away: 'Kanada', ch: 'TV4' },
    { time: '21:00', home: 'Bosnien och Hercegovina', away: 'Qatar', ch: 'TV4' },
  ] },
  { date: '2026-06-25', label: 'Tor 25 juni', tv4: 'Tomas', games: [
    { time: '00:00', home: 'Marocko', away: 'Haiti', ch: 'TV4' },
    { time: '00:00', home: 'Skottland', away: 'Brasilien', ch: 'TV4' },
    { time: '03:00', home: 'Sydafrika', away: 'Sydkorea', ch: 'SVT' },
    { time: '03:00', home: 'Tjeckien', away: 'Mexiko', ch: 'SVT' },
    { time: '22:00', home: 'Curaçao', away: 'Elfenbenskusten', ch: 'SVT' },
    { time: '22:00', home: 'Ecuador', away: 'Tyskland', ch: 'SVT' },
  ] },
  { date: '2026-06-26', label: 'Fre 26 juni', tv4: 'Tomas', games: [
    { time: '01:00', home: 'Tunisien', away: 'Nederländerna', ch: 'SVT' },
    { time: '01:00', home: 'Japan', away: 'Sverige', ch: 'SVT' },
    { time: '04:00', home: 'Turkiet', away: 'USA', ch: 'TV4' },
    { time: '04:00', home: 'Paraguay', away: 'Australien', ch: 'TV4' },
    { time: '21:00', home: 'Norge', away: 'Frankrike', ch: 'TV4' },
    { time: '21:00', home: 'Senegal', away: 'Irak', ch: 'TV4' },
  ] },
  { date: '2026-06-27', label: 'Lör 27 juni', tv4: 'Per', games: [
    { time: '02:00', home: 'Kap Verde', away: 'Saudiarabien', ch: 'TV4' },
    { time: '02:00', home: 'Uruguay', away: 'Spanien', ch: 'TV4' },
    { time: '05:00', home: 'Nya Zeeland', away: 'Belgien', ch: 'TV4' },
    { time: '05:00', home: 'Egypten', away: 'Iran', ch: 'TV4' },
    { time: '23:00', home: 'Panama', away: 'England', ch: 'SVT' },
    { time: '23:00', home: 'Kroatien', away: 'Ghana', ch: 'SVT' },
  ] },
  { date: '2026-06-28', label: 'Sön 28 juni', tv4: 'Per', games: [
    { time: '01:30', home: 'DR Kongo', away: 'Uzbekistan', ch: 'TV4' },
    { time: '01:30', home: 'Colombia', away: 'Portugal', ch: 'TV4' },
    { time: '04:00', home: 'Algeriet', away: 'Österrike', ch: 'TV4' },
    { time: '04:00', home: 'Jordanien', away: 'Argentina', ch: 'TV4' },
    { time: '21:00', home: 'Sydafrika', away: 'Kanada', ch: 'TV4', ko: 'r32', stageStart: '16-delsfinal' },
  ] },
  { date: '2026-06-29', label: 'Mån 29 juni', tv4: 'Tomas', games: [
    { time: '19:00', home: 'Brasilien', away: 'Japan', ch: 'TV4', ko: 'r32' },
    { time: '22:30', home: 'Tyskland', away: 'Paraguay', ch: 'SVT', ko: 'r32' },
  ] },
  { date: '2026-06-30', label: 'Tis 30 juni', tv4: 'Tomas', games: [
    { time: '03:00', home: 'Nederländerna', away: 'Marocko', ch: 'SVT', ko: 'r32' },
    { time: '19:00', home: 'Elfenbenskusten', away: 'Norge', ch: 'TV4', ko: 'r32' },
    { time: '23:00', home: 'Frankrike', away: 'Sverige', ch: 'TV4', ko: 'r32' },
  ] },
  { date: '2026-07-01', label: 'Ons 1 juli', tv4: 'Per', games: [
    { time: '03:00', home: 'Mexiko', away: 'Ecuador', ch: 'TV4', ko: 'r32' },
    { time: '18:00', home: 'England', away: 'DR Kongo', ch: 'SVT', ko: 'r32' },
    { time: '22:00', home: 'Belgien', away: 'Senegal', ch: 'TV4', ko: 'r32' },
  ] },
  { date: '2026-07-02', label: 'Tor 2 juli', tv4: 'Per', games: [
    { time: '02:00', home: 'USA', away: 'Bosnien och Hercegovina', ch: 'TV4', ko: 'r32' },
    { time: '21:00', home: 'Spanien', away: 'Österrike', ch: 'SVT', ko: 'r32' },
  ] },
  { date: '2026-07-03', label: 'Fre 3 juli', tv4: 'Tomas', games: [
    { time: '01:00', home: 'Portugal', away: 'Kroatien', ch: 'TV4', ko: 'r32' },
    { time: '05:00', home: 'Schweiz', away: 'Algeriet', ch: 'TV4', ko: 'r32' },
    { time: '20:00', home: 'Australien', away: 'Egypten', ch: 'TV4', ko: 'r32' },
  ] },
  { date: '2026-07-04', label: 'Lör 4 juli', tv4: 'Tomas', games: [
    { time: '00:00', home: 'Argentina', away: 'Kap Verde', ch: 'SVT', ko: 'r32' },
    { time: '03:30', home: 'Colombia', away: 'Ghana', ch: 'SVT', ko: 'r32' },
    { time: '19:00', home: 'Kanada', away: 'Marocko', ch: 'TV4', ko: 'r16', stageStart: 'Åttondelsfinal' },
    { time: '23:00', home: 'Paraguay', away: 'Frankrike', ch: 'SVT', ko: 'r16' },
  ] },
  { date: '2026-07-05', label: 'Sön 5 juli', tv4: 'Per', games: [
    { time: '22:00', home: 'Brasilien', away: 'Norge', ch: 'TV4', ko: 'r16' },
  ] },
  { date: '2026-07-06', label: 'Mån 6 juli', tv4: 'Per', games: [
    { time: '02:00', home: 'Mexiko', away: 'England', ch: 'SVT', ko: 'r16' },
    { time: '21:00', home: 'Portugal', away: 'Spanien', ch: 'TV4', ko: 'r16' },
  ] },
  { date: '2026-07-07', label: 'Tis 7 juli', tv4: 'Tomas', games: [
    { time: '02:00', home: 'USA', away: 'Belgien', ch: 'TV4', ko: 'r16' },
    { time: '18:00', home: 'Argentina', away: 'Egypten', ch: 'TV4', ko: 'r16' },
    { time: '22:00', home: 'Schweiz', away: 'Colombia', ch: 'SVT', ko: 'r16' },
  ] },
  { date: '2026-07-09', label: 'Tor 9 juli', tv4: 'Tomas', games: [
    { time: '22:00', home: 'Frankrike', away: 'Marocko', ch: 'TV4', ko: 'qf', stageStart: 'Kvartsfinal' },
  ] },
  { date: '2026-07-10', label: 'Fre 10 juli', tv4: null, games: [
    { time: '21:00', home: 'Spanien', away: 'Belgien', ch: 'SVT', ko: 'qf' },
  ] },
  { date: '2026-07-11', label: 'Lör 11 juli', tv4: 'Per', games: [
    { time: '23:00', home: 'Norge', away: 'England', ch: 'TV4', ko: 'qf' },
  ] },
  { date: '2026-07-12', label: 'Sön 12 juli', tv4: null, games: [
    { time: '03:00', home: 'Argentina', away: 'Schweiz', ch: 'SVT', ko: 'qf' },
  ] },
  { date: '2026-07-14', label: 'Tis 14 juli', tv4: null, games: [
    { time: '21:00', home: 'Frankrike', away: 'Spanien', ch: 'SVT', ko: 'sf', stageStart: 'Semifinal' },
  ] },
  { date: '2026-07-15', label: 'Ons 15 juli', tv4: 'Per', games: [
    { time: '21:00', home: 'England', away: 'Argentina', ch: 'TV4', ko: 'sf' },
  ] },
  { date: '2026-07-18', label: 'Lör 18 juli', tv4: null, games: [
    { time: '23:00', title: 'Bronsmatch', ch: 'SVT', stageStart: 'Bronsmatch' },
  ] },
  { date: '2026-07-19', label: 'Sön 19 juli', tv4: 'Tomas', games: [
    { time: '21:00', title: 'Finalen', ch: 'TV4', stageStart: 'Final' },
  ] },
];
