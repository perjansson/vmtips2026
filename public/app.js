// Pollar /api/standings och uppdaterar tavlan mjukt: rader återanvänds per
// namn (ingen blink), omsortering animeras med FLIP och poängändringar
// blinkar till.

const board = document.getElementById('board');
const rowTemplate = document.getElementById('row-template');
const updatedAtEl = document.getElementById('updated-at');
const pointsProgressEl = document.getElementById('points-progress');
const noticeEl = document.getElementById('notice');
const schedEl = document.getElementById('sched');
const schedDaysEl = document.getElementById('sched-days');
const schedMoreEl = document.getElementById('sched-more');
const schedLessEl = document.getElementById('sched-less');
const schedShowEl = document.getElementById('sched-show');
const schedEarlierEl = document.getElementById('sched-earlier');
const schedActionsTopEl = document.getElementById('sched-actions-top');
const koPanelEl = document.getElementById('ko-panel');
const koPanelToggleEl = document.getElementById('ko-panel-toggle');
const koPanelRoundsEl = document.getElementById('ko-panel-rounds');

// --- Matchschema i headern ---------------------------------------------
// Det statiska schemat (window.SCHEDULE) ger ordning, tider, kanal och
// dagens TV4 Play-ägare. Resultat matchas in från facit på lagnamn.

const teamKey = (s) => String(s ?? '')
  .replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Platta ut schemat till en kronologisk lista med globalt ordningsindex,
// behåll dagstillhörigheten via dayIndex.
const SCHED_DAYS = window.SCHEDULE ?? [];
const FIXTURES_BY_DAY = SCHED_DAYS.map(() => []);
SCHED_DAYS.forEach((day, dayIndex) => {
  day.games.forEach((g) => {
    FIXTURES_BY_DAY[dayIndex].push({
      ...g,
      pair: g.home ? `${teamKey(g.home)}|${teamKey(g.away)}` : null,
    });
  });
});

// Slutspelsmatcher med kända lag, kronologiskt – för "kommande slutspel" i korten.
const KO_FIXTURES = SCHED_DAYS
  .flatMap((day, di) => FIXTURES_BY_DAY[di]
    .filter((fx) => fx.ko && fx.pair)
    .map((fx) => ({ ...fx, date: day.date })))
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
// Kommande (ej avgjorda) resp. nyligen avgjorda slutspelsmatcher – delade
// mellan alla deltagarkort, räknas ut en gång per render.
let upcomingKoGames = [];
let recentKoGames = [];

const DAYS_PER_CLICK = 2;   // antal extra matchdagar per "Visa fler/tidigare"-klick
let extraDays = 0;          // utökar fönstrets bakre kant framåt
let extraEarlierDays = 0;   // utökar fönstrets främre kant bakåt
let skipAnimateOut = false; // hoppa fade-out så vi kan mäta layouten direkt
let lastScoreByPair = new Map();
const dayBlocks = new Map(); // dayIndex -> dagblock i DOM
let schedReady = false;      // hoppa över in-animation vid första renderingen

const prefersReduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = () => window.matchMedia('(min-width: 600px)').matches;

