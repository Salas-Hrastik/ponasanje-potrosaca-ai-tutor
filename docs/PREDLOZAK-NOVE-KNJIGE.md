# Predložak za novu knjigu u istom stilu

Ovaj dokument prenosi **stil i strukturu** priručnika „Ponašanje potrošača u turizmu"
na novu knjigu. Nije opis onoga kako bi knjiga trebala izgledati — sve brojke ovdje
izmjerene su iz gotove knjige skriptom `npm run knjiga:mjere`, koja piše
[`../data/mjere-knjige.json`](../data/mjere-knjige.json). Promijeni li se sadržaj,
mjere se ponove i predložak ostaje točan.

Tehnički radni tijek (koje skripte, kojim redom) opisan je u
[`RADNI-TIJEK.md`](RADNI-TIJEK.md); ovdje je **što** se piše i **koliko** čega ima.

---

## 1. Što se prenosi, a što se piše iznova

| Element | Prenosi se | Napomena |
| --- | --- | --- |
| Anatomija knjige (dijelovi → poglavlja → odjeljci) | **kao obrazac** | brojevi u §2 su ciljne vrijednosti |
| Kostur poglavlja (okviri „SAŽETAK POGLAVLJA"…) | **doslovno** | §4 — to je vidljivi potpis stila |
| Konvencije DOCX-a (stilovi naslova, numeriranje) | **doslovno** | §3, inače ingest ne prepoznaje strukturu |
| Norme izvedenih elemenata (ciljevi, kartice, kviz) | **doslovno** | §5, uključujući promptove |
| Multimedija po cjelini | **doslovno** | §6 |
| Postavke RAG-a i vizualni identitet | **doslovno** | §7 i §8 |
| Tekst poglavlja, pojmovi, primjeri | ✗ piše se iznova | ovo je jedini dio koji je nov |

---

## 2. Anatomija knjige

Izmjereno na gotovoj knjizi (bez cjeline „Dodaci", koja nema nastavne elemente):

| Veličina | Najmanje | Sredina | Najviše |
| --- | --- | --- | --- |
| Stranica po poglavlju | 3 | **6** | 8 |
| Odjeljaka po poglavlju | 4 | **6** | 7 |
| Stranica po odjeljku | 1 | **2** | 4 |
| Riječi po poglavlju | 612 | **1583** | 2521 |
| Odlomaka po poglavlju | 15 | **23** | 53 |

Ukupno: **11 poglavlja** (10 nastavnih + Dodaci), **60 odjeljaka**, **52 stranice**,
raspoređeno u dva dijela i dodatke:

- `DIO I · Temelji ponašanja potrošača` — poglavlja 1–5
- `DIO II · Digitalno doba i umjetna inteligencija` — poglavlja 6–10
- `Dodaci` — poglavlje 11 (predgovor, pojmovnik, literatura)

**Za novu knjigu:** dva do tri dijela po pet poglavlja, poglavlje od šest stranica
i šest odjeljaka, odjeljak od dvije stranice. Raspon 3–8 stranica po poglavlju je
prihvatljiv; ono što nije je poglavlje od jedne stranice ili od dvadeset, jer sučelje
svakoj cjelini daje isti prostor.

> Drugi dio knjige namjerno je „AI dio". Obrazac se prenosi: prva polovica postavlja
> klasične temelje područja, druga ista pitanja gleda kroz digitalno i umjetnu
> inteligenciju. Bez toga cjeline o AI-ju vise u zraku.

---

## 3. Konvencije izvornog DOCX-a

Ingest čita strukturu iz Wordovih stilova naslova. Bez njih nema ni poglavlja ni
citata sa stranicama.

| Stil | Značenje | Oblik |
| --- | --- | --- |
| `Heading 1` | poglavlje | `01 · Naslov poglavlja` |
| `Heading 2` | odjeljak | `4.4 Naslov odjeljka` |
| `Heading 3` | pododjeljak | slobodan naslov |
| `List Paragraph` | nabrajanje | — |

- Naslovi **bez broja poglavlja** (Predgovor, Pojmovnik, Literatura) automatski
  ulaze u cjelinu **Dodaci**.
- Brojevi stranica čitaju se iz Wordove paginacije. Prelomi li se dokument drukčije,
  citati se pomiču — nakon svakog preloma ponoviti `npm run struktura` i `npm run ingest`.
- Sirovi materijali idu u `materijali/` (u `.gitignore`), nikad u repozitorij.

---

## 4. Kostur poglavlja — vidljivi potpis stila

Okviri se u tekstu pišu kao redak velikim slovima, pa razmak, pa `·`, pa sadržaj.
Izmjereno, kroz deset nastavnih poglavlja:

| Okvir | U koliko poglavlja | Status u predlošku |
| --- | --- | --- |
| `SAŽETAK POGLAVLJA · …` | 10 / 10 | **obavezno** |
| `PITANJA ZA PONAVLJANJE · …` | 10 / 10 | **obavezno** |
| `AI U FOKUSU · …` | 8 / 10 | preporučeno |
| `PRIMJER IZ PRAKSE · …` | 6 / 10 | preporučeno |
| `KLJUČNI POJMOVI POGLAVLJA · …` | 1 / 10 | **uskladiti** — vidi niže |

Redoslijed u poglavlju:

```
## N.1 Naslov odjeljka
   2–4 odlomka tekuće proze (medijan 23 odlomka po poglavlju)
   KLJUČNI POJMOVI POGLAVLJA · pojam · pojam · pojam
## N.2 …
   PRIMJER IZ PRAKSE · konkretan slučaj iz struke, 1 odlomak
## N.3 …
   AI U FOKUSU · isto pitanje gledano kroz umjetnu inteligenciju, 1 odlomak
…
SAŽETAK POGLAVLJA · 3–5 rečenica
PITANJA ZA PONAVLJANJE · 4–6 pitanja otvorenog tipa
```

Ton i oblik teksta, kako je pisan u postojećoj knjizi:

- **tekuća proza**, ne natuknice — odlomak od 40–60 riječi, medijan poglavlja 23 odlomka;
- pojam se uvodi **u rečenici**, ne u okviru s definicijom: *„Za razliku od svakodnevne
  kupnje, turistička odluka tipično je visoko uključena: uključuje veće financijske
  izdatke…"*;
- kad se navodi tuđi model, navode se **autor, ustanova i godina** (*„Klasičnu tipologiju
  razradio je Henry Assael, američki profesor marketinga (Sveučilište New York, Stern
  School of Business), u udžbeniku Consumer Behavior and Marketing Action (1987.)"*);
- obraćanje je bezlično, bez „ti" i bez „mi";
- hrvatski standardni jezik, strani termin uz hrvatski u zagradi pri prvom spominjanju.

> **Uskladiti u novoj knjizi:** okvir `KLJUČNI POJMOVI POGLAVLJA` pojavljuje se samo u
> prvom poglavlju postojeće knjige. Sučelje ga podebljava kao i ostale okvire, pa
> izgleda kao propust u ostalih devet. Za novu knjigu: ili u svim poglavljima, ili ni
> u jednom.

---

## 5. Izvedeni nastavni elementi

Ovo se **ne piše ručno**: nacrte priprema `npm run nacrti` iz teksta poglavlja i
upisuje ih s `odobreno = false`. Studentu se prikazuje samo ono što nastavnik
odobri. Norme izmjerene na gotovoj knjizi:

### Ciljevi učenja — 6 po cjelini

- 6–7 ciljeva po poglavlju (prompt traži 4–6, model daje 6);
- 7–28 riječi po cilju, medijan **17**;
- formulacija infinitivom: *„Definirati…", „Razlikovati…", „Vrednovati…"*;
- kognitivna razina po Bloomu, izmjerena raspodjela na 61 cilju:
  razumijevanje 23 · analiza 19 · vrednovanje 9 · znanje 5 · primjena 5.

  Težište je namjerno na **razumijevanju i analizi**; puko prepoznavanje (znanje)
  drži se na desetini. Novu knjigu držati u istom omjeru.
- svaki cilj nosi broj stranice.

### Kartice za učenje — 10 po cjelini

- pojam: 1–8 riječi, medijan **3**;
- definicija: 6–42 riječi, medijan **27** (jedna do dvije rečenice);
- `stranica_ref` u obliku `str. 24` ili `str. 24–25`;
- pojmovi poredani onako kako se pojavljuju u poglavlju, bez ponavljanja.

### Kviz — 8 pitanja po cjelini

- točno **4** ponuđena odgovora, točno jedan točan;
- pitanje 4–27 riječi, medijan **13**;
- objašnjenje jedna rečenica, 10–28 riječi, medijan **17**, uz oznaku stranice;
- netočne opcije uvjerljive, ali nedvojbeno netočne prema priručniku;
- pitanja moraju pokriti cijelo poglavlje, ne jedan odjeljak.

> **Ispraviti u novoj knjizi:** u postojećoj je točan odgovor na prvom mjestu u
> **72 od 80** pitanja (raspodjela `0:72, 1:7, 2:1`). Sučelje miješa redoslijed
> *pitanja*, ali ne i *odgovora unutar pitanja*, pa student koji to primijeti pogađa
> položaj umjesto gradiva. Rješenje je jedno od dvoga: promiješati odgovore pri
> unosu nacrta, ili ih miješati pri posluživanju u `app/api/kviz/route.ts`.

Doslovni promptovi kojima nastaju sva tri elementa su u
[`../scripts/generiraj-nacrte.ts`](../scripts/generiraj-nacrte.ts) — prenose se
nepromijenjeni, mijenja se samo naziv izvora.

---

## 6. Multimedija — tri datoteke po cjelini

Izmjereno: **10 videa, 10 audija, 10 prezentacija** — točno po jedno od svakoga na
svaku nastavnu cjelinu. Trajanje 6–31 minuta, medijan **13**.

- Datoteke se ručno podižu u Supabase Storage, bucket `mediji`, mapa `N cjelina`.
- `npm run mediji -- --poglavlje=N` čita trajanje iz zaglavlja datoteke i upisuje redove.
- **Naslov audija izvodi se iz naziva cjeline**, bez iznimke — inače popis izgleda
  kao skup nepovezanih datoteka.
- Prezentacija: slajdovi kao slike u podmapi `N cjelina/slajdovi`, a
  `npm run slajdovi -- --poglavlje=N` piše tumačenja u `data/slajdovi/poglavlje-N.json`.
  Pozor: pokretanje s `--od`/`--do` **prepisuje cijelu datoteku**, pa se nakon
  popravka jednog slajda regenerira cijelo poglavlje.

---

## 7. Postavke dohvata (RAG)

Prenose se nepromijenjene; mijenja se samo sadržaj.

| Postavka | Vrijednost | Gdje |
| --- | --- | --- |
| Veličina isječka | ~225 tokena (54–376) | `lib/chunking.ts` |
| Ključnih riječi po isječku | 8 | `lib/chunking.ts` |
| Model ugradnji | `text-embedding-3-small`, 1536 dim. | `.env` + `supabase/schema.sql` |
| Prag pokrića (pismeno) | `ragMinScore` = 0,18 | `lib/config.ts` |
| Prag pokrića (govorno) | `ragMinScore × 2,3` = 0,414 | `app/api/realtime/gradivo/route.ts` |

Govorna brana je oštrija jer izgovorenu tvrdnju nitko ne provjerava. Izmjereno na
postojećoj knjizi: pitanja iz gradiva postižu 0,53–0,69, pitanja izvan njega 0,27–0,32.
**Nakon ingesta nove knjige tu mjeru treba ponoviti** (`npm run rag:debug`) — pragovi
ovise o sadržaju, ne o kodu.

Za 52 stranice nastalo je **138 isječaka**; to je red veličine za procjenu troška
ugradnji nove knjige.

---

## 8. Vizualni identitet

Definiran u `app/globals.css`, u `:root`:

| Uloga | Vrijednost |
| --- | --- |
| Primarna („more") | `#06333f` → `#1c9fbc`, svijetli tonovi `#d9eef3` / `#eff8fa` |
| Naglasak („pijesak") | `#e8a33c`, `#c9862a`, svijetlo `#fbeed6` |
| Radna podloga cjeline | `#aebfc4` (mramorno siva) |
| Tekst / blijedi tekst | `#16262b` / `#5b7076` |
| Zaglavlje cjeline | linearni gradijent primarne palete |

Paleta je izvedena iz teme kolegija („more i obala"). Za novu knjigu iz drugog
područja **primarnu i naglasnu boju treba zamijeniti**, a strukturu varijabli
zadržati — sve ostalo u CSS-u referira se na njih.

Korice: portret **1 : 1,35** (880 × 1190), u `public/korice-prirucnik.jpg`,
progresivni JPEG ~175 kB. Prikazuju se na 300 px, pa izvornik od 880 px pokriva i
Retina zaslone.

---

## 9. Redoslijed rada za novu knjigu

1. Odrediti dijelove i poglavlja prema §2 (dva dijela po pet poglavlja).
2. Napisati DOCX prema §3 i §4 — kostur poglavlja je obavezan.
3. `npm run struktura -- --provjeri` pa `npm run struktura` → provjeriti `data/sadrzaj.json`.
4. `npm run ingest` → isječci i ugradnje.
5. `npm run nacrti -- --ciljevi --kartice --kviz` → nacrti, svi neodobreni.
6. Pregledati nacrte i odobriti ih (`update … set odobreno = true`).
7. Podići multimediju u Storage prema §6, pa `npm run mediji` i `npm run slajdovi`.
8. `npm run rag:debug` → izmjeriti pragove pokrića i uskladiti `ragMinScore` (§7).
9. Zamijeniti paletu i korice (§8), postaviti naziv kolegija i autora u `lib/config.ts`.
10. `npm run knjiga:mjere` → usporediti nove mjere s ovim predloškom.

---

## 10. Što treba odlučiti prije početka

Ovo predložak ne može odlučiti umjesto autora:

- **Naslov, kolegij, studij i ustanova** — postavljaju se u `lib/config.ts` i
  `data/sadrzaj.json`.
- **Ima li i nova knjiga „AI dio"** ili je podjela na dijelove drukčija.
- **Opseg** — postojeća knjiga ima 52 stranice; sučelje jednako dobro nosi i dvostruko,
  ali broj poglavlja treba ostati u rasponu 8–12 jer izbornik cjelina nije stranično podijeljen.
- **Ide li nova knjiga u zasebnu instancu aplikacije** (vlastiti Supabase projekt i
  deploy) **ili uz postojeću** (druga vrijednost `izvori.oznaka`). Shema podnosi oboje,
  ali dohvat trenutačno pretpostavlja jedan priručnik kao izvor istine — druga knjiga
  u istoj bazi tražila bi filtar po izvoru kroz cijeli `lib/retrieval.ts`.
