# Final Celebration Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the World Cup winner is set in the sheet, open a celebration modal on the standings page showing a podium (top 3) plus the rest of the participants, with confetti.

**Architecture:** Pure client-side, keyed off `payload.facit.winner`. New `renderFinalCelebration(data)` called from the existing `render(data)` in `public/app.js`. Stateless: no `localStorage` / `sessionStorage`; only a module-level "closed this session" flag. Confetti is a small hand-rolled canvas animation, no dependencies. No server, no tests — pure UI on data already in the payload.

**Tech Stack:** Vanilla JS + CSS in `public/app.js` and `public/style.css`. Manual browser verification.

**Spec:** `docs/superpowers/specs/2026-07-15-final-celebration-design.md`

---

## File Structure

- `public/style.css` — new section at the end of the file with all `.final-*` classes (modal, backdrop, podium, rest list, pill button, confetti canvas positioning, animations). Mobile-first, desktop overrides under the existing `@media (min-width: 600px)` breakpoint. Uses existing color tokens (`--gold`, `--silver`, `--bronze`, `--surface`, `--ink`).
- `public/app.js` — new section (added near the end, before the `render` function or after it, but above the `poll()`+init block). Contains:
  - Module state: `let finalClosedThisSession = false;` and `let finalConfettiRaf = null;`.
  - Helpers: `podiumGroups(participants)`, `openConfetti(canvas)`, `stopConfetti()`.
  - `renderFinalCelebration(data)` — the single entry point called from `render(data)`.
  - Event handlers wired inline when the modal is constructed.
- `public/index.html` — unchanged. The modal DOM is created imperatively by `renderFinalCelebration` and appended to `document.body`.

No new files. No server changes. No tests.

---

## Task 1: Add CSS for modal, podium, rest list, and pill button

**Files:**
- Modify: `public/style.css` (append new section at end of file)

- [ ] **Step 1: Append the celebration CSS**

Add this at the end of `public/style.css`:

```css
/* --------------------------------------------------------------------
   Slutfirande — modal med podium (topp 3) och resten av deltagarna.
   Renderas av renderFinalCelebration() när facit.winner är satt.
   -------------------------------------------------------------------- */

.final-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.62);
  z-index: 1000;
  display: flex;
  align-items: stretch;
  justify-content: center;
  animation: final-fade 220ms ease-out both;
}

.final-modal {
  position: relative;
  width: 100%;
  background: var(--surface);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  overflow: auto;
  box-shadow: var(--shadow);
}

.final-modal-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(180deg, var(--surface), var(--surface-2));
  border-bottom: 1px solid var(--line);
  z-index: 1;
}

.final-title {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--ink);
}

.final-close {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  font-size: 1.4rem;
  line-height: 1;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 6px;
}
.final-close:hover, .final-close:focus-visible {
  background: rgba(0, 0, 0, 0.08);
  color: var(--ink);
  outline: none;
}

.final-podium {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: end;
  gap: 8px;
  padding: 24px 16px 8px;
  min-height: 220px;
}

.final-podium-bar {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 10px 6px 12px;
  border-radius: 10px 10px 0 0;
  color: #1a1a1a;
  text-align: center;
  min-height: 90px;
  font-weight: 600;
  overflow: hidden;
}

.final-podium-bar.gold   { background: linear-gradient(180deg, #fde68a, var(--gold));   min-height: 200px; }
.final-podium-bar.silver { background: linear-gradient(180deg, #e5e7eb, var(--silver)); min-height: 150px; }
.final-podium-bar.bronze { background: linear-gradient(180deg, #fed7aa, var(--bronze)); min-height: 110px; color: #fff; }

.final-podium-medal { font-size: 1.6rem; line-height: 1; margin-bottom: 4px; }
.final-podium-names { display: flex; flex-direction: column; gap: 2px; }
.final-podium-name  { font-size: 0.95rem; }
.final-podium-rank  { font-size: 0.75rem; opacity: 0.85; letter-spacing: 0.04em; }
.final-podium-total { font-size: 0.85rem; opacity: 0.9; margin-top: 2px; }

.final-podium-bar.gold::after {
  content: "";
  position: absolute;
  inset: -20% -20% 40% -20%;
  background: radial-gradient(circle at 50% 60%, rgba(255, 255, 255, 0.55), transparent 60%);
  animation: final-sparkle 3.2s ease-in-out infinite;
  pointer-events: none;
}

.final-rest {
  padding: 12px 16px 20px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.final-rest-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 4px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font-size: 0.95rem;
}
.final-rest-row:last-child { border-bottom: 0; }
.final-rest-name  { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.final-rest-rank  { color: var(--ink-soft); min-width: 2ch; text-align: right; }
.final-rest-total { color: var(--ink-soft); font-variant-numeric: tabular-nums; }

.final-confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.final-pill {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 999;
  appearance: none;
  border: 0;
  background: var(--gold);
  color: #1a1a1a;
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 999px;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.final-pill:hover, .final-pill:focus-visible {
  filter: brightness(1.05);
  outline: none;
}

@keyframes final-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes final-sparkle {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50%      { opacity: 0.75; transform: scale(1.06); }
}

@media (prefers-reduced-motion: reduce) {
  .final-backdrop { animation: none; }
  .final-podium-bar.gold::after { animation: none; opacity: 0.4; }
}

@media (min-width: 600px) {
  .final-backdrop {
    align-items: center;
    padding: 24px;
  }
  .final-modal {
    max-width: 520px;
    border-radius: 14px;
    max-height: calc(100vh - 48px);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/style.css
git commit -m "Add CSS for final celebration modal, podium, and pill"
```

