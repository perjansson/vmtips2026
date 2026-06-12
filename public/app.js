// Pollar /api/standings och uppdaterar tavlan mjukt: rader återanvänds per
// namn (ingen blink), omsortering animeras med FLIP och poängändringar
// blinkar till.

const board = document.getElementById('board');
const rowTemplate = document.getElementById('row-template');
const updatedAtEl = document.getElementById('updated-at');
const progressEl = document.getElementById('match-progress');
const noticeEl = document.getElementById('notice');
const playedEl = document.getElementById('played');
const playedListEl = document.getElementById('played-list');
const playedToggleEl = document.getElementById('played-toggle');

const PLAYED_PREVIEW = 5;
let showAllPlayed = false;

playedToggleEl.addEventListener('click', () => {
  showAllPlayed = !showAllPlayed;
  renderPlayed(lastResults);
});

let lastResults = [];

// Senast spelade matcher (facit) i headern: 5 visas, resten bakom en toggle.
function renderPlayed(results) {
  lastResults = results;
  playedEl.hidden = results.length === 0;
  if (results.length === 0) return;

  const visible = showAllPlayed ? results : results.slice(0, PLAYED_PREVIEW);
  playedListEl.replaceChildren(...visible.map((m) => {
    const li = document.createElement('li');
    const date = document.createElement('span');
    date.className = 'pd';
    date.textContent = shortDate(m.date);
    const teams = document.createElement('span');
    teams.className = 'pt';
    teams.textContent = `${m.home} – ${m.away}`;
    const score = document.createElement('span');
    score.className = 'ps';
    score.textContent = `${m.homeGoals}–${m.awayGoals}`;
    li.append(date, teams, score);
    return li;
  }));

  const hasMore = results.length > PLAYED_PREVIEW;
  playedToggleEl.hidden = !hasMore;
  if (hasMore) {
    playedToggleEl.textContent = showAllPlayed
      ? 'Visa färre'
      : `Visa alla ${results.length} spelade matcher`;
    playedToggleEl.setAttribute('aria-expanded', String(showAllPlayed));
  }
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

  progressEl.textContent = `${data.facit.playedMatches} av ${data.facit.totalMatches} matcher spelade`;
  renderPlayed(data.facit.results ?? []);
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
