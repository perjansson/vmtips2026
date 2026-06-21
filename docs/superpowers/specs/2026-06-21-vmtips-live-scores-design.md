# VM 2026 tips – live-resultat under match – design

Datum: 2026-06-21. Bygger vidare på `2026-06-11-vmtips-live-standings-design.md`.
Detta dokument fångar **verifierade fakta om live-källan** och **designbeslut** för att
visa live-resultat under pågående matcher utan att någonsin riskera fel slutställning.

## Mål

Visa, för en match som pågår, ett live-resultat (målställning + matchminut) med tydlig
LIVE-markering, samt en **preliminär** poängpåverkan i deltagarlistan. Bekräftat facit
från kalkylarket har **alltid 100 % företräde** – live är ett kortlivat överlägg som
självläker. En trasig, sen eller nere live-källa får aldrig producera fel ställning,
bara avsaknad av live-data.

## Beslut (låsta i brainstorm)

1. **Datakälla:** gratis, bästa-möjliga (inte betald).
2. **Omfattning:** live-målställning **+ preliminära poäng** (inte bara målställningen).
3. **Preliminär UI:** diskret, alltid på – bekräftad totalpoäng är rubriken, en liten
   markerad live-delta (`+N ●`) och rank-pil bredvid. Försvinner i samma stund arket
   bekräftar matchen.
4. **Provider (default):** `worldcup26.ir` (gratis community-API), bakom en utbytbar
   adapter så en betald nyckel kan droppas in via env utan kodändring.

## Trade-off: fri + live + pålitlig finns inte samtidigt

| Källa | Gratis | Live (in-play) | Pålitlig |
|---|---|---|---|
| worldcup26.ir (community) | ✅ | ✅ | ❌ |
| football-data.org free | ✅ | ❌ (fördröjd) | ✅ |
| API-Football / Sportmonks (betald) | ❌ | ✅ | ✅ |

Designen är säker **just för att arket är auktoritativt**: live är ett engångsöverlägg.
När community-API:t är nere, fel eller släpar visas inget live (eller arkets bekräftade
resultat) – aldrig en felaktig ställning. Kravet på källan sänks därmed från "skottsäker"
till "bästa-möjliga och självläkande", vilket ett gratis community-API klarar.

## Verifierade fakta om worldcup26.ir

Repo: `rezarahiminia/worldcup2026`. Bas-URL: `https://worldcup26.ir`.

- **Endpoint:** `GET /get/games` (alla 104 matcher), `GET /get/game/{id}` (en match).
- **Spelobjekt (verifierat schema):**
  ```json
  { "id": "1", "group": "A", "type": "group",
    "home_team_name_en": "Mexico", "away_team_name_en": "South Africa",
    "home_score": "0", "away_score": "0",
    "finished": "FALSE", "time_elapsed": "notstarted",
    "local_date": "06/11/2026 13:00" }
  ```
- **Lagnamn:** engelska i `home_team_name_en` / `away_team_name_en` (även persiska `_fa`).
- **Mål:** `home_score` / `away_score` som **strängar** (t.ex. `"0"`).
- **Status:** `finished` = `"TRUE"`/`"FALSE"`; `time_elapsed` = `"notstarted"` | matchminut | avslutad.
- **Rate limit:** ~500 req/60s (i praktiken obegränsat för oss).
- **Osäkerheter (medvetet accepterade):**
  - Dokumentationen visar att läs-endpoints vill ha `Authorization: Bearer <JWT>` från en
    **gratis** registrering (`POST /auth/register` → `POST /auth/authenticate`), trots
    "ingen nyckel"-marknadsföringen. Adaptern hanterar token: läser credentials ur env,
    re-autentiserar vid 401.
  - Källan för live-data och uppdateringsfrekvens är odokumenterad. Hemsidans cert gav
    TLS-fel vid kontroll 2026-06-21. Detta är exakt varför adaptern isolerar källan och
    varför arket förblir facit.

## Arkitektur

Återanvänder den befintliga rena kärnan: hela poängberäkningen är rena funktioner över
`{ participants, predictionsByName, facit }`. Live blir en **andra `facit`** som körs genom
**samma** `computeStandings`.

### Nya filer

**`src/teamNames.js`** – statisk engelska→svenska-karta för de 48 lagen, härledd ur
`public/schedule.js` (svenska är redan facit där). Enda ansvaret: översätta API:ets
`*_name_en` till de svenska namn som `matchPairKey` använder.
- Interface: `toSwedish(englishName): string | null` (null = okänt lag → matchen hoppas över).
- Test: varje lag i `schedule.js` har en mappning; okänt namn ger `null`.

**`src/liveProvider.js`** – utbytbar live-adapter. Default `worldcup26`.
- Interface (speglar `resultProvider.getFacit`): `getLive(): Promise<LiveSnapshot>` där
  `LiveSnapshot = Array<{ home, away, homeGoals, awayGoals, status, minute }>` i **svenska
  nycklar**, `status ∈ {'live','finished'}`, mål som heltal.
- Beteende: autentiserar vid behov (credentials ur env), hämtar `/get/games`, filtrerar till
  matcher som pågår eller är klara, översätter namn via `teamNames`, parsar strängmål till
  heltal. **Kastar aldrig uppåt** – fel/timeout/parsfel → returnerar förra goda snapshot
  eller `[]`. Okänt lagnamn → den matchen utelämnas.