---

## Task 2: Add DOM builder and dismiss/reopen wiring in app.js

**Files:**
- Modify: `public/app.js` — append a new section just above the `if (window.__INITIAL_STANDINGS__)` block at the very end of the file.

- [ ] **Step 1: Append the module-level state and helpers**

Add the following at the end of `public/app.js`, before the `if (window.__INITIAL_STANDINGS__)` block:

```javascript
// --------------------------------------------------------------------
// Slutfirande — modal med podium + resten av deltagarna. Nyckelvillkor:
// payload.facit.winner är satt. Stateless: ingen storage, bara en session-
// flagga som nollställs om winner går tillbaka till null.
// --------------------------------------------------------------------

let finalClosedThisSession = false;
let finalConfettiRaf = null;
let finalLastWinner = null;

// Grupperar deltagare per rank så att delade placeringar (t.ex. två delade
// första) hamnar på samma stapel. Returnerar en Array av { rank, names, total }
// sorterad efter rank.
function podiumGroups(participants) {
  const byRank = new Map();
  for (const p of participants) {
    const list = byRank.get(p.rank) ?? [];
    list.push(p);
    byRank.set(p.rank, list);
  }
  return [...byRank.keys()]
    .sort((a, b) => a - b)
    .map((rank) => {
      const group = byRank.get(rank);
      return { rank, names: group.map((g) => g.name), total: group[0].total };
    });
}

// Kompakt konfetti: ~60 partiklar med gravitation, rotation. Ritas i
// canvas-elementet som skickas in; stannar av sig själv efter ~1.6s.
function openConfetti(canvas) {
  stopConfetti();
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.scale(dpr, dpr);

  const colors = ['#d4a017', '#9aa3ad', '#b06d3f', '#1f9d55', '#f59e0b', '#ffffff'];
  const particles = Array.from({ length: 60 }, () => ({
    x: rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.4,
    y: rect.height * 0.35 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 6,
    vy: -Math.random() * 6 - 2,
    r: 3 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    life: 0,
  }));

  const start = performance.now();
  const durationMs = 1600;
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const p of particles) {
      p.vy += 0.18; // gravitation
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
      ctx.restore();
    }
    if (t < durationMs) {
      finalConfettiRaf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
      finalConfettiRaf = null;
    }
  }
  finalConfettiRaf = requestAnimationFrame(frame);
}

function stopConfetti() {
  if (finalConfettiRaf != null) {
    cancelAnimationFrame(finalConfettiRaf);
    finalConfettiRaf = null;
  }
}

function closeFinalModal() {
  finalClosedThisSession = true;
  stopConfetti();
  document.getElementById('final-backdrop')?.remove();
  ensureFinalPill();
}

function ensureFinalPill() {
  if (document.getElementById('final-pill')) return;
  const btn = document.createElement('button');
  btn.id = 'final-pill';
  btn.type = 'button';
  btn.className = 'final-pill';
  btn.textContent = '🏆 Slutresultat';
  btn.addEventListener('click', () => {
    finalClosedThisSession = false;
    document.getElementById('final-pill')?.remove();
    if (lastData) renderFinalCelebration(lastData);
  });
  document.body.appendChild(btn);
}

function buildFinalModal(data) {
  const backdrop = document.createElement('div');
  backdrop.id = 'final-backdrop';
  backdrop.className = 'final-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeFinalModal();
  });

  const modal = document.createElement('div');
  modal.className = 'final-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'final-title');

  const header = document.createElement('div');
  header.className = 'final-modal-header';
  const title = document.createElement('div');
  title.id = 'final-title';
  title.className = 'final-title';
  title.textContent = '🏆 VM-tipset 2026 – Slutresultat 🏆';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'final-close';
  close.setAttribute('aria-label', 'Stäng');
  close.textContent = '✕';
  close.addEventListener('click', closeFinalModal);
  header.append(title, close);

  const podium = document.createElement('div');
  podium.className = 'final-podium';
  const canvas = document.createElement('canvas');
  canvas.className = 'final-confetti';
  podium.appendChild(canvas);

  const groups = podiumGroups(data.participants ?? []);
  const top3 = groups.slice(0, 3);
  const medalClass = ['gold', 'silver', 'bronze'];
  const medalEmoji = ['🥇', '🥈', '🥉'];
  // Rendera i visuell ordning: silver, guld, brons (guld i mitten, högst).
  const visualOrder = [1, 0, 2];
  for (const idx of visualOrder) {
    const g = top3[idx];
    if (!g) {
      const filler = document.createElement('div');
      podium.appendChild(filler);
      continue;
    }
    const bar = document.createElement('div');
    bar.className = `final-podium-bar ${medalClass[idx]}`;
    const medal = document.createElement('div');
    medal.className = 'final-podium-medal';
    medal.textContent = medalEmoji[idx];
    const rank = document.createElement('div');
    rank.className = 'final-podium-rank';
    rank.textContent = g.names.length > 1 ? `=${g.rank}` : `${g.rank}`;
    const names = document.createElement('div');
    names.className = 'final-podium-names';
    for (const n of g.names) {
      const nm = document.createElement('div');
      nm.className = 'final-podium-name';
      nm.textContent = n;
      names.appendChild(nm);
    }
    const total = document.createElement('div');
    total.className = 'final-podium-total';
    total.textContent = `${g.total} p`;
    bar.append(medal, rank, names, total);
    podium.appendChild(bar);
  }

  const rest = document.createElement('div');
  rest.className = 'final-rest';
  const restParticipants = (data.participants ?? []).filter((p) => p.rank >= 4);
  for (const p of restParticipants) {
    const row = document.createElement('div');
    row.className = 'final-rest-row';
    const nameCell = document.createElement('span');
    nameCell.className = 'final-rest-name';
    const rankSpan = document.createElement('span');
    rankSpan.className = 'final-rest-rank';
    rankSpan.textContent = `${p.rank}.`;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameCell.append(rankSpan, nameSpan);
    const totalCell = document.createElement('span');
    totalCell.className = 'final-rest-total';
    totalCell.textContent = `${p.total} p`;
    row.append(nameCell, totalCell);
    rest.appendChild(row);
  }

  modal.append(header, podium, rest);
  backdrop.appendChild(modal);
  return { backdrop, canvas, close };
}

function renderFinalCelebration(data) {
  const winner = data?.facit?.winner ?? null;

  // Nollställ session-flaggan om vinnaren rensas — så modalen dyker upp igen
  // om vinnaren återinsätts.
  if (winner == null && finalLastWinner != null) {
    finalClosedThisSession = false;
  }
  finalLastWinner = winner;

  if (winner == null) {
    document.getElementById('final-backdrop')?.remove();
    document.getElementById('final-pill')?.remove();
    stopConfetti();
    return;
  }

  if (finalClosedThisSession) {
    ensureFinalPill();
    return;
  }

  document.getElementById('final-backdrop')?.remove();
  document.getElementById('final-pill')?.remove();

  const { backdrop, canvas, close } = buildFinalModal(data);
  document.body.appendChild(backdrop);
  close.focus();

  // ESC stänger modalen. Lyssnaren tas bort när modalen stängs.
  const onKey = (e) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      closeFinalModal();
    }
  };
  window.addEventListener('keydown', onKey);

  requestAnimationFrame(() => openConfetti(canvas));
}
```