function animateIn(el) {
  el.classList.add('sd-enter');
  el.addEventListener('animationend', () => el.classList.remove('sd-enter'), { once: true });
}
function animateOut(el) {
  el.classList.add('sd-exit');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
// animationend bubblar – kör bara callbacken för elementets egen animation.
function onSelfAnimEnd(el, cb) {
  const handler = (e) => {
    if (e.target !== el) return;
    el.removeEventListener('animationend', handler);
    cb();
  };
  el.addEventListener('animationend', handler);
}

// Dagens datum i svensk tidszon som 'YYYY-MM-DD'.
function todayISO() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Förskjut ett ISO-datum med ett antal dygn (ren kalenderaritmetik i UTC).
function isoShift(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

schedMoreEl.addEventListener('click', () => {
  extraDays += DAYS_PER_CLICK;
  renderSchedule(lastScoreByPair);
});
schedEarlierEl.addEventListener('click', () => {
  extraEarlierDays += DAYS_PER_CLICK;
  renderSchedule(lastScoreByPair);
});
schedLessEl.addEventListener('click', () => {
  // Bevara knappens position i viewporten genom kollapsen så schemat krymper
  // "in mot" knappen istället för att puffa upp leaderboarden under den.
  // Skippa fade-out så vi kan mäta layouten direkt efter render.
  const beforeTop = schedLessEl.getBoundingClientRect().top;
  extraDays = 0;
  extraEarlierDays = 0;
  skipAnimateOut = true;
  renderSchedule(lastScoreByPair);
  skipAnimateOut = false;
  const delta = schedLessEl.getBoundingClientRect().top - beforeTop;
  if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
});
schedShowEl.addEventListener('click', () => {
  const collapsing = !schedEl.classList.contains('collapsed');
  schedShowEl.textContent = collapsing ? 'Visa matcher' : 'Dölj matcher';
  schedShowEl.setAttribute('aria-expanded', String(!collapsing));

  if (prefersReduced()) {
    schedEl.classList.toggle('collapsed', collapsing);
    return;
  }
  if (collapsing) {
    schedDaysEl.classList.add('anim-out');
    onSelfAnimEnd(schedDaysEl, () => {
      schedDaysEl.classList.remove('anim-out');
      schedEl.classList.add('collapsed');
    });
  } else {
    schedEl.classList.remove('collapsed');
    schedDaysEl.classList.add('anim-in');
    onSelfAnimEnd(schedDaysEl, () => schedDaysEl.classList.remove('anim-in'));
  }
});

// Slutspelslag-panelen: utfälld som standard. På mobil kan den fällas ihop
// (knapp); på desktop visas den alltid (knappen göms i CSS).
koPanelToggleEl.addEventListener('click', () => {
  const collapsing = !koPanelEl.classList.contains('collapsed');
  koPanelEl.classList.toggle('collapsed', collapsing);
  koPanelToggleEl.textContent = collapsing ? 'Visa slutspelslag' : 'Dölj slutspelslag';
  koPanelToggleEl.setAttribute('aria-expanded', String(!collapsing));
});

// Lag som tagit sig vidare per rond (facit). Bygger bara om när laguppsättningen
// faktiskt ändrats (signatur) så pollen inte ritar om 60+ chip i onödan.
const KO_PANEL_ROUNDS = [
  ['r32', '16-delsfinal'], ['r16', 'Åttondelsfinal'], ['qf', 'Kvartsfinal'],
  ['sf', 'Semifinal'], ['final', 'Final'],
];

// Vilken (rond, lag) som just nu har sin gissar-lista utfälld i panelen.
// Bara en åt gången – en delad ruta per rond visar listan.
let openKoTeam = null; // { roundKey, teamKey } | null

// För en given rond: Map<teamKey, string[] namn> som hade laget i sin gissning.
// Räknas ut en gång per signatur-ändring (billigt: ~25 namn × 5 ronder).
function koGuessersByRound() {
  const ROUND_KEYS = ['r32', 'r16', 'qf', 'sf', 'final'];
  const out = {};
  for (const k of ROUND_KEYS) out[k] = new Map();
  if (!knockoutByName) return { byRound: out, total: 0 };
  let total = 0;
  for (const [name, guesses] of Object.entries(knockoutByName)) {
    total++;
    for (const k of ROUND_KEYS) {
      for (const t of guesses?.[k] ?? []) {
        const key = teamKey(t);
        if (!out[k].has(key)) out[k].set(key, []);
        out[k].get(key).push(name);
      }
    }
  }
  return { byRound: out, total };
}

function koTeamChip(team, count, total) {
  // Innan tips laddats: ren span (oklickbar, ingen räknare). Annars: knapp
  // med räknare och progressfyllning.
  if (count == null) {
    const chip = document.createElement('span');
    chip.className = 'kop-team';
    chip.textContent = team;
    return chip;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kop-team kop-team-btn';
  btn.dataset.team = teamKey(team);
  btn.setAttribute('aria-expanded', 'false');
  btn.title = `${count} av ${total} tippade ${team} hit`;
  const name = document.createElement('span');
  name.className = 'kop-team-name';
  name.textContent = team;
  const badge = document.createElement('span');
  badge.className = 'kop-team-count';
  badge.textContent = count;
  btn.append(name, badge);
  return btn;
}

function koRoundGroup(roundKey, label, teams, guessersByTeam, total) {
  const group = document.createElement('div');
  group.className = 'ko-round-group';
  const h = document.createElement('h4');
  h.className = 'ko-round-label';
  h.textContent = `${label} · ${teams.length}`;
  const list = document.createElement('div');
  list.className = 'ko-round-teams';
  const detail = document.createElement('div');
  detail.className = 'kop-team-detail';
  detail.hidden = true;
  group.dataset.round = roundKey ?? '';
  for (const t of [...teams].sort((a, b) => a.localeCompare(b, 'sv'))) {
    const tk = teamKey(t);
    const count = guessersByTeam ? (guessersByTeam.get(tk)?.length ?? 0) : null;
    const chip = koTeamChip(t, count, total);
    if (chip.tagName === 'BUTTON') {
      chip.addEventListener('click', () => {
        toggleKoTeam(roundKey, tk, t, guessersByTeam, group);
      });
    }
    list.append(chip);
  }
  group.append(h, list, detail);
  if (openKoTeam && openKoTeam.roundKey === roundKey) {
    const found = teams.find((t) => teamKey(t) === openKoTeam.teamKey);
    if (found && guessersByTeam) {
      paintKoTeamDetail(group, found, openKoTeam.teamKey, guessersByTeam, total);
    } else {
      openKoTeam = null;
    }
  }
  return group;
}

function paintKoTeamDetail(group, teamName, tk, guessersByTeam, total) {
  const detail = group.querySelector('.kop-team-detail');
  const hitNames = [...(guessersByTeam.get(tk) ?? [])]
    .sort((a, b) => a.localeCompare(b, 'sv'));
  const hitSet = new Set(hitNames);
  const missNames = Object.keys(knockoutByName ?? {})
    .filter((n) => !hitSet.has(n))
    .sort((a, b) => a.localeCompare(b, 'sv'));

  detail.replaceChildren();
  const addSection = (klass, heading, names) => {
    const h = document.createElement('div');
    h.className = `kop-team-detail-h ${klass}`;
    h.textContent = heading;
    detail.append(h);
    if (names.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'kop-team-detail-list';
      for (const n of names) {
        const li = document.createElement('li');
        li.textContent = n;
        ul.append(li);
      }
      detail.append(ul);
    }
  };
  if (hitNames.length > 0) {
    addSection('is-hit', `${hitNames.length} av ${total} tippade ${teamName} hit:`, hitNames);
  } else {
    addSection('is-hit', `Ingen tippade ${teamName} hit.`, []);
  }
  if (missNames.length > 0) {
    addSection('is-miss', `${missNames.length} av ${total} missade ${teamName}:`, missNames);
  }
  detail.hidden = false;
  for (const btn of group.querySelectorAll('.kop-team-btn')) {
    btn.setAttribute('aria-expanded', String(btn.dataset.team === tk));
  }
}

function clearKoTeamDetail(group) {
  const detail = group.querySelector('.kop-team-detail');
  if (detail) { detail.hidden = true; detail.replaceChildren(); }
  for (const btn of group.querySelectorAll('.kop-team-btn')) {
    btn.setAttribute('aria-expanded', 'false');
  }
}

function toggleKoTeam(roundKey, tk, teamName, guessersByTeam, group) {
  const wasOpen = openKoTeam
    && openKoTeam.roundKey === roundKey && openKoTeam.teamKey === tk;
  for (const g of koPanelRoundsEl.querySelectorAll('.ko-round-group')) {
    clearKoTeamDetail(g);
  }
  if (wasOpen) { openKoTeam = null; return; }
  openKoTeam = { roundKey, teamKey: tk };
  const total = Object.keys(knockoutByName ?? {}).length;
  paintKoTeamDetail(group, teamName, tk, guessersByTeam, total);
}

function renderKnockoutPanel(facit) {
  const rounds = facit.rounds ?? {};
  const sig = JSON.stringify([
    rounds.r32, rounds.r16, rounds.qf, rounds.sf, rounds.final,
    facit.winner, tipsLoaded,
  ]);
  if (koPanelRoundsEl._sig === sig) return;
  koPanelRoundsEl._sig = sig;
  const { byRound, total } = koGuessersByRound();
  const groups = [];
  for (const [key, label] of KO_PANEL_ROUNDS) {
    const teams = rounds[key] ?? [];
    if (teams.length > 0) {
      groups.push(koRoundGroup(key, label, teams, tipsLoaded ? byRound[key] : null, total));
    }
  }
  if (facit.winner) {
    groups.push(koRoundGroup(null, 'VM-vinnare', [facit.winner], null, total));
  }
  koPanelEl.hidden = groups.length === 0;
  koPanelRoundsEl.replaceChildren(...groups);
  // När det finns lag att räkna men tips ännu inte är laddade: kicka igång
  // hämtningen och rita om panelen så fort den är klar (signaturen tar in
  // tipsLoaded, så följande render byter ut chipsen mot knappar med räknare).
  if (!tipsLoaded && groups.length > 0) {
    ensureTips().then(() => { if (tipsLoaded) renderKnockoutPanel(facit); });
  }
}

function tvBadge(ch) {
  const span = document.createElement('span');
  span.className = `tv tv-${ch.toLowerCase()}`;
  span.textContent = ch === 'TV4' ? 'TV4' : 'SVT';
  return span;
}

// --- Allas tips per match -----------------------------------------------
// Hämtas en gång efter första målning (tipsen är låsta efter turneringsstart)
// och cachas. Klick på en match expanderar en panel med allas tips,
// grupperade på utfall. Bara en panel öppen åt gången.

let tipsByPair = new Map();
let knockoutByName = null; // namn → { r32, r16, ... } slutspelsgissningar (statiskt)
const openRounds = new Set(); // "namn:rond" som är expanderade i detaljkortet
let tipsLoaded = false;
let tipsPromise = null;
let openPair = null;

// Slutresultat (numeriska) för spelade matcher, populeras i render() och
// används av renderTipsInto för att räkna ut tipspoäng per tippare när
// matchen är avgjord.
let lastResultByPair = new Map();
// Live-matcher (pair → { homeGoals, awayGoals, status, minute }) ur senaste
// payloadens live-block. Tomt när inget pågår. Arket vinner: visas bara för
// matcher som ännu saknar bekräftat resultat.
let liveByPair = new Map();
// Avslutade slutspelsmatchers slutresultat (pair → "h–a"), enbart för visning.
let koResultByPair = new Map();

// Tipsregler: 3 p rätt utgång + 1 p per prickat målantal (max 5).
function tipPoints(t, result) {
  let p = 0;
  if (Math.sign(t.h - t.a) === Math.sign(result.h - result.a)) p += 3;
  if (t.h === result.h) p += 1;
  if (t.a === result.a) p += 1;
  return p;
}

async function ensureTips() {
  if (tipsLoaded) return;
  if (!tipsPromise) {
    tipsPromise = fetch('/api/match-tips', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        tipsByPair = new Map(Object.entries(d.tipsByPair ?? {}));
        knockoutByName = d.knockoutByName ?? {};
        tipsLoaded = true;
      })
      .catch((err) => { console.error('match-tips:', err.message); })
      .finally(() => { tipsPromise = null; });
  }
  return tipsPromise;
}

// Säkert DOM-id från pair-nyckeln (lagnamn kan innehålla mellanslag, accenter, |).
const pairId = (p) => 'tips-' + p.replace(/[^a-z0-9]/gi, '_');

// Kontroversmätare: en enda stackad stapel med tre färgkodade segment
// (hem/oavgjort/borta) + en legend under. En enbart-yellow stapel = stark
// konsensus; tre likadana segment = poolen är splittrad.
function consensusMeter(fx, total, h, d, a) {
  const wrap = document.createElement('div');
  wrap.className = 'sg-consensus';
  const head = document.createElement('div');
  head.className = 'sg-consensus-h';
  head.textContent = 'Tipsfördelning';
  wrap.append(head);

  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const stack = document.createElement('div');
  stack.className = 'sg-stack';
  const segment = (outcome, count) => {
    const s = document.createElement('span');
    s.className = 'sg-stack-seg';
    s.dataset.outcome = outcome;
    s.style.width = `${pct(count)}%`;
    return s;
  };
  stack.append(segment('home', h), segment('draw', d), segment('away', a));
  wrap.append(stack);

  const legend = document.createElement('div');
  legend.className = 'sg-stack-legend';
  const legendItem = (outcome, label, count) => {
    const it = document.createElement('span');
    it.className = 'sg-stack-legend-item';
    const sw = document.createElement('span');
    sw.className = 'sg-stack-legend-swatch';
    sw.dataset.outcome = outcome;
    const tx = document.createElement('span');
    tx.textContent = `${label} ${pct(count)}% (${count})`;
    it.append(sw, tx);
    return it;
  };
  legend.append(
    legendItem('home', fx.home, h),
    legendItem('draw', 'Oavgjort', d),
    legendItem('away', fx.away, a),
  );
  wrap.append(legend);
  return wrap;
}

function renderTipsInto(inner, fx) {
  const tips = tipsByPair.get(fx.pair) ?? [];
  inner.replaceChildren();
  if (tips.length === 0) {
    const p = document.createElement('p');
    p.className = 'sg-tips-empty';
    p.textContent = tipsLoaded ? 'Inga tips än.' : 'Hämtar tips…';
    inner.append(p);
    return;
  }
  const homeWin = [], draw = [], awayWin = [];
  for (const t of tips) {
    if (t.h > t.a) homeWin.push(t);
    else if (t.h < t.a) awayWin.push(t);
    else draw.push(t);
  }
  inner.append(consensusMeter(fx, tips.length, homeWin.length, draw.length, awayWin.length));
  // Bekräftat facit vinner. Saknas det men matchen pågår live: visa samma
  // poängrankade vy som för en avgjord match, fast räknad på live-resultatet
  // och med pulsande poäng.
  const confirmed = lastResultByPair.get(fx.pair) ?? null;
  const liveM = !confirmed ? liveByPair.get(fx.pair) : null;
  const isLive = !!(liveM && liveM.status === 'live'
    && liveM.homeGoals != null && liveM.awayGoals != null);
  const result = confirmed ?? (isLive ? { h: liveM.homeGoals, a: liveM.awayGoals } : null);

  // Sortering inom en lista: störst målskillnad först, vid lika störst totala
  // mål först. Används både i grupperna (ospelad) och som tiebreaker (spelad).
  const byDiff = (a, b) => {
    const da = Math.abs(a.h - a.a), db = Math.abs(b.h - b.a);
    if (db !== da) return db - da;
    return (b.h + b.a) - (a.h + a.a);
  };

  const renderTipItem = (t, ul, pts, live) => {
    const item = document.createElement('li');
    const nm = document.createElement('span');
    nm.textContent = t.name;
    const sc = document.createElement('span');
    sc.className = 'sg-tips-score';
    sc.textContent = `${t.h}–${t.a}`;
    item.append(nm, sc);
    if (pts !== undefined) {
      const ptsSpan = document.createElement('span');
      ptsSpan.className = live ? 'sg-tips-pts sg-tips-pts-live' : 'sg-tips-pts';
      ptsSpan.textContent = pts === 0 ? '(0p)' : `(+${pts}p)`;
      item.append(ptsSpan);
    }
    ul.append(item);
  };

  if (result) {
    // Spelad (eller pågående) match: ingen gruppering – en enda lista, poäng
    // desc, sen byDiff. Räkna ut poängen en gång per tippare så sorteraren
    // slipper anropa tipPoints O(N log N) gånger.
    const withPts = tips.map((t) => ({ ...t, pts: tipPoints(t, result) }));
    withPts.sort((a, b) => (b.pts - a.pts) || byDiff(a, b));
    const ul = document.createElement('ul');
    ul.className = 'sg-tips-list';
    for (const t of withPts) renderTipItem(t, ul, t.pts, isLive);
    inner.append(ul);
  } else {
    // Ospelad: gruppera per utfall, sortera inom grupp med byDiff.
    const addGroup = (label, list) => {
      if (list.length === 0) return;
      const h = document.createElement('h4');
      h.className = 'sg-tips-h';
      h.textContent = `${label} (${list.length})`;
      inner.append(h);
      const ul = document.createElement('ul');
      ul.className = 'sg-tips-list';
      for (const t of list.slice().sort(byDiff)) renderTipItem(t, ul);
      inner.append(ul);
    };
    addGroup(`Seger för ${fx.home}`, homeWin);
    addGroup('Oavgjort', draw);
    addGroup(`Seger för ${fx.away}`, awayWin);
  }
}

function closeOpenTips() {
  if (!openPair) return;
  const panel = document.getElementById(pairId(openPair));
  if (panel) {
    panel.dataset.open = 'false';
    const row = panel.previousElementSibling;
    if (row) row.setAttribute('aria-expanded', 'false');
  }
  openPair = null;
}

async function togglePanel(fx, row, panel, inner) {
  if (openPair === fx.pair) { closeOpenTips(); return; }
  closeOpenTips();
  // Optimistiskt öppna direkt så klicket känns instant – panelen visar
  // "Hämtar…" om prefetchen inte hunnit klart.
  renderPanelInto(inner, fx);
  panel.dataset.open = 'true';
  row.setAttribute('aria-expanded', 'true');
  openPair = fx.pair;
  if (!tipsLoaded) {
    await ensureTips();
    if (openPair === fx.pair) renderPanelInto(inner, fx);
  }
}

// Väljer panelinnehåll: slutspelsmatch → avancemangs-/poängfördelning,
// gruppmatch → allas tips.
function renderPanelInto(inner, fx) {
  if (fx.ko) renderKnockoutGameInto(inner, fx);
  else renderTipsInto(inner, fx);
}

// Nästa rond en slutspelsmatchs vinnare går till (speglar src/liveKnockout.js).
const KO_NEXT_ROUND = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final', final: 'winner', third: null };

// Panel för en slutspelsmatch. Före/efter spel: hur många som tippat hemma-
// laget vidare till nästa rond, bortalaget, eller ingen. Under live: vilka som
// just nu får poäng (5, eller 10 inför final) för att de tippat den ledande.
function renderKnockoutGameInto(inner, fx) {
  inner.replaceChildren();
  if (!tipsLoaded) {
    const p = document.createElement('p');
    p.className = 'sg-tips-empty';
    p.textContent = 'Hämtar…';
    inner.append(p);
    return;
  }
  const nextRound = KO_NEXT_ROUND[fx.ko];
  if (!nextRound) {
    const p = document.createElement('p');
    p.className = 'sg-tips-empty';
    p.textContent = 'Matchen ger inga slutspelspoäng.';
    inner.append(p);
    return;
  }
  const pts = nextRound === 'winner' ? 10 : 5;
  const names = Object.keys(knockoutByName ?? {}).sort((a, b) => a.localeCompare(b, 'sv'));
  const predicted = (name, team) => {
    const g = knockoutByName?.[name];
    if (!g || !team) return false;
    const list = nextRound === 'winner' ? [g.winner].filter(Boolean) : (g[nextRound] ?? []);
    return list.some((t) => teamKey(t) === teamKey(team));
  };
  const verb = nextRound === 'winner' ? 'som VM-vinnare' : 'vidare';
  const live = liveByPair.get(fx.pair);
  const isLive = live && live.status === 'live' && live.homeGoals != null && live.awayGoals != null;

  if (isLive) {
    const leader = live.homeGoals > live.awayGoals ? fx.home
      : live.awayGoals > live.homeGoals ? fx.away : null;
    const head = document.createElement('p');
    head.className = 'kog-head';
    if (!leader) {
      head.textContent = `Oavgjort ${live.homeGoals}–${live.awayGoals} – inga poäng just nu.`;
      inner.append(head);
      return;
    }
    head.textContent = `${leader} leder ${live.homeGoals}–${live.awayGoals} → ${pts}p just nu till de som tippat ${leader} ${verb}:`;
    inner.append(head);
    const getters = names.filter((n) => predicted(n, leader));
    const others = names.filter((n) => !predicted(n, leader));
    inner.append(kogGroup(`Får ${pts}p nu`, getters, 'hit'));
    inner.append(kogGroup('0p nu', others, 'miss'));
    return;
  }

  const homeUsers = names.filter((n) => predicted(n, fx.home));
  const awayUsers = names.filter((n) => predicted(n, fx.away));
  const neither = names.filter((n) => !predicted(n, fx.home) && !predicted(n, fx.away));
  inner.append(kogGroup(`${fx.home} ${verb}`, homeUsers, 'home'));
  inner.append(kogGroup(`${fx.away} ${verb}`, awayUsers, 'away'));
  if (neither.length) inner.append(kogGroup('Ingen av dem', neither, 'none'));
}

function kogGroup(label, names, cls) {
  const wrap = document.createElement('div');
  wrap.className = `kog-group kog-${cls}`;
  const h = document.createElement('h4');
  h.className = 'kog-h';
  h.textContent = `${label} (${names.length})`;
  wrap.append(h);
  if (names.length) {
    const ul = document.createElement('ul');
    ul.className = 'kog-list';
    for (const n of names) {
      const li = document.createElement('li');
      li.textContent = n;
      ul.append(li);
    }
    wrap.append(ul);
  }
  return wrap;
}

// Starta prefetchen så snart som möjligt utan att blockera första målningen.
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => ensureTips());
} else {
  setTimeout(() => ensureTips(), 0);
}

