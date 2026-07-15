# VM-tipset 2026 – Slutresultat-firande

Design för hur sidan avslutar turneringen: en modal som firar puljvinnaren
(#1), silver (#2) och brons (#3) med podium och konfetti, och listar alla
övriga deltagare därunder. Trigger är att `facit.winner` har ett värde;
tas det bort försvinner firandet igen. Ingen persistens.

## Mål

- Ge en tydlig och glad avslutning på tipset så fort VM-vinnaren är känd.
- Lyfta topp 3 som podium, men samtidigt ha med alla deltagare i samma vy.
- Vara helt härledd från serverns state — inget måste "unveilas" manuellt
  utöver att fylla i vinnaren i arket.

## Trigger

- Modalen visas när `payload.facit.winner` är non-null.
- Nyckelvariabeln är den effektiva vinnaren i `/api/standings`-payloaden.
  Serverns `applyLiveKnockout` sätter redan `winner` när finalen avgörs
  via live-feeden, och arkets `VM-vinnare`-cell vinner om båda finns. Vi
  behöver ingen ny signal — bara reagera på fältet som redan finns.
- Om fältet går från non-null till null (vinnaren rensas ur arket)
  försvinner modalen och den lokala "stängd"-flaggan nollställs, så nästa
  gång vinnaren sätts igen öppnas den på nytt.

## Innehåll (uppifrån och ned)

1. **Titelrad:** `🏆 VM-tipset 2026 – Slutresultat 🏆` och stängknapp ✕
   till höger.
2. **Podium:** tre staplar med guld (#1 högst), silver (#2) och brons
   (#3). Varje stapel: rank-siffra, namn, totalpoäng. Tie-hantering: om
   flera delar plats staplas namnen på samma stapel med `=1`, `=2` osv.
3. **Skiljelinje.**
4. **Övriga deltagare (från #4 och nedåt):** en rad per deltagare med
   `rank. namn — total`. Ingen breakdown, inga kolumner, ingen live-info
   — bara den slutgiltiga listan.

## Beteende

- **Persistens:** ingen. Ingen `localStorage`, ingen `sessionStorage`.
  Vid sidladdning öppnas modalen alltid så länge `facit.winner` är satt.
  Klick på ✕, ESC eller backdrop stänger den för resten av sessionen och
  ersätter den med en liten pill `🏆 Slutresultat` som återöppnar.
- **Reagera på polling:** när klientens polling ser en null → non-null-
  övergång öppnas modalen även utan reload. non-null → null stänger den
  och nollställer stängd-flaggan.
- **Konfetti:** ~1,5 sekunders canvas-baserad burst vid öppning, plus en
  subtil sparkle/glow bakom guldstapeln som fortsätter en stund innan
  den lugnar ned sig. Ingen ljud.
- **Mobil:** modalen fyller hela viewporten kant-i-kant, hela innehållet
  scrollar (inklusive titelraden). På desktop (>= 600px) är den en
  centrerad kortkomponent med max ~520px bredd och en mörkad backdrop.
- **Tangentbord / a11y:** `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` pekar på titeln. Fokus flyttas till ✕ vid öppning
  och fångas i modalen tills den stängs. ESC stänger. Backdrop-klick
  stänger.

## Arkitektur och filändringar

- **Server:** inga ändringar. `payload.facit.winner` finns redan (sätts
  via `applyLiveKnockout` eller `parseKnockoutRows`).
- **`public/app.js`:**
  - Ny funktion `renderFinalCelebration(payload)` anropas efter varje
    lyckad poll (samma ställe som andra render-funktioner). Skapar/river
    DOM utifrån `payload.facit.winner` och en lokal `closedThisSession`-
    flagga i modulen.
  - Ny funktion `openConfetti(canvas)` som ritar ~50 partiklar (gravitation,
    rotation, ~1,5s) på en canvas som mountas vid öppning och tas bort vid
    stängning. Inga externa beroenden.
  - Bygg podium från `payload.participants` sorterat på `rank`; grupp för
    varje `rank`-nivå så flera lag på samma placering hamnar på samma
    stapel.
  - Bygg resten från deltagare med `rank >= 4`.
- **`public/index.html`:** ingen ny markup behövs — modalen skapas fullt
  ut av `renderFinalCelebration`. Ingen preload i `__INITIAL__`-payloaden
  (den tas emot exakt som vanligt; modalen renderas när koden kör sitt
  första render-pass).
- **`public/style.css`:** ny sektion med `.final-modal`,
  `.final-backdrop`, `.final-modal-header`, `.final-close`,
  `.final-podium`, `.final-podium-bar.gold|silver|bronze`,
  `.final-rest`, `.final-pill` (återöppna-knapp). Mobil-first;
  desktop-varianter under befintliga `min-width: 600px`-brytpunkten.
  Använder samma färg- och radius-tokens som resten av sidan.
- **Tester:** inga. Ren UI-förändring över ett fält som redan flödar
  genom payloaden; ingen backend-logik ändras. Verifiering görs manuellt
  i webbläsaren (t.ex. genom att tillfälligt sätta `facit.winner` i
  `parseKnockoutRows`-mock eller i den inbakade HTML-payloaden).

## Icke-scope

- Ingen firande av VM-champion-laget separat. Firandet är puljinriktat.
- Ingen highlight av vem/vilka som tippade rätt VM-vinnare (redan täckt
  av vanliga tabellen).
- Ingen delnings-, export- eller "spara som bild"-funktion.
- Inga ljud.
- Ingen persistens över sessioner.

## Öppna edge-case-beslut

- **Färre än 3 deltagare:** osannolikt men podiumet renderar bara de
  positioner som finns (bara guld om det bara finns en, guld+silver om
  två). Restlistan är då tom och visas inte.
- **Delad förstaplats:** stapelhöjder skalas efter poäng, men om flera
  lag har samma total delar de guld-stapeln (namnen staplade under
  `=1`). Silver hoppas då över och nästa är `=3`.
- **Winner rensas i arket mitt i sessionen:** modalen stängs, pill-knappen
  försvinner, `closedThisSession` nollställs. Om winner sätts igen: modalen
  öppnas på nytt.