- [ ] **Step 2: Commit**

```bash
git add public/app.js
git commit -m "Add final celebration modal builder and confetti in app.js"
```

---

## Task 3: Wire renderFinalCelebration into the render pipeline

**Files:**
- Modify: `public/app.js` (`render(data)` at line ~1800)

- [ ] **Step 1: Add the call at the end of render()**

Locate the `render(data)` function (around line 1800) and add a call to `renderFinalCelebration(data)` as the LAST statement inside `render`, immediately after the `noticeEl` block:

Change:

```javascript
  if (missing.length) notices.push(`Hittar ingen flik för: ${missing.join(', ')}.`);
  noticeEl.textContent = notices.join(' ');
  noticeEl.hidden = notices.length === 0;
}
```

To:

```javascript
  if (missing.length) notices.push(`Hittar ingen flik för: ${missing.join(', ')}.`);
  noticeEl.textContent = notices.join(' ');
  noticeEl.hidden = notices.length === 0;

  renderFinalCelebration(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/app.js
git commit -m "Call renderFinalCelebration from render()"
```

---

## Task 4: Manual verification in the browser

**Files:** none modified.

The feature has no automated tests (per the spec). Verify manually by simulating the winner being set.

- [ ] **Step 1: Start the dev server**

```bash
SHEET_ID=1NlUCIKlLgaWAmGq4UKAcCAvzuwwKdMGLkDiWh7ZFoeY npm start
```