// Schemat lagras i svensk tid. Är browsern på finsk tid (Helsingfors/Åland)
// visar vi finsk tid + finsk flagga; annars svensk tid + svensk flagga.
// Båda zonerna är på sommartid under hela turneringen, så +1 h räcker.
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const IN_FINLAND = LOCAL_TZ === 'Europe/Helsinki' || LOCAL_TZ === 'Europe/Mariehamn';
const TIME_FLAG = IN_FINLAND ? '🇫🇮' : '🇸🇪';

function localTime(hhmm) {
  if (!IN_FINLAND) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function gameRow(fx, scoreByPair) {
  const li = document.createElement('li');
  li.className = 'sg';

  // Matcher med kända lag är klickbara: gruppmatcher visar allas tips,
  // slutspelsmatcher (ko: '<rond>') visar avancemangs-fördelning / live-poäng.
  // Platshållare (bara title) är icke-interaktiva div:ar.
  const isGroup = !!fx.pair && !fx.ko;
  const isKnockout = !!fx.pair && !!fx.ko;
  const clickable = isGroup || isKnockout;
  const row = document.createElement(clickable ? 'button' : 'div');
  row.className = 'sg-row';
  if (clickable) row.type = 'button';

  const time = document.createElement('span');
  time.className = 'sg-time';
  time.textContent = `${TIME_FLAG} ${localTime(fx.time)}`;

  const title = document.createElement('span');
  title.className = 'sg-title';
  title.textContent = fx.home ? `${fx.home} – ${fx.away}` : fx.title;
  if (fx.note) {
    const note = document.createElement('span');
    note.className = 'sg-note';
    note.textContent = ` (${fx.note})`;
    title.append(note);
  }

  const meta = document.createElement('span');
  meta.className = 'sg-meta';
  const score = fx.pair ? scoreByPair.get(fx.pair) : undefined;
  const live = (!score && fx.pair) ? liveByPair.get(fx.pair) : undefined;
  // Avslutad slutspelsmatch: slutresultatet från feeden visas (arket saknar
  // det). Endast visning – poängen kommer från avancemanget.
  const koResult = (!score && !live && isKnockout) ? koResultByPair.get(fx.pair) : undefined;
  if (live && live.status === 'live') li.classList.add('sg-live');
  if (score || koResult) {
    const sc = document.createElement('span');
    sc.className = 'sg-score';
    sc.textContent = score ?? koResult;
    meta.append(sc);
  } else if (live && live.homeGoals != null && live.awayGoals != null) {
    const sc = document.createElement('span');
    sc.className = 'sg-score sg-score-live';
    sc.textContent = `${live.homeGoals}–${live.awayGoals}`;
    // Live: bara den pulserande pricken (ingen minut – känns flakig och tar
    // plats). Slutspelad men obekräftad: diskret "Ej bekräftat".
    const badge = document.createElement('span');
    badge.className = 'sg-live-badge';
    if (live.status === 'live') {
      badge.setAttribute('aria-label', 'Live');
    } else {
      badge.textContent = 'Ej bekräftat';
      badge.dataset.unconfirmed = 'true';
    }
    if (isGroup) {
      // Tryckbar: öppnar Googles livescore-kort i ny flik. Routas via radens
      // klickhanterare (en <a> får inte ligga i <button>), så övriga klick på
      // raden fäller fortfarande ut tipspanelen.
      const link = document.createElement('span');
      link.className = 'sg-live-link';
      if (live.status === 'live') link.dataset.live = 'true';
      link.dataset.href = `https://www.google.com/search?q=${encodeURIComponent(`${fx.home} ${fx.away}`)}`;
      link.setAttribute('role', 'link');
      link.title = `Öppna livescore för ${fx.home}–${fx.away}`;
      link.append(sc, badge);
      meta.append(link);
    } else {
      // Slutspelsmatch: scoreline utan Google-länk (klick öppnar panelen).
      meta.append(sc, badge);
    }
  }
  meta.append(tvBadge(fx.ch));

  row.append(time, title, meta);
  li.append(row);

  if (clickable) {
    const panel = document.createElement('div');
    panel.className = 'sg-tips';
    panel.id = pairId(fx.pair);
    row.setAttribute('aria-controls', panel.id);

    const inner = document.createElement('div');
    inner.className = 'sg-tips-inner';
    panel.append(inner);

    // Bevara öppet tillstånd över re-renders (t.ex. när scores ändras).
    // data-open sätts innan panelen läggs i DOM så ingen övergång triggas.
    const isOpen = fx.pair === openPair;
    panel.dataset.open = isOpen ? 'true' : 'false';
    row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) renderPanelInto(inner, fx);

    row.addEventListener('click', (e) => {
      const link = e.target.closest('.sg-live-link');
      if (link && link.dataset.href) {
        window.open(link.dataset.href, '_blank', 'noopener');
        return;
      }
      togglePanel(fx, row, panel, inner);
    });
    li.append(panel);
  }

  return li;
}

