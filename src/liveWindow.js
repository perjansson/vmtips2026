// En match är "live" från avspark till +3.5 h. Fönstret måste rymma en hel
// slutspelsmatch inklusive förlängning och straffar (avspark → straffslut ≈ 3 h)
// plus marginal för att feeden ska hinna flagga FT – annars stänger fönstret
// innan slutresultatet landar och det fångas aldrig i matchens eget fönster.
// Gruppmatcher (~2 h) ryms med god marginal. Avsparkstiderna i
// public/schedule.js är svensk tid (CEST, UTC+2). Hela turneringen (juni–juli)
// ligger inom CEST utan DST-växling, så vi tolkar tiderna som +02:00. Det gör
// fönstret korrekt oavsett serverns tidszon – Render kör UTC, inte svensk tid.
export const LIVE_WINDOW_MS = 3.5 * 3600 * 1000;

// "YYYY-MM-DD HH:MM" (svensk tid) → UTC-millisekunder, eller NaN om oparsbar.
export function kickoffMs(ts) {
  return Date.parse(`${ts.replace(' ', 'T')}:00+02:00`);
}

export function isInLiveWindow(ts, nowMs) {
  const ko = kickoffMs(ts);
  if (Number.isNaN(ko)) return false;
  return nowMs >= ko && nowMs <= ko + LIVE_WINDOW_MS;
}

// Ska live-feeden pollas nu? Vid uppstart (ännu ej seedat) alltid, så en
// omstart mitt i natten ändå hämtar dagens slutresultat. I ett live-fönster
// alltid. Utanför fönster pollar vi ändå i låg takt (catch-up) så slutresultat
// som landar efter fönstret – eller efter en omstart – fångas, utan att feeden
// pollas konstant. Ren funktion så beslutet kan testas isolerat.
export function shouldPollLive({ seeded, inWindow, now, lastPollMs, catchupMs }) {
  if (!seeded) return true;
  if (inWindow) return true;
  return now - (lastPollMs ?? 0) >= catchupMs;
}