- Factory-mönster som `createSheetResultProvider`, så `LIVE_PROVIDER=football-data` eller en
  betald provider kan implementera samma `getLive()` senare.

### Ändrade filer

**`server.js`**
- Nytt `state.live` (senaste `LiveSnapshot`) + `state.liveUpdatedAt`.
- `refreshLive()` på eget intervall (`LIVE_REFRESH_SECONDS`), men **anropar bara API:t när
  schemat säger att minst en match är i sitt live-fönster** (avspark → +2.25 h, härlett ur
  `kickoffByPair` som redan finns). Utanför fönster: rör inte API:t, töm `state.live`.
- `recompute()` bygger ett `provisionalFacit`:
  - Kopiera `state.facit`. För varje match där arket saknar mål (`homeGoals/awayGoals === null`)
    **och** live-snapshot har den matchen → fyll i live-målen. Matcher arket redan har
    lämnas orörda (arket vinner 100 %).
  - Kör `computeStandings` på `provisionalFacit` → `provisional`.
  - Bygg `live`-block i payloaden:
    - `matches`: per pågående match `{ home, away, homeGoals, awayGoals, minute, status }`.
    - per deltagare: `liveDelta = provisional.total − confirmed.total`, `liveRankDelta`
      (samma passed−overtaken-logik som befintlig `rankDelta`, fast mot provisional).
  - Om `state.live` är tom: inget `live`-block (eller `live: { matches: [], ... }`),
    payloaden är identisk med dagens.
- Env: `LIVE_ENABLED` (kill-switch, default på), `LIVE_PROVIDER` (default `worldcup26`),
  `LIVE_BASE_URL`, `LIVE_EMAIL`/`LIVE_PASSWORD` (gratis registrering), `LIVE_REFRESH_SECONDS`
  (default 15 – community-API:ts rate limit tål det). Allt med rimliga defaults; saknade
  credentials → adaptern degraderar tyst till `[]`.

**`public/` (app.js / styles / index.html)**
- LIVE-bricka (🔴 **LIVE** + målställning + minut) på matcher i header-schemat vars par finns
  i `live.matches` med `status === 'live'`. Matcher med `status === 'finished'` (slutspelade
  men ännu inte införda i arket) visar målställning med en diskretare "ej bekräftat"-markering
  utan minut – de räknas ändå provisoriskt tills arket bekräftar.
- Diskret, alltid-på delta i deltagarlistan: bekräftad total som rubrik, liten markerad
  `+N ●` och rank-pil från `liveDelta`/`liveRankDelta`. Döljs så fort matchen finns i arket.
- Klienten pollar redan `/api/standings` var 5:e s – live följer med gratis. Ingen ny
  klient-poll behövs.

## Dataflöde

```
schedule.js (avsparkstider) ─┐
                             ▼
worldcup26 /get/games ─► liveProvider.getLive() ─► state.live (svenska nycklar)
                             │                         │
arket (Resultat-fliken) ─► state.facit ───────────────┤
                                                       ▼
                          recompute(): provisionalFacit = facit ⊕ live (bara tomma matcher)
                                                       ▼
                          computeStandings(facit)  +  computeStandings(provisionalFacit)
                                                       ▼
                          payload.{...standings, live:{ matches, per-deltagare delta }}
                                                       ▼
                          klient: LIVE-bricka + diskret +N ● delta
```

## Felhantering och invarianter

- **Arket vinner alltid:** live skrivs bara in i matcher där arket saknar mål. Så fort
  arket har ett resultat ignoreras live för den matchen.
- **Självläkande:** live-fel/nere/sent → `state.live = []` → payloaden faller tillbaka till
  exakt dagens bekräftade beteende. Aldrig fel ställning.
- **Kvotskydd:** API anropas bara inom schemalagda live-fönster. (worldcup26 är generöst,
  men gating gäller även vid byte till en kvotad provider.)
- **Okänt lag:** utelämnas ur snapshot (ingen gissning).
- **Token-utgång:** adaptern re-autentiserar vid 401, annars degraderar tyst.

## Test (`node:test`, inga nya beroenden)

- `teamNames`: alla 48 lag mappas; okänt → `null`.
- Merge-regel: live fylls bara i matcher där arket saknar mål; ifyllda arkmatcher orörda.
- Sheet-wins: när arket och live har samma match, används arkets mål.
- Provisional-konsistens: när arket bekräftar matchen med samma resultat som live blir
  `provisional.total === confirmed.total` och `liveDelta === 0`.
- liveProvider parsning: strängmål → heltal; `finished`/`time_elapsed` → `status`/`minute`;
  nätfel → förra snapshot eller `[]` (kastar inte).

## Medvetet utanför scope (YAGNI)

- Dynamisk poll-kadens efter kvot (worldcup26 behöver det inte; gating räcker).
- Måldata/utvisningar/uppställningar – bara målställning + minut.
- Slutspels-platshållare får ingen live (de saknar home/away tills lagen är klara).
- Diskrepans-varning när live ≠ ark – arket vinner tyst, ingen extra UI.

## Öppna risker

- worldcup26:s live-uppdatering är obevisad förrän en riktig match spelas. Verifiera mot
  en faktisk live-match innan beroende byggs på den; annars droppa in betald nyckel via env.
- JWT-flödet kan skilja sig från dokumentationen; adaptern måste tåla både "ingen auth
  behövs" och "Bearer krävs".