// Signatur över allt som påverkar dagens DOM. Används för att hoppa över
// rebuild när inget förändrats (poll var 5:e sekund) – då bevaras också
// en öppen tipspanel utan extra logik.
function daySig(day, fixtures, scoreByPair, past, current) {
  let s = `${day.label}|${day.tv4 ?? ''}|${past ? 1 : 0}|${current ? 1 : 0}`;
  for (const fx of fixtures) {
    const score = fx.pair ? (scoreByPair.get(fx.pair) ?? '') : '';
    const lm = fx.pair ? liveByPair.get(fx.pair) : null;
    const liveSig = lm ? `${lm.homeGoals}-${lm.awayGoals}-${lm.status}` : '';
    const koRes = fx.ko && fx.pair ? (koResultByPair.get(fx.pair) ?? '') : '';
    s += `\n${fx.time}|${fx.pair ?? fx.title ?? ''}|${score}|${liveSig}|${koRes}|${fx.note ?? ''}|${fx.ch}`;
  }
  return s;
}

// Fyll (eller uppdatera) ett dagblock på plats – elementets identitet behålls,
// så att en poll-uppdatering av resultat inte triggar någon in-animation.
function fillDayContent(block, day, fixtures, scoreByPair, past, current) {
  const sig = daySig(day, fixtures, scoreByPair, past, current);
  if (block._sig === sig) return;
  block._sig = sig;
  // Markera dagblock med en pågående match så mobilens kollapsade vy kan visa
  // just den (se .sd-has-live i CSS).
  block.classList.toggle('sd-has-live', fixtures.some((fx) => fx.pair
    && liveByPair.get(fx.pair)?.status === 'live'));
  const head = document.createElement('div');
  head.className = 'sd-head';
  const label = document.createElement('span');
  label.className = 'sd-label';
  label.textContent = day.label;
  head.append(label);
  const sub = document.createElement('span');
  if (day.tv4) {
    // Endast det pågående 2-dygnsblocket lyser starkt gult med 📺;
    // passerade och kommande block tonas ned.
    sub.className = current ? 'sd-sub' : 'sd-sub sd-sub-past';
    const verb = past ? 'hade' : 'har';
    sub.textContent = current
      ? `📺 ${day.tv4} har TV4 Play`
      : `${day.tv4} ${verb} TV4 Play`;
  } else {
    sub.className = 'sd-sub sd-sub-svt';
    sub.textContent = 'Endast SVT';
  }
  head.append(sub);

  const list = document.createElement('ol');
  list.className = 'sd-games';
  for (const fx of fixtures) {
    // Liten avdelare där en ny slutspelsrond börjar (16-delsfinal osv).
    if (fx.stageStart) {
      const sep = document.createElement('li');
      sep.className = 'sg-stage';
      sep.setAttribute('role', 'presentation');
      sep.textContent = fx.stageStart;
      list.append(sep);
    }
    list.append(gameRow(fx, scoreByPair));
  }

  block.replaceChildren(head, list);
}

