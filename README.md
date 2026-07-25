# Ponašanje potrošača u turizmu — AI asistent kolegija

Samostalni obrazovni AI asistent za kolegij **Ponašanje potrošača u turizmu**
(Veleučilište Baltazar Zaprešić, studij *Management u turizmu i ugostiteljstvu*).

Asistent odgovara **isključivo prema veleučilišnom priručniku kolegija** i uz svaki
odgovor navodi **poglavlje i stranicu**. Ako u priručniku nema podloge, asistent to
otvoreno kaže i predloži gdje tražiti — umjesto da nagađa.

Stack: **Next.js 14 (App Router) + Supabase (Postgres + pgvector) + Claude
(Anthropic Messages API) + OpenAI (embeddinzi, Whisper ASR, TTS)**.

---

## Što je isporučeno

| Cjelina | Stanje |
| --- | --- |
| Struktura kolegija: 11 poglavlja, 60 lekcija, stvarni brojevi stranica | ✅ `data/sadrzaj.json` |
| Ingest priručnika (DOCX → lekcije, sažetci, isječci, ugradnje) | ✅ `npm run ingest` |
| Ingest dopunskih izvora (PDF) | ✅ `npm run ingest:dopunski` |
| Hibridni RAG (pgvector + full-text) + rerank manjim modelom | ✅ `lib/retrieval.ts` |
| Chat u lekciji i opći chat, uz citate i procjenu pokrića | ✅ `/api/chat` |
| Usmena vježba: pitanje → glas (Whisper) → potvrda transkripta → povratna informacija | ✅ `/usmena-vjezba` |
| TTS čitanje pitanja i sažetaka naglas | ✅ `/api/govor` |
| Kviz poglavlja + završna provjera znanja | ✅ (čeka pitanja nastavnika — vidi niže) |
| Praćenje napretka po korisniku | ✅ `napredak` |
| Telemetrija (bez sadržaja razgovora) | ✅ `telemetrija`, pogled `telemetrija_sazetak` |
| Autentikacija (Supabase Auth, uloge student/nastavnik) | ✅ implementirana, **namjerno umirovljena** |

---

## Temeljno načelo: vjernost izvoru

Provedeno na tri razine, tako da nijedna sama ne mora biti savršena:

1. **Dohvat.** Odgovara se samo iz isječaka koji su stvarno dohvaćeni iz priručnika.
   Zadani opseg dohvata su isključivo isječci priručnika; dopunski izvori ulaze
   tek na izričit zahtjev.
2. **Prag pokrića.** Ako najbolji dohvaćeni isječak ne prijeđe `RAG_MIN_SCORE`,
   odgovor se odbija **prije** poziva generativnom modelu i vraća se
   `nedovoljno_konteksta` s prijedlogom lekcija. Jeftinije je i pouzdanije nego
   se osloniti na to da model sam prizna neznanje.
3. **Prompt i citati.** Sistemski prompt zabranjuje opće znanje i traži citate.
   Ako model ipak izostavi citate, dopisuju se iz stvarno dohvaćenih isječaka,
   pa odgovor nikad ne ostane bez traga do izvora.

---

## Postavljanje (korak po korak)

### 1. Supabase

