// En match är "live" från avspark till +2.25 h. Avsparkstiderna i
// public/schedule.js är svensk tid (CEST, UTC+2). Hela turneringen (juni–juli)
// ligger inom CEST utan DST-växling, så vi tolkar tiderna som +02:00. Det gör
// fönstret korrekt oavsett serverns tidszon – Render kör UTC, inte svensk tid.
export const LIVE_WINDOW_MS = 2.25 * 3600 * 1000;

// "YYYY-MM-DD HH:MM" (svensk tid) → UTC-millisekunder, eller NaN om oparsbar.
export function kickoffMs(ts) {
  return Date.parse(`${ts.replace(' ', 'T')}:00+02:00`);
}

export function isInLiveWindow(ts, nowMs) {
  const ko = kickoffMs(ts);
  if (Number.isNaN(ko)) return false;
  return nowMs >= ko && nowMs <= ko + LIVE_WINDOW_MS;
}
