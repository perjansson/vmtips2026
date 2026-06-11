# VM 2026 tips – live-ställning (v1) – design

Datum: 2026-06-11. Användarens fullständiga spec (inklistrad prompt) är grunddokumentet;
detta dokument fångar **verifierade fakta om arket** och **designbeslut** utöver spec:en.

## Verifierade fakta om kalkylarket

Spreadsheet-ID: `1NlUCIKlLgaWAmGq4UKAcCAvzuwwKdMGLkDiWh7ZFoeY` (publikt, läsbart via länk).

- `Ställning`: rad 1 = rubriker (`Deltagare`, `Poäng`), rad 2+ = deltagarnamn.
  10 deltagare idag: Tomas, Lennon, Per, Åsa, Hedda, Elias, Krisse, Elliot, Vida, Owen.
- Gruppblock: rubrikrad ("Grupp A"…"Grupp L") på rad 1, 9, 17, …, 89 (rad `1+8i`),
  följt av 6 matchrader, sedan en tom rad. Kol A = datum, B = `"Hemmalag - Bortalag"`,
  C = hemmamål, D = `-`, E = bortamål.
- Slutspelsetiketter står i **kolumn A på sektionens första rad**, lagnamn i kolumn B:
  - rad 98: `16-delsfinal lag` (lag rad 98–129)
  - rad 131: `Åttondelsfinal lag` (131–146)
  - rad 148: `Kvartsfinal lag` (148–155)
  - rad 157: `Semifinal lag` (157–160)
  - rad 162: `Final lag` (162–163)
  - rad 165: `VM-vinnare` (165)
- `Resultat` har samma layout; slutspelslistorna är ännu tomma (turneringen startade idag).
- Arket har fler kolumner till höger (egna grupptabeller, instruktioner) – vi läser bara A–E.

## Kritiskt fynd: gviz-CSV tappar rader även MED `range`

Empiriskt verifierat: gviz typar kolumner per majoritet. Kolumn A domineras av datum,
så textrader ("Grupp B", slutspelsetiketter) **nullas och raderna försvinner ur CSV:n**,
liksom helt tomma rader. Absolut radposition i svaret är därför opålitlig.

**Positionssäker strategi (2 anrop per flik):**
1. `range=A1:E96&headers=0` → exakt de 72 matchraderna, i ordning (grupprubriker och
   tomrader faller bort deterministiskt eftersom alla matchrader har kol B ifylld).
   Match nr `i` (0-indexerat) tillhör grupp `floor(i/6)` → Grupp A–L. Verifierat: 72 rader.
2. `range=A98:B165&headers=0` → slutspelsraderna; sektion byts när kol A matchar en känd
   etikett, lagnamn läses ur kol B. Tomma rader som faller bort skadar inte (listorna är
   mängder, inte positioner). Verifierat mot fliken `Per`.

`Ställning` läses med `range=A2:A50&headers=0` (namnen är strängar, inga datum → stabilt).
Fliknamn URL-kodas. Alternativet `export?format=csv&gid=` ger råa rader men kräver
gid-uppslag per flik – avstås i v1 (spec:en föreskriver gviz).

## Designbeslut

1. **Två uppdateringsintervall på servern.** `Resultat` + `Ställning` hämtas var
   `SHEET_REFRESH_SECONDS` (default 15). Deltagarflikar (tipsen, statiska efter
   turneringsstart) hämtas var `PREDICTIONS_REFRESH_SECONDS` (default 300). Med 10
   deltagare ger det ~4 anrop/15 s i stället för ~24, vilket minskar risken att
   rate-limitas av Google. Vid hämtningsfel serveras senaste lyckade cache (stale-ok).
2. **Facit för ronder läses ur `Resultat`-flikens listor** (per spec §3), bakom
   `ResultProvider`-interfacet. Den portade `uppdateraSlutspel`-logiken används för att
   beräkna/visa preliminär avancemang ur gruppresultaten (inkl. "ej fastställd"-fallet)
   och är enhetstestad; den blir inte facitkälla i v1.
3. **Poäng per spec §5.** Gruppmatch poängsätts först när matchen är spelad i facit
   (C och E ifyllda) och deltagaren tippat båda målen. Rondpoäng: 5 p per lag i
   deltagarens rondlista som finns i facitlistan för samma rond (delvis ifyllda
   facitlistor ger delvisa poäng). VM-vinnare: 10 p, jämförs när facit har vinnare.
4. **Lagnamnsnormalisering:** trim, NBSP→mellanslag, ihopslagna mellanslag,
   case-insensitiv jämförelse. Matchsträng splittas på `-`/`–`/`—` omgiven av
   (hårda) mellanslag.
5. **Stack:** Node 18+ (inbyggd `fetch`), Express (enda runtime-beroendet),
   `node:test` för tester. Frontend: statisk `public/` med ren HTML/CSS/JS.
6. **API:** `GET /api/standings` → `{ updatedAt, clientPollSeconds, participants: [...] }`
   med per deltagare: namn, rank, total, gruppoäng, slutspelspoäng (per rond + vinnare).
   `Last-Modified`-header sätts. Allt detaljvyn behöver ligger i samma svar
   (10 deltagare → litet payload, ingen extra endpoint).

## Moduler

- `src/csv.js` – minimal CSV-radparser (citattecken, kommatecken i fält).
- `src/sheetClient.js` – gviz-hämtning + parsning till `{matches, rounds}` per flik
  samt deltagarlista. Ingen affärslogik.
- `src/resultProvider.js` – `createSheetResultProvider()` → `getFacit()`; API-källa kan
  ersätta i v2.
- `src/groupTable.js` – `GRUPPTABELL`-portning: tabell + FIFA-rangordning
  (poäng → inbördes [poäng → MS → GM] → total MS → totala GM → bokstavsordning).
- `src/advancement.js` – `uppdateraSlutspel`-portning: 2 per grupp + 8 bästa treor
  (poäng → MS → GM), oseparerbara treor kring plats 8 → `undecided`.
- `src/scoring.js` – poängberäkning deltagare vs facit.
- `src/standings.js` – komponerar allt till API-svaret.
- `server.js` – Express, bakgrundsuppdatering, cache, statiska filer.
- `public/` – `index.html`, `style.css`, `app.js`.

## Felhantering

- Ospelad/otippad match, tomma rondlistor, saknad vinnare → 0 p, inga krascher.
- Ark-hämtningsfel → behåll senaste cache, logga, exponera `updatedAt` ärligt.
- Okänd deltagarflik (namn i Ställning utan flik) → deltagaren visas med 0 p och flagga.

## Test

`node:test`-sviter för csv-parsning, matchsträngsparsning/normalisering, grupptabell
(inkl. inbördes möten), avancemang (inkl. tre-vägs-oavgjort bland treor → "ej fastställd"),
samt poängregler (utgång+exakta mål, rondpoäng, vinnare). Fixturer är syntetiska +
ett stickprov byggt på verklig arkdata.
