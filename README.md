# VM-tipset 2026 – Live-ställning

Enkel, responsiv webapp som visar den aktuella ställningen i VM 2026-tipsspelet.
Läser tips och facit från det publika Google-kalkylarket, räknar om poängen själv
(portad Apps Script-logik) och auto-uppdaterar topplistan.

## Hur det funkar

- **Servern** (Node + Express) hämtar kalkylarket via gviz-CSV på ett
  bakgrundsintervall till en delad cache – oavsett antal besökare blir det bara
  en ark-hämtning per intervall. `GET /api/standings` serverar det färdigräknade
  svaret (med `Last-Modified`).
- **Klienten** (ren HTML/CSS/JS, mobil först) pollar API:t var 5:e sekund och
  uppdaterar tavlan mjukt – FLIP-animerad omsortering, ▲/▼ vid placeringsbyte,
  poängblink vid ändring. Ljust/mörkt läge följer systemet.
- **Facit i v1** är fliken `Resultat` i arket (bakom ett `ResultProvider`-
  interface i `src/resultProvider.js`, så ett sport-API kan kopplas på senare).

### Poängregler

| Vad | Poäng |
| --- | --- |
| Gruppmatch: rätt utgång (1/X/2) | 3 p |
| Gruppmatch: exakt målantal per lag | 1 p per lag (max 5 p/match) |
| Lag vidare till 16-del/åttondel/kvart/semi/final | 5 p per rätt lag och rond |
| VM-vinnare | 10 p |

Rangordning i grupptabeller (FIFA VM 2026): poäng → inbördes möten (poäng →
målskillnad → gjorda mål) → total målskillnad → totalt gjorda mål →
bokstavsordning. 32 lag vidare = 2 bästa per grupp + 8 bästa treorna; treor som
inte kan särskiljas om sista platsen redovisas som **ej fastställda**.

## Kom igång lokalt

```bash
npm install
cp .env.example .env        # justera vid behov
SHEET_ID=<spreadsheet-id> npm start
# eller: export $(grep -v '^#' .env | xargs) && npm start
```

Öppna http://localhost:3000.

```bash
npm test                    # enhetstester (node:test, inga extra beroenden)
```

## Miljövariabler

| Variabel | Default | Beskrivning |
| --- | --- | --- |
| `SHEET_ID` | – (krävs) | Google Spreadsheet-ID (publikt ark) |
| `PORT` | `3000` | Sätts av Render i produktion |
| `SHEET_REFRESH_SECONDS` | `15` | Intervall för hämtning av facit (`Resultat`) + deltagarlista |
| `CLIENT_POLL_SECONDS` | `5` | Hur ofta klienten pollar `/api/standings` |
| `PREDICTIONS_REFRESH_SECONDS` | `300` | Intervall för omhämtning av deltagarflikarna (tipsen är låsta efter turneringsstart, så detta kan vara glest) |

Inga hemligheter behövs – arket är publikt läsbart.

## Deploy på Render

1. Pusha repot till GitHub/GitLab.
2. På [render.com](https://render.com): **New → Blueprint** och peka på repot –
   `render.yaml` sätter upp web-servicen och env-variablerna.
   (Eller **New → Web Service** manuellt: runtime Node, build `npm ci`,
   start `npm start`, instanstyp Starter, samt env-variablerna ovan.)
3. Klart. Instanstypen `starter` är alltid igång (inga kallstarter);
   `free` fungerar också men spinner ner vid inaktivitet.

## Kalkylarkets layout (förväntad)

- Flik `Ställning`: deltagarnamn i kolumn A från rad 2 (läses dynamiskt).
- Flik `Resultat` + en flik per deltagare, identisk layout:
  - Rad 1–96: 12 grupper i 8-radersblock (rubrik, 6 matchrader, tomrad).
    Kol B = `"Hemmalag - Bortalag"`, kol C/E = mål (tomt = ospelad/otippad).
  - Slutspelslistor i kol B: rad 98–129 (16-delsfinal), 131–146 (åttondel),
    148–155 (kvart), 157–160 (semi), 162–163 (final), 165 (VM-vinnare).

**OBS (gviz-egenhet):** gviz-CSV typar kolumner per majoritet och tappar rader
vars celler nullas (t.ex. textrubriker i datumkolumnen A) – även med `range`.
Därför hämtas varje flik i två positionssäkra delar: matchraderna `A1:E96`
(exakt 72 rader överlever, grupp = radindex/6) och slutspelet `A98:B165`
(sektionsbyte på etiketterna i kolumn A). Se `docs/superpowers/specs/`.

## Framtida tillägg (förberett, ej byggt)

- Externt fotbolls-API som facitkälla bakom samma `ResultProvider`-interface
  (+ lagnamnsmappning engelska → svenska).
- Historik/graf över ställningens utveckling.
