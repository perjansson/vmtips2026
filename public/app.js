// Pollar /api/standings och uppdaterar tavlan mjukt: rader återanvänds per
// namn (ingen blink), omsortering animeras med FLIP, poängändringar blinkar
// till och placeringsbyten får ▲/▼.

const board = document.getElementById('board');
const rowTemplate = document.getElementById('row-template');
const updatedAtEl = document.getElementById('updated-at');
const progressEl = document.getElementById('match-progress');
const noticeEl = document.getElementById('notice');

const rowsByName = new Map();   // namn → li-element
const lastSeen = new Map();     // namn → { rank, total } från förra svaret
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

  const move = li.querySelector('.move');
  const prev = lastSeen.get(p.name);
  if (prev && prev.rank !== p.rank) {
    const up = p.rank < prev.rank;
    move.textContent = up ? '▲' : '▼';
    move.className = `move ${up ? 'up' : 'down'}`;
  }
  if (prev && prev.total !== p.total) {
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
  for (const p of data.participants) lastSeen.set(p.name, { rank: p.rank, total: p.total });

  progressEl.textContent = `${data.facit.playedMatches} av ${data.facit.totalMatches} matcher spelade`;
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

poll();