function makeDayBlock(dayIndex, scoreByPair, today, currentBlock) {
  const block = document.createElement('div');
  block.className = 'sd';
  block.dataset.day = String(dayIndex);
  const day = SCHED_DAYS[dayIndex];
  fillDayContent(block, day, FIXTURES_BY_DAY[dayIndex], scoreByPair,
    day.date < today, currentBlock.has(day.date));
  return block;
}

// Det pågående TV4 Play-blocket: idag plus efterföljande dagar med samma
// ägare (en ägarperiod kan spänna flera dygn). Passerade dagar räknas aldrig
// som pågående – de tonas ned och visas i dåtid. Tom mängd om dagens datum
// inte finns i schemat (vilodag).
function currentTv4Block(today) {
  const idx = SCHED_DAYS.findIndex((d) => d.date === today);
  if (idx === -1) return new Set();
  const dates = new Set([SCHED_DAYS[idx].date]);
  const owner = SCHED_DAYS[idx].tv4;
  if (!owner) return dates;
  for (let i = idx + 1; i < SCHED_DAYS.length && SCHED_DAYS[i].tv4 === owner; i++) {
    dates.add(SCHED_DAYS[i].date);
  }
  return dates;
}

// Grundvy: alla matcher igår, idag och imorgon (oavsett antal). "Visa fler"
// utökar fönstrets bakre kant med DAYS_PER_CLICK matchdagar i taget. Faller
// utanför turneringen tillbaka på de närmaste matchdagarna.
function renderSchedule(scoreByPair) {
  lastScoreByPair = scoreByPair;
  if (SCHED_DAYS.length === 0) return;

  const today = todayISO();
  const windowDates = new Set([isoShift(today, -1), today, isoShift(today, 1)]);
  const currentBlock = currentTv4Block(today);

  let idxs = SCHED_DAYS
    .map((d, i) => (windowDates.has(d.date) ? i : -1))
    .filter((i) => i >= 0);
  if (idxs.length === 0) {
    const next = SCHED_DAYS.findIndex((d) => d.date >= today);
    idxs = next === -1
      ? SCHED_DAYS.map((_, i) => i).slice(-3)
      : [next, next + 1, next + 2].filter((i) => i < SCHED_DAYS.length);
  }

  const startIdx = Math.max(0, idxs[0] - extraEarlierDays);
  const endIdx = Math.min(idxs[idxs.length - 1] + extraDays, SCHED_DAYS.length - 1);

  const target = [];
  for (let i = startIdx; i <= endIdx; i++) target.push(i);
  const targetSet = new Set(target);
  // Animera bara när listan faktiskt syns (annars instant – inga hängande
  // animationend som aldrig avfyras i en dold container).
  const visible = isDesktop() || !schedEl.classList.contains('collapsed');
  const animate = schedReady && visible && !prefersReduced();

  // Ta bort dagar som inte längre ska visas (animera ut).
  for (const [di, el] of [...dayBlocks]) {
    if (targetSet.has(di)) continue;
    dayBlocks.delete(di);
    if (animate && !skipAnimateOut) animateOut(el); else el.remove();
  }

  // Lägg till nya dagar (animera in) och uppdatera befintliga på plats.
  let prevEl = null;
  for (const di of target) {
    let el = dayBlocks.get(di);
    const day = SCHED_DAYS[di];
    if (el) {
      fillDayContent(el, day, FIXTURES_BY_DAY[di], scoreByPair,
        day.date < today, currentBlock.has(day.date));
    } else {
      el = makeDayBlock(di, scoreByPair, today, currentBlock);
      dayBlocks.set(di, el);
      schedDaysEl.insertBefore(el, prevEl ? prevEl.nextSibling : schedDaysEl.firstChild);
      if (animate) animateIn(el);
    }
    prevEl = el;
  }

  schedMoreEl.hidden = endIdx >= SCHED_DAYS.length - 1;
  schedEarlierEl.hidden = startIdx <= 0;
  schedActionsTopEl.hidden = schedEarlierEl.hidden;
  schedLessEl.hidden = extraDays === 0 && extraEarlierDays === 0;
  schedReady = true;
}

const rowsByName = new Map();   // namn → li-element
const lastTotals = new Map();   // namn → total från förra svaret
let pollSeconds = 5;
let lastUpdatedAt = null; // klienttid när vi senast tog emot ett svar
let nextPollAt = null;    // klienttid när nästa poll är schemalagd
let updateFailed = false;

// Tickar varje sekund och räknar ned mot klientens egen nästa-poll-tid (inte
// serverns recompute-tidsstämpel, som bara ändras var 15:e sekund). Vid 0
// växlar texten till "Uppdaterar nu…" tills pollen faktiskt avslutas.
function renderUpdatedAt() {
  if (!lastUpdatedAt) return;
  const time = lastUpdatedAt.toLocaleTimeString('sv-SE');
  if (updateFailed) {
    updatedAtEl.textContent = `Senast uppdaterad ${time} (försöker igen…)`;
    return;
  }
  const remaining = nextPollAt
    ? Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000))
    : pollSeconds;
  const status = remaining === 0 ? 'Uppdaterar nu…' : `Uppdaterar om ${remaining}s…`;
  updatedAtEl.textContent = `Senast uppdaterad ${time} (${status})`;
}

