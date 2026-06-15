// Pollar /api/standings och uppdaterar tavlan mjukt: rader återanvänds per
// namn (ingen blink), omsortering animeras med FLIP och poängändringar
// blinkar till.

const board = document.getElementById('board');
const rowTemplate = document.getElementById('row-template');
const updatedAtEl = document.getElementById('updated-at');
const progressEl = document.getElementById('match-progress');
const noticeEl = document.getElementById('notice');
const schedEl = document.getElementById('sched');
const schedDaysEl = document.getElementById('sched-days');
const schedMoreEl = document.getElementById('sched-more');
const schedLessEl = document.getElementById('sched-less');
const schedShowEl = document.getElementById('sched-show');

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

const DAYS_PER_CLICK = 2;   // antal extra matchdagar per "Visa fler"-klick
let extraDays = 0;          // utökar fönstrets bakre kant framåt
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
schedLessEl.addEventListener('click', () => {
  extraDays = 0;
  renderSchedule(lastScoreByPair);
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
let tipsLoaded = false;
let tipsPromise = null;
let openPair = null;

async function ensureTips() {
  if (tipsLoaded) return;
  if (!tipsPromise) {
    tipsPromise = fetch('/api/match-tips', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        tipsByPair = new Map(Object.entries(d.tipsByPair ?? {}));
        tipsLoaded = true;
      })
      .catch((err) => { console.error('match-tips:', err.message); })
      .finally(() => { tipsPromise = null; });
  }
  return tipsPromise;
}

// Säkert DOM-id från pair-nyckeln (lagnamn kan innehålla mellanslag, accenter, |).
const pairId = (p) => 'tips-' + p.replace(/[^a-z0-9]/gi, '_');

// Kontroversmätare: stapelfördelning 1/X/2 i poolen för den aktuella matchen.
function consensusMeter(fx, total, h, d, a) {
  const wrap = document.createElement('div');
  wrap.className = 'sg-consensus';
  const head = document.createElement('div');
  head.className = 'sg-consensus-h';
  head.textContent = 'Poolens fördelning';
  wrap.append(head);

  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const bar = (label, count, outcome) => {
    const row = document.createElement('div');
    row.className = 'sg-consensus-bar';
    row.dataset.outcome = outcome;
    const lbl = document.createElement('span');
    lbl.className = 'sg-consensus-label';
    lbl.textContent = label;
    const track = document.createElement('span');
    track.className = 'sg-consensus-track';
    const fill = document.createElement('span');
    fill.className = 'sg-consensus-fill';
    fill.style.width = `${pct(count)}%`;
    track.append(fill);
    const val = document.createElement('span');
    val.className = 'sg-consensus-val';
    val.textContent = `${pct(count)}% (${count})`;
    row.append(lbl, track, val);
    return row;
  };

  wrap.append(bar(fx.home, h, 'home'), bar('Oavgjort', d, 'draw'), bar(fx.away, a, 'away'));
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
  const addGroup = (label, list) => {
    if (list.length === 0) return;
    const h = document.createElement('h4');
    h.className = 'sg-tips-h';
    h.textContent = `${label} (${list.length})`;
    inner.append(h);
    const ul = document.createElement('ul');
    ul.className = 'sg-tips-list';
    for (const t of list) {
      const item = document.createElement('li');
      const nm = document.createElement('span');
      nm.textContent = t.name;
      const sc = document.createElement('span');
      sc.className = 'sg-tips-score';
      sc.textContent = `${t.h}–${t.a}`;
      item.append(nm, sc);
      ul.append(item);
    }
    inner.append(ul);
  };
  addGroup(`Seger för ${fx.home}`, homeWin);
  addGroup('Oavgjort', draw);
  addGroup(`Seger för ${fx.away}`, awayWin);
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

async function toggleTips(fx, row, panel, inner) {
  if (openPair === fx.pair) { closeOpenTips(); return; }
  closeOpenTips();
  // Optimistiskt öppna direkt så klicket känns instant – panelen visar
  // "Hämtar tips…" om prefetchen inte hunnit klart.
  renderTipsInto(inner, fx);
  panel.dataset.open = 'true';
  row.setAttribute('aria-expanded', 'true');
  openPair = fx.pair;
  if (!tipsLoaded) {
    await ensureTips();
    if (openPair === fx.pair) renderTipsInto(inner, fx);
  }
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

  // Gruppmatcher (med pair) är klickbara — bygg som <button>. Slutspels-
  // platshållare (bara title) är icke-interaktiva div:ar.
  const row = document.createElement(fx.pair ? 'button' : 'div');
  row.className = 'sg-row';
  if (fx.pair) row.type = 'button';

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
  if (score) {
    const sc = document.createElement('span');
    sc.className = 'sg-score';
    sc.textContent = score;
    meta.append(sc);
  }
  meta.append(tvBadge(fx.ch));

  row.append(time, title, meta);
  li.append(row);

  if (fx.pair) {
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
    if (isOpen) renderTipsInto(inner, fx);

    row.addEventListener('click', () => toggleTips(fx, row, panel, inner));
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
    s += `\n${fx.time}|${fx.pair ?? fx.title ?? ''}|${score}|${fx.note ?? ''}|${fx.ch}`;
  }
  return s;
}

// Fyll (eller uppdatera) ett dagblock på plats – elementets identitet behålls,
// så att en poll-uppdatering av resultat inte triggar någon in-animation.
function fillDayContent(block, day, fixtures, scoreByPair, past, current) {
  const sig = daySig(day, fixtures, scoreByPair, past, current);
  if (block._sig === sig) return;
  block._sig = sig;
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
  list.append(...fixtures.map((fx) => gameRow(fx, scoreByPair)));

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

  const startIdx = idxs[0];
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
    if (animate) animateOut(el); else el.remove();
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
  schedLessEl.hidden = extraDays === 0;
  schedReady = true;
}

const rowsByName = new Map();   // namn → li-element
const lastTotals = new Map();   // namn → total från förra svaret
let pollSeconds = 5;
let lastUpdatedAt = null;

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

function detailRows(p, facitWinner) {
  const rows = [];
  rows.push(['Gruppspel', `${p.breakdown.group.points} p`,
    `${p.breakdown.group.scoredMatches} rättade matcher`]);
  for (const [key, label] of Object.entries(ROUND_NAMES)) {
    const r = p.breakdown.knockout.rounds[key];
    rows.push([label, `${r.points} p`, `${r.correct} rätt lag`]);
  }
  const winnerHit = p.breakdown.knockout.winnerPoints > 0;
  rows.push([
    `VM-vinnare: ${p.winnerPick ?? '–'}`,
    `${p.breakdown.knockout.winnerPoints} p`,
    facitWinner ? (winnerHit ? 'rätt!' : 'fel') : 'ej avgjort',
  ]);
  return rows;
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

function renderDetail(li, p, facitWinner) {
  const dl = li.querySelector('.detail-grid');
  dl.replaceChildren(...detailRows(p, facitWinner).flatMap(([label, points, sub]) => {
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
  }));
  renderMatchSection(li, '.match-recent', p.matches.recent, true);
  renderMatchSection(li, '.match-upcoming', p.matches.upcoming, false);
}

function renderRow(li, p, data) {
  li.dataset.rank = p.rank;
  li.classList.toggle('is-leader', p.rank === 1);
  li.querySelector('.rank-badge').textContent = p.rank;
  li.querySelector('.chip-group b').textContent = `${p.groupPoints} p`;
  li.querySelector('.chip-knockout b').textContent = `${p.knockoutPoints} p`;
  li.querySelector('.total-value').textContent = p.total;
  li.querySelector('.row-button').setAttribute('aria-label',
    `${p.name}, plats ${p.rank}, ${p.total} poäng. Visa detaljer.`);

  const prevTotal = lastTotals.get(p.name);
  if (prevTotal !== undefined && prevTotal !== p.total) {
    li.classList.remove('points-flash');
    void li.offsetWidth; // starta om animationen
    li.classList.add('points-flash');
  }
  renderDetail(li, p, data.facit.winner);
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

  progressEl.textContent = `${data.facit.playedMatches} av ${data.facit.totalMatches} gruppspelsmatcher spelade`;
  const scoreByPair = new Map(
    (data.facit.results ?? []).map((m) => [
      `${teamKey(m.home)}|${teamKey(m.away)}`,
      `${m.homeGoals}–${m.awayGoals}`,
    ]),
  );
  renderSchedule(scoreByPair);
  lastUpdatedAt = new Date(data.updatedAt);
  updatedAtEl.textContent = `Senast uppdaterad ${lastUpdatedAt.toLocaleTimeString('sv-SE')}`;

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
    if (lastUpdatedAt) {
      updatedAtEl.textContent =
        `Senast uppdaterad ${lastUpdatedAt.toLocaleTimeString('sv-SE')} (uppdatering misslyckades, försöker igen…)`;
    } else {
      updatedAtEl.textContent = 'Kunde inte hämta ställningen, försöker igen…';
    }
  } finally {
    setTimeout(poll, pollSeconds * 1000);
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