Then open http://localhost:3000. There should be NO modal yet (facit.winner is null since the tournament isn't over).

- [ ] **Step 2: Force a winner in the browser to see the modal**

Open DevTools → Console on http://localhost:3000 and run:

```javascript
const fake = JSON.parse(JSON.stringify(lastData));
fake.facit.winner = 'Frankrike';
render(fake);
```

Verify:
- Modal opens with `🏆 VM-tipset 2026 – Slutresultat 🏆` in header.
- Podium is visible with the three medal bars (silver on the left, gold in the middle and tallest, bronze on the right). Each shows medal emoji, rank, name(s), total points.
- Confetti fires briefly (~1.6s) inside the podium area, then stops.
- Below the podium: the rest of the participants (rank 4+), one row each, `N. Namn — Xp`.
- Backdrop dims the page behind.

- [ ] **Step 3: Verify close and reopen**

Click the ✕ button. Verify:
- Modal closes.
- A small `🏆 Slutresultat` pill appears in the bottom-right corner.

Click the pill. Verify:
- Modal reopens.
- Confetti fires again.

Press ESC while modal is open. Verify:
- Modal closes.

Click on the backdrop (outside the modal). Verify:
- Modal closes.

- [ ] **Step 4: Verify null → non-null → null transitions**

In the console:

```javascript
const clear = JSON.parse(JSON.stringify(lastData));
clear.facit.winner = null;
render(clear);
```

Verify:
- Modal closes.
- Pill button disappears.

Then re-set:

```javascript
const back = JSON.parse(JSON.stringify(lastData));
back.facit.winner = 'Frankrike';
render(back);
```

Verify:
- Modal reappears (session flag was reset when winner went to null).

- [ ] **Step 5: Verify mobile layout**

Resize the browser to a narrow width (≤ 599px) or use DevTools device toolbar. Re-run the fake winner assignment. Verify:
- Modal fills the viewport edge-to-edge.
- Header is sticky at the top while scrolling.
- Podium and rest list stack correctly; the whole modal scrolls if there are many participants.

- [ ] **Step 6: Verify keyboard focus**

With the modal open, tab through elements. Verify focus lands on ✕ initially (already required in Step 2).

- [ ] **Step 7: Report back**

If any of the checks fail, note what went wrong. Otherwise, we're done — the feature is ready to ship.