// setInterval startas om efter varje poll så dess tick-boundary alignar med
// nästa pollens schemaläggning. Annars driver de mot varandra och "1s" syns
// bara i ~150ms innan pollen avlossar.
let updateTimer = null;
function restartUpdateTimer() {
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(renderUpdatedAt, 1000);
}
restartUpdateTimer();

// Hot-reload: servern stämplar varje payload med buildId. Vi reloadar så fort
// vi ser ett annat värde än det sidan ursprungligen laddades med. Cache-bust
// på script/style via ?v=BUILD_ID i HTML säkerställer att reloaden faktiskt
// drar ner ny kod, inte 5-min-cachad gammal.
let pageBuildId = window.__INITIAL_STANDINGS__?.buildId ?? null;
function checkBuildChange(data) {
  if (!data?.buildId) return false;
  if (pageBuildId === null) { pageBuildId = data.buildId; return false; }
  if (data.buildId !== pageBuildId) { location.reload(); return true; }
  return false;
}

const ROUND_NAMES = {
  r32: '16-delsfinal',
  r16: 'Åttondelsfinal',
  qf: 'Kvartsfinal',
  sf: 'Semifinal',
  final: 'Final',
};

function makeRow(name) {
  const li = rowTemplate.content.firstElementChild.cloneNode(true);
  li.querySelector('.name').textContent = name;
  const detail = li.querySelector('.detail');
  detail.id = `detail-${rowsByName.size}`;
  const button = li.querySelector('.row-button');
  button.setAttribute('aria-controls', detail.id);
  button.addEventListener('click', () => {
    const open = detail.hidden;
    detail.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });
  return li;
}

// En statisk dt/dd-rad i detaljrutan.
function detailRow(label, points, sub) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = points;
  if (sub) {
    const span = document.createElement('span');
    span.className = 'subtle';
    span.textContent = ` · ${sub}`;
    dd.append(span);
  }
  return [dt, dd];
}

// En slutspelsrond i detaljrutan: dt/dd som vanligt, men klickbar (med
// utfällbar lag-lista) så snart minst ett lag kvalat in till ronden. Listan
// visar deltagarens gissningar – rätt lag i vit font, missade i grå.
function knockoutRoundNodes(li, p, data, key, label) {
  const r = p.breakdown.knockout.rounds[key];
  const facitTeams = data.facit.rounds?.[key] ?? [];
  const [dt, dd] = detailRow(label, `${r.points} p`, `${r.correct} rätt lag`);
  // Alla ronder är utfällbara (visar deltagarens gissningar), även de där inga
  // lag kvalat in än – då är alla gissningar grå tills lagen avgörs.

  const okey = `${p.name}:${key}`;
  const isOpen = openRounds.has(okey);
  dt.classList.add('ko-clickable');
  dt.dataset.open = isOpen ? 'true' : 'false';
  dt.setAttribute('role', 'button');
  dt.setAttribute('aria-expanded', String(isOpen));
  const toggle = async () => {
    if (openRounds.has(okey)) openRounds.delete(okey); else openRounds.add(okey);
    renderDetail(li, p, data);
    if (openRounds.has(okey) && !tipsLoaded) { await ensureTips(); renderDetail(li, p, data); }
  };
  dt.addEventListener('click', toggle);
  dd.classList.add('ko-clickable');
  dd.addEventListener('click', toggle);

  const panel = document.createElement('div');
  panel.className = 'ko-teams';
  panel.hidden = !isOpen;
  // Bygg lag-listan bara för öppnade ronder (liten mängd) – billigt per poll.
  if (isOpen) {
    // Alfabetisk ordning (för alla deltagare lika) gör listorna lätta att jämföra.
    const guesses = [...(knockoutByName?.[p.name]?.[key] ?? [])]
      .sort((a, b) => a.localeCompare(b, 'sv'));
    if (!tipsLoaded) {
      panel.textContent = 'Hämtar lag…';
    } else if (guesses.length === 0) {
      panel.textContent = 'Inga lag tippade.';
    } else {
      const facitSet = new Set(facitTeams.map(teamKey));
      for (const team of guesses) {
        const chip = document.createElement('span');
        chip.className = facitSet.has(teamKey(team)) ? 'ko-team ko-hit' : 'ko-team ko-miss';
        chip.textContent = team;
        panel.append(chip);
      }
    }
  }
  return [dt, dd, panel];
}

const shortDate = (iso) => {
  const parts = String(iso).split('-');
  return parts.length === 3 ? `${Number(parts[2])}/${Number(parts[1])}` : iso;
};

function matchItem(m, played) {
  const li = document.createElement('li');
  const date = document.createElement('span');
  date.className = 'match-date';
  date.textContent = shortDate(m.date);
  const teams = document.createElement('span');
  teams.className = 'match-teams';
  teams.textContent = `${m.home} – ${m.away}`;
  const figures = document.createElement('span');
  figures.className = 'match-figures';

  const hasTip = m.tipHome !== null && m.tipAway !== null;
  const tipText = hasTip ? `tips ${m.tipHome}–${m.tipAway}` : 'otippad';
  if (played) {
    const result = document.createElement('span');
    result.className = 'result';
    result.textContent = `${m.homeGoals}–${m.awayGoals}`;
    const tip = document.createElement('span');
    tip.className = 'tip';
    tip.textContent = ` · ${tipText}`;
    figures.append(result, tip);
    if (m.points !== null) {
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = ` +${m.points} p`;
      figures.append(pts);
    }
  } else {
    const tip = document.createElement('span');
    tip.className = 'tip';
    tip.textContent = tipText;
    figures.append(tip);
  }
  li.append(date, teams, figures);
  return li;
}

function renderMatchSection(li, selector, matches, played) {
  const section = li.querySelector(selector);
  section.hidden = matches.length === 0;
  section.querySelector('.match-list')
    .replaceChildren(...matches.map((m) => matchItem(m, played)));
}

// Top-3 "tvillingar" för en deltagare. Visas så fort tipsByPair finns
// (prefetchat efter första målning); annars förblir sektionen dold.
// Kommande (ej avgjorda) slutspelsmatcher med kända lag, kronologiskt. Beror
// inte på deltagare → räknas ut en gång per render (upcomingKoGames).
function computeUpcomingKo(facitRounds) {
  const out = [];
  for (const fx of KO_FIXTURES) {
    const next = KO_NEXT_ROUND[fx.ko];
    if (!next) continue;
    const decided = next === 'winner'
      ? new Set([facitRounds?.winner].filter(Boolean).map(teamKey))
      : new Set((facitRounds?.[next] ?? []).map(teamKey));
    if (!decided.has(teamKey(fx.home)) && !decided.has(teamKey(fx.away))) {
      out.push(fx);
      if (out.length >= 8) break; // de närmaste 8 räcker; håller korten korta
    }
  }
  return out;
}

// Nyligen avgjorda slutspelsmatcher (senaste först), med vinnaren (advancer).
function computeRecentKo(facitRounds) {
  const out = [];
  for (const fx of [...KO_FIXTURES].reverse()) {
    const next = KO_NEXT_ROUND[fx.ko];
    if (!next) continue;
    const decided = next === 'winner'
      ? new Set([facitRounds?.winner].filter(Boolean).map(teamKey))
      : new Set((facitRounds?.[next] ?? []).map(teamKey));
    const homeAdv = decided.has(teamKey(fx.home));
    const awayAdv = decided.has(teamKey(fx.away));
    if (!homeAdv && !awayAdv) continue; // ej avgjord
    out.push({ ...fx, next, advancer: homeAdv ? fx.home : fx.away });
    if (out.length >= 8) break;
  }
  return out;
}