1. Kreirajte **novi, zaseban** projekt na [supabase.com](https://supabase.com) (regija `eu-central-1`).
2. **SQL Editor** → zalijepite sadržaj [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   (Skripta uključuje `create extension vector` — pgvector.)
3. Mijenjate li model embeddinga, prije izvršavanja uskladite sva pojavljivanja
   `vector(1536)` s dimenzijom svojeg modela (`EMBEDDING_DIM`).
4. Zabilježite **Project URL**, **anon** i **service_role** ključ (Project Settings → API).

### 2. Lokalno pokretanje

```bash
cp .env.example .env.local        # popunite vrijednosti (vidi komentare u datoteci)
npm install

mkdir -p materijali/dopunski
cp <priručnik>.docx materijali/prirucnik.docx     # NE commita se u git

npm run struktura                 # DOCX → data/sadrzaj.json (pregledajte i potvrdite)
npm run ingest                    # lekcije, sažetci, isječci, ugradnje → Supabase
npm run ingest:dopunski           # neobavezno: dopunski izvori iz registra
npm run dev                       # http://localhost:3000
```

### 3. Deploy (Vercel)

Zaseban Vercel projekt, iste ENV varijable kao lokalno. Lekcije su statičke rute
s revalidacijom svakih sat vremena — nakon novog ingesta izmjene se na CDN-u
vide s tim odmakom (ili odmah, uz ručni redeploy).

---

## Autentikacija — namjerno umirovljena

Cijeli sloj je implementiran: Supabase Auth (e-mail/lozinka i magic link),
tablica `profili` s ulogama `student` / `nastavnik`, prijava, registracija,
`auth/callback`, zaštita ruta u `middleware.ts`.

Drži ga isključenim jedna zastavica:

```env
AUTH_ENABLED=false
NEXT_PUBLIC_AUTH_ENABLED=false
```

Dok je isključena, aplikacija radi bez prijave, a napredak se veže uz **anonimni
identifikator gosta** iz kolačića `gost_id`. Tablice `napredak`, `kviz_pokusaji`
i `usmene_vjezbe_pokusaji` zato nemaju strani ključ prema `profili` —
**uključivanje autentikacije ne traži nikakvu migraciju sheme**, samo promjenu
zastavice na `true`.

---

## Radni tijek punjenja sadržaja

Detaljno u [`docs/RADNI-TIJEK.md`](docs/RADNI-TIJEK.md). Ukratko:

1. **Nastavnik isporučuje priručnik** (DOCX) → `materijali/prirucnik.docx`.
2. **Potvrda mapiranja:** `npm run struktura` izvuče poglavlja/lekcije i stvarne
   brojeve stranica u `data/sadrzaj.json`. Datoteka se smije ručno urediti
   (spojiti lekcije, preimenovati, promijeniti redoslijed) — ingest čita **nju**,
   pa se izvorne oznake iz dokumenta ne uzimaju zdravo za gotovo.
3. **Ingest:** `npm run ingest`. Sažetak lekcije je **doslovni tekst** pripadajućeg
   odjeljka priručnika pretvoren u Markdown — ništa se ne prepričava ni ne dodaje.
4. **Kviz:** pitanja isporučuje nastavnik (`npm run kviz:uvezi`). Skripta
   `npm run nacrti` može pripremiti **nacrte** iz teksta priručnika, ali oni
   ostaju `odobreno = false` i **studentima se ne prikazuju** dok ih nastavnik ne
   potvrdi. Asistent nikad sam ne objavljuje pitanja.
5. **Mediji:** nastavnik ih učitava u Supabase Storage prema konvenciji
   `NN-kratki-opis.ext` i upisuje red u tablicu `mediji`. Mediji nisu u gitu.
6. **Svaka promjena koda:** `npm run typecheck` → `npm run lint` → `npm run build`
   → commit → push.

---

## Način rada: chat i usmena vježba

**Chat u lekciji** — dohvat pristran prema toj lekciji, odgovori sažeti, uz citate
stranica, bez općeg disclaimera.

**Opći chat** — dohvat po cijelom priručniku, uz kratku napomenu
*„Odgovaram samo prema udžbeniku."*

**Usmena vježba** (`/usmena-vjezba` ili unutar lekcije) — trening za usmeni ispit,
**bez službenog ocjenjivanja**:

1. asistent postavi jedno pitanje iz odabranog opsega (uz TTS čitanje naglas);
2. student odgovara glasom → Whisper transkribira → transkript se prikaže
   **na potvrdu** (može se ispraviti);
3. dohvate se relevantni odlomci i odgovor se usporedi s ključnim točkama iz priručnika;
4. povratna informacija: što je točno, što nedostaje, što je pogrešno, 2–3 savjeta
   i idealan sažeti odgovor — sve s citiranim stranicama.

Procjena je opisna (*uglavnom točno / djelomično / netočno*) uz rubriku 0–2 po
kriteriju: točnost pojmova, pokrivenost ključnih elemenata, terminologija, jasnoća
izlaganja.

---

## Privatnost

- **Audio snimke se nikad ne pohranjuju.** Snimka putuje iz preglednika izravno na
  transkripciju (`/api/transkript`), obrađuje se u memoriji i odbacuje — ne zapisuje
  se ni na disk, ni u Storage, ni u bazu.
- Pohranjuje se samo **potvrđeni transkript** i rezultat vrednovanja
  (`usmene_vjezbe_pokusaji`).
- **Telemetrija ne sadrži sadržaj razgovora** — samo vrstu događaja, je li dohvat
  imao kontekst, broj isječaka, najbolji rezultat sličnosti, trajanje i zbroj rubrike.
- Sirovi nastavni materijali (priručnik, dopunski PDF-ovi, mediji) **nisu u gitu**
  (`.gitignore`); obrađuju se lokalno i završavaju samo u Supabaseu.

---

## Skripte

| Naredba | Što radi |
| --- | --- |
| `npm run struktura` | DOCX → `data/sadrzaj.json` (`--provjeri` = bez pisanja) |
| `npm run ingest` | Puni ingest priručnika (`--suho`, `--lekcija=N`) |
| `npm run ingest:dopunski` | Ingest dopunskih PDF izvora iz registra |
| `npm run nacrti -- --ciljevi --kviz` | Nacrti ciljeva učenja i kviz pitanja (`odobreno = false`) |
| `npm run kviz:uvezi -- --datoteka=…` | Uvoz nastavnikovih pitanja (odmah odobrena) |
| `npm run rag:debug -- "pitanje"` | Što bi RAG vratio, bez poziva modelu |
| `npm run typecheck` / `lint` / `build` | Provjere prije commita |

---

## Mjerenje kriterija uspjeha (MVP)

```sql
select * from telemetrija_sazetak;
```

- `postotak_bez_konteksta` — udio upita za koje dohvat nije imao pokrića
  (cilj: ≥ 95 % odgovora s valjanim citatima ⇒ ovaj postotak nizak i objašnjiv);
- `prosjecno_ms` — prosječno vrijeme odgovora (usmena vježba: cilj < 10 s od
  završetka transkripcije);
- `prosjecna_rubrika` — prosječan zbroj rubrike (0–8) u usmenim vježbama.

---

## Poznata ograničenja

- **Kvizovi su prazni dok nastavnik ne isporuči ili ne odobri pitanja.** To je
  namjerno: pravilo „ne izmišljaj pitanja" ima prednost pred punim MVP-om.
  `npm run nacrti` pripremi prijedloge iz teksta priručnika, ali oni ne izlaze
  pred studenta bez odobrenja.
- **Ciljevi učenja** priručnik ne sadrži kao zaseban tekst; i oni se pripremaju
  kao nacrti i prikazuju tek nakon odobrenja.
- **Brojevi stranica** dolaze iz Wordove paginacije zabilježene u DOCX-u
  (`w:lastRenderedPageBreak`). Ako se priručnik prelomi drukčije, ponovno
  pokrenite `npm run struktura` i `npm run ingest` da citati ostanu točni.
- **Full-text pretraga** koristi `simple` konfiguraciju s prefiksnim upitom na
  skraćenim osnovama riječi — Postgres nema hrvatski stemmer. Dovoljno je za
  padeže, ali nije pravi morfološki stemming.
