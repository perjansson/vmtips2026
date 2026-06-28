import { teamKey } from './parse.js';

// Vilken rond en slutspelsmatchs VINNARE tar sig vidare till. r32-matchens
// vinnare hamnar i r16, osv. final → VM-vinnaren (10p). third (bronsmatch) ger
// inga poäng. Nycklarna utgör också mängden "slutspelstyper".
export const KO_NEXT_ROUND = {
  r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final', final: 'winner', third: null,
};

export function isKnockoutType(type) {
  return Object.prototype.hasOwnProperty.call(KO_NEXT_ROUND, type);
}

// Vinnaren av en avslutad match utifrån målen. Oavgjort → null (straffar; kan
// inte avgöras från feedens reguljära/förlängnings-resultat → arket avgör).
function winnerOf(m) {
  if (m.homeGoals == null || m.awayGoals == null) return null;
  if (m.homeGoals > m.awayGoals) return m.home;
  if (m.awayGoals > m.homeGoals) return m.away;
  return null;
}

// Väver in avslutade slutspelsmatchers vinnare i rondlistorna (facit.rounds).
// Endast avslutade matcher med en avgjord vinnare. Arket vinner per match: om
// arket redan har något av lagen i målronden har arket avgjort matchen och
// feeden ignoreras. Returnerar ett nytt rounds-objekt, muterar inte.
export function applyLiveKnockout(rounds, knockout) {
  const out = {
    ...rounds,
    r16: [...(rounds.r16 ?? [])],
    qf: [...(rounds.qf ?? [])],
    sf: [...(rounds.sf ?? [])],
    final: [...(rounds.final ?? [])],
  };
  for (const m of knockout ?? []) {
    if (m.status !== 'finished') continue;
    const next = KO_NEXT_ROUND[m.type];
    if (!next) continue; // bronsmatch / okänd rond
    const winner = winnerOf(m);
    if (!winner) continue; // oavgjort → arket avgör
    if (next === 'winner') {
      if (!out.winner) out.winner = winner; // arket vinner om redan satt
      continue;
    }
    // Avsiktlig asymmetri: arket-vinner-kollen läser ORIGINAL-ronden (rounds)
    // – "har arket avgjort matchen?" – medan dedupe läser arbetskopian (out) så
    // två feed-matcher till samma rond inte dubblerar varandra. Slå inte ihop.
    const sheetSet = new Set((rounds[next] ?? []).map(teamKey));
    if (sheetSet.has(teamKey(m.home)) || sheetSet.has(teamKey(m.away))) continue;
    const wk = teamKey(winner);
    if (!out[next].some((t) => teamKey(t) === wk)) out[next].push(winner);
  }
  return out;
}