function koupTeam(name, predicted) {
  const span = document.createElement('span');
  span.className = predicted ? 'koup-team koup-hit' : 'koup-team koup-miss';
  span.textContent = name;
  if (predicted) span.title = `${name} – din gissning vidare`;
  return span;
}

// Kommande slutspelsmatcher i deltagarkortet: lag deltagaren tippat vidare till
// nästa rond markeras (vit), övriga grått – så man ser om man har en häst i
// loppet. upcomingKoGames är delad; bara per-deltagare-markeringen är unik.
function renderKoUpcoming(li, name) {
  const section = li.querySelector('.ko-upcoming');
  if (!tipsLoaded || upcomingKoGames.length === 0) { section.hidden = true; return; }
  const ul = section.querySelector('.match-list');
  ul.replaceChildren(...upcomingKoGames.map((fx) => {
    const next = KO_NEXT_ROUND[fx.ko];
    const g = knockoutByName?.[name];
    const predList = g ? (next === 'winner' ? [g.winner].filter(Boolean) : (g[next] ?? [])) : [];
    const predSet = new Set(predList.map(teamKey));
    const item = document.createElement('li');
    item.className = 'koup-row';
    const date = document.createElement('span');
    date.className = 'match-date';
    date.textContent = shortDate(fx.date);
    const teams = document.createElement('span');
    teams.className = 'koup-teams';
    teams.append(
      koupTeam(fx.home, predSet.has(teamKey(fx.home))),
      document.createTextNode(' – '),
      koupTeam(fx.away, predSet.has(teamKey(fx.away))),
    );
    item.append(date, teams);
    return item;
  }));
  section.hidden = false;
}

// Senaste avgjorda slutspelsmatcher: vinnaren markeras (vit), och deltagarens
// poäng för matchen visas – +5p (10p inför final) om hen tippat vinnaren vidare,
// annars 0p.
function renderRecentKo(li, name) {
  const section = li.querySelector('.ko-recent');
  if (!tipsLoaded || recentKoGames.length === 0) { section.hidden = true; return; }
  const ul = section.querySelector('.match-list');
  ul.replaceChildren(...recentKoGames.map((fx) => {
    const g = knockoutByName?.[name];
    const predList = g ? (fx.next === 'winner' ? [g.winner].filter(Boolean) : (g[fx.next] ?? [])) : [];
    const gotIt = predList.map(teamKey).includes(teamKey(fx.advancer));
    const pts = fx.next === 'winner' ? 10 : 5;
    const item = document.createElement('li');
    item.className = 'koup-row';
    const date = document.createElement('span');
    date.className = 'match-date';
    date.textContent = shortDate(fx.date);
    const teams = document.createElement('span');
    teams.className = 'koup-teams';
    teams.append(
      koupTeam(fx.home, teamKey(fx.home) === teamKey(fx.advancer)),
      document.createTextNode(' – '),
      koupTeam(fx.away, teamKey(fx.away) === teamKey(fx.advancer)),
    );
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'koup-score';
    scoreSpan.textContent = koResultByPair.get(fx.pair) ?? '';
    const ptsSpan = document.createElement('span');
    ptsSpan.className = gotIt ? 'koup-pts koup-pts-hit' : 'koup-pts';
    ptsSpan.textContent = gotIt ? `+${pts}p` : '0p';
    item.append(date, teams, scoreSpan, ptsSpan);
    return item;
  }));
  section.hidden = false;
}

function renderDetail(li, p, data) {
  const dl = li.querySelector('.detail-grid');
  const nodes = [];
  nodes.push(...detailRow('Gruppspel', `${p.breakdown.group.points} p`,
    `${p.breakdown.group.scoredMatches} rättade matcher`));
  for (const [key, label] of Object.entries(ROUND_NAMES)) {
    nodes.push(...knockoutRoundNodes(li, p, data, key, label));
  }
  const winnerHit = p.breakdown.knockout.winnerPoints > 0;
  nodes.push(...detailRow(
    `VM-vinnare: ${p.winnerPick ?? '–'}`,
    `${p.breakdown.knockout.winnerPoints} p`,
    data.facit.winner ? (winnerHit ? 'rätt!' : 'fel') : 'ej avgjort',
  ));
  dl.replaceChildren(...nodes);
  renderMatchSection(li, '.match-recent', p.matches.recent, true);
  renderMatchSection(li, '.match-upcoming', p.matches.upcoming, false);
  renderRecentKo(li, p.name);
  renderKoUpcoming(li, p.name);
}

function renderRow(li, p, data) {
  li.dataset.rank = p.rank;
  li.classList.toggle('is-leader', p.rank === 1);
  li.querySelector('.rank-badge').textContent = p.rank;
  li.querySelector('.chip-group b').textContent = `${p.groupPoints} p`;
  li.querySelector('.chip-knockout b').textContent = `${p.knockoutPoints} p`;
  // Provisorisk live-poäng: när en match pågår räknas live-poängen IN i totalen,
  // men totalen själv pulsar inte – den står kvar i vanlig (vit) färg. Delta:t
  // visas i stället i den pulserande "Live"-kolumnen. Aldrig negativt – live
  // lägger bara till poäng för matcher arket ännu inte har.
  const lDelta = p.liveDelta ?? 0;
  const shownTotal = p.total + lDelta;
  li.querySelector('.total-value').textContent = shownTotal;
  const liveCol = li.querySelector('.live-col');
  if (lDelta > 0) {
    li.querySelector('.live-col-value').textContent = `+${lDelta}p`;
    liveCol.hidden = false;
  } else {
    liveCol.hidden = true;
  }
  li.classList.toggle('has-live', lDelta > 0);
  li.querySelector('.row-button').setAttribute('aria-label',
    `${p.name}, plats ${p.rank}, ${shownTotal} poäng${lDelta > 0 ? ` (varav ${lDelta} live)` : ''}. Visa detaljer.`);

  // Placeringsändring sedan föregående match. Servern levererar rankDelta
  // = (antal omkörda) − (antal som körde om mig), dvs strikt poängjämförelse
  // – delad placering räknas inte som omkörning. Pil bara om någon faktiskt
  // bytt poäng med någon annan. Under pågående match är placeringen preliminär,
  // så vi döljer både pilarna och topp 3-notiserna tills resultaten är klara.
  const liveActive = (data.live?.matches?.length ?? 0) > 0;
  const move = li.querySelector('.rank-move');
  const delta = liveActive ? 0 : (p.rankDelta ?? 0);
  if (delta === 0) {
    move.textContent = '';
    move.removeAttribute('data-dir');
  } else if (delta > 0) {
    move.textContent = `▲ ${delta}`;
    move.dataset.dir = 'up';
  } else {
    move.textContent = `▼ ${-delta}`;
    move.dataset.dir = 'down';
  }
  const top3 = li.querySelector('.chip-top3');
  if (liveActive || p.prevRank == null || p.prevRank === p.rank) {
    top3.hidden = true;
  } else if (p.rank <= 3 && p.prevRank > 3) {
    top3.textContent = 'Ny i topp 3';
    top3.className = 'chip chip-top3 chip-top3-in';
    top3.hidden = false;
  } else if (p.rank > 3 && p.prevRank <= 3) {
    top3.textContent = 'Ur topp 3';
    top3.className = 'chip chip-top3 chip-top3-out';
    top3.hidden = false;
  } else {
    top3.hidden = true;
  }

  const prevTotal = lastTotals.get(p.name);
  if (prevTotal !== undefined && prevTotal !== p.total) {
    li.classList.remove('points-flash');
    void li.offsetWidth; // starta om animationen
    li.classList.add('points-flash');
  }
  renderDetail(li, p, data);
}

// Färger per segment. Ledaren får guld för att matcha temat; övriga en
// kurerad palett, med HSL-fallback om fler lag tippats än paletten räcker till.
const WINNER_COLORS = [
  '#d4a017', '#1f9d55', '#3b82f6', '#e0567a', '#8b5cf6', '#06b6d4',
  '#f97316', '#ef4444', '#14b8a6', '#a855f7', '#ec4899', '#84cc16',
];
const winnerColor = (i) => WINNER_COLORS[i] ?? `hsl(${(i * 137.5) % 360} 62% 52%)`;

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs) => {
  const el = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// VM-vinnar-konsensus: aggregera deltagarnas vinnar-tips och visa som
// donutdiagram med teckenförklaring. Datan finns redan i /api/standings →
// ingen extra hämtning, ingen påverkan på första målning.
function renderWinnerConsensus(participants) {
  const section = document.getElementById('winner-consensus');
  if (!section) return;
  const byTeam = new Map();
  for (const p of participants) {
    if (!p.winnerPick) continue;
    let pickers = byTeam.get(p.winnerPick);
    if (!pickers) byTeam.set(p.winnerPick, pickers = []);
    pickers.push(p.name);
  }
  if (byTeam.size === 0) { section.hidden = true; return; }
  const teams = [...byTeam.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'sv'));
  const total = teams.reduce((sum, [, pickers]) => sum + pickers.length, 0);

  // Donut via stroke-dasharray. r vald så omkretsen blir 100 → andelar i %.
  const R = 15.91549431;
  const wrap = document.createElement('div');
  wrap.className = 'winner-donut-wrap';
  const svg = svgEl('svg', { class: 'winner-donut', viewBox: '0 0 42 42', 'aria-hidden': 'true' });
  svg.append(svgEl('circle', {
    class: 'winner-donut-bg', cx: 21, cy: 21, r: R, fill: 'none', 'stroke-width': 5,
  }));
  let offset = 0;
  teams.forEach(([, pickers], i) => {
    const pct = (pickers.length / total) * 100;
    svg.append(svgEl('circle', {
      cx: 21, cy: 21, r: R, fill: 'none', stroke: winnerColor(i), 'stroke-width': 5,
      'stroke-dasharray': `${pct} ${100 - pct}`, 'stroke-dashoffset': 25 - offset,
    }));
    offset += pct;
  });
  const center = document.createElement('div');
  center.className = 'winner-donut-center';
  const big = document.createElement('strong');
  big.textContent = String(total);
  const cap = document.createElement('span');
  cap.textContent = 'tips';
  center.append(big, cap);
  wrap.append(svg, center);

  const legend = document.createElement('ul');
  legend.className = 'winner-legend';
  teams.forEach(([team, pickers], i) => {
    const li = document.createElement('li');
    li.className = 'winner-legend-row';
    const sw = document.createElement('span');
    sw.className = 'winner-swatch';
    sw.style.background = winnerColor(i);
    const tn = document.createElement('span');
    tn.className = 'winner-team';
    tn.textContent = team;
    const cnt = document.createElement('span');
    cnt.className = 'winner-count';
    cnt.textContent = String(pickers.length);
    const names = document.createElement('span');
    names.className = 'winner-names';
    names.textContent = pickers.join(' · ');
    li.append(sw, tn, cnt, names);
    legend.append(li);
  });

  const chart = section.querySelector('.winner-chart');
  chart.replaceChildren(wrap, legend);
  section.hidden = false;
}

function flipReorder(orderedRows) {
  const before = new Map(
    [...board.children].map((el) => [el, el.getBoundingClientRect().top]),
  );
  board.replaceChildren(...orderedRows);
  for (const el of orderedRows) {
    const prevTop = before.get(el);
    if (prevTop === undefined) continue;
    const delta = prevTop - el.getBoundingClientRect().top;
    if (!delta) continue;
    el.classList.remove('flip');
    el.style.transform = `translateY(${delta}px)`;
    void el.offsetWidth;
    el.classList.add('flip');
    el.style.transform = '';
  }
}

function render(data) {
  if (checkBuildChange(data)) return; // ny deploy upptäckt – reload pågår
  // En gång per render (delas av alla kort): kommande/senaste slutspelsmatcher.
  upcomingKoGames = computeUpcomingKo(data.facit.rounds);
  recentKoGames = computeRecentKo(data.facit.rounds);
  const ordered = data.participants.map((p) => {
    let li = rowsByName.get(p.name);
    if (!li) {
      li = makeRow(p.name);
      rowsByName.set(p.name, li);
    }
    renderRow(li, p, data);
    return li;
  });
  flipReorder(ordered);
  for (const p of data.participants) lastTotals.set(p.name, p.total);

  renderWinnerConsensus(data.participants);

  pointsProgressEl.textContent = `${data.facit.pointsAtStake} poäng av ${data.facit.pointsTotal} poäng totalt`;
  renderKnockoutPanel(data.facit);
  const results = data.facit.results ?? [];
  const scoreByPair = new Map(results.map((m) => [
    `${teamKey(m.home)}|${teamKey(m.away)}`,
    `${m.homeGoals}–${m.awayGoals}`,
  ]));
  lastResultByPair = new Map(results.map((m) => [
    `${teamKey(m.home)}|${teamKey(m.away)}`,
    { h: m.homeGoals, a: m.awayGoals },
  ]));
  liveByPair = new Map((data.live?.matches ?? []).map((m) => [m.pair, m]));
  koResultByPair = new Map((data.koResults ?? []).map((m) => [m.pair, `${m.homeGoals}–${m.awayGoals}`]));
  renderSchedule(scoreByPair);
  // Klienttid — synkar visning med faktisk poll-cykel även när servern inte
  // har räknat om sin payload mellan två polls.
  lastUpdatedAt = new Date();
  updateFailed = false;
  renderUpdatedAt();

  const undecided = data.facit.advancement?.thirds?.undecided;
  const missing = data.participants.filter((p) => p.missingTab).map((p) => p.name);
  const notices = [];
  if (undecided) {
    notices.push(`16-delsfinal: ${undecided.slots} tredjeplats(er) ej fastställda `
      + `(${undecided.candidates.join(', ')}).`);
  }
  if (missing.length) notices.push(`Hittar ingen flik för: ${missing.join(', ')}.`);
  noticeEl.textContent = notices.join(' ');
  noticeEl.hidden = notices.length === 0;
}

async function poll() {
  try {
    const res = await fetch('/api/standings', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    pollSeconds = data.clientPollSeconds || pollSeconds;
    render(data);
  } catch {
    updateFailed = true;
    if (!lastUpdatedAt) updatedAtEl.textContent = 'Kunde inte hämta ställningen, försöker igen…';
  } finally {
    // Sätt nextPollAt och scheduleNextPoll i samma andetag så displayens
    // nedräkning är exakt synkad med när poll() faktiskt återfyrar. Starta
    // även om ticken så dess sekund-boundaries alignar med poll-cykeln.
    const delay = pollSeconds * 1000;
    nextPollAt = Date.now() + delay;
    setTimeout(poll, delay);
    renderUpdatedAt();
    restartUpdateTimer();
  }
}

// Servern bakar in aktuell ställning i sidan – rendera den direkt så att
// första målningen har data, och polla sedan som vanligt.
if (window.__INITIAL_STANDINGS__) {
  try {
    render(window.__INITIAL_STANDINGS__);
  } catch {
    // trasig/inaktuell inbakad data – pollningen tar över
  }
}
poll();
