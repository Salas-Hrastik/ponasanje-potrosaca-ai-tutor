# Radni tijek punjenja sadržaja (za nastavnika)

Ovaj dokument opisuje kako se kolegij puni sadržajem i kako se održava. Namijenjen
je nastavniku; programerski detalji su u [`../README.md`](../README.md).

---

## 0. Preduvjeti (jednokratno)

- Supabase projekt s izvršenom shemom `supabase/schema.sql`.
- `.env.local` popunjen prema `.env.example`.
- `npm install`.

---

## 1. Priručnik

Priručnik (DOCX) stavite u:

```
materijali/prirucnik.docx
```

Mapa `materijali/` je u `.gitignore` — sirovi materijali **nikad** ne idu u
repozitorij. Obrađuju se lokalno, a u Supabase odlazi samo obrađeni tekst.

Da bi ingest ispravno prepoznao strukturu, priručnik mora koristiti Wordove
stilove naslova:

| Stil | Značenje |
| --- | --- |
| `Heading 1` | Poglavlje (npr. `01 · Uvod u ponašanje potrošača u turizmu`) |
| `Heading 2` | Lekcija / odjeljak (npr. `4.4 Traženje informacija`) |
| `Heading 3` | Pododjeljak unutar lekcije |
| `List Paragraph` | Nabrajanje |

Naslovi bez broja poglavlja (Predgovor, Pojmovnik, Literatura) automatski ulaze u
poglavlje **Dodaci**.

> **Brojevi stranica** čitaju se iz Wordove paginacije zapisane u DOCX-u. Otvorite
> li dokument i prelomite ga drukčije, ponovite korake 2 i 3 da citati ostanu točni.

---

## 2. Potvrda mapiranja na poglavlja i lekcije

```bash
npm run struktura -- --provjeri   # samo ispis, ništa se ne mijenja
npm run struktura                 # upiše data/sadrzaj.json
```

Ispis pokazuje svako poglavlje i lekciju s rasponom stranica. **Pregledajte ga.**

`data/sadrzaj.json` smijete ručno urediti:

- promijeniti naslov lekcije (npr. skratiti ga za prikaz u sučelju);
- promijeniti redoslijed ili globalni broj lekcije (`broj`);
- izbaciti lekciju koja se ne obrađuje na kolegiju;
- spojiti dvije lekcije (obrišite jedan unos, drugom proširite raspon stranica).

Ingest čita **ovu potvrđenu datoteku**, a ne izvorne oznake iz dokumenta.
Lekcije se s tekstom povezuju prvo po oznaci (`4.4`), a zatim po naslovu; ako
poklapanje ne uspije, ingest ispisuje upozorenje i preskače stavku.

---

## 3. Ingest

```bash
npm run ingest -- --suho     # probni prolaz: ništa se ne upisuje, ni embeddinzi
npm run ingest               # pravi ingest
npm run ingest -- --lekcija=22   # samo jedna lekcija (nakon ispravka teksta)
```

Što ingest upisuje:

- `poglavlja`, `lekcije` (uključujući `sazetak_md`);
- `chunkovi` + `ugradnje` (isječci s metapodacima: poglavlje, raspon stranica,
  naslov odjeljka, ključne riječi).

**Sažetak lekcije je doslovni tekst priručnika** pretvoren u Markdown
(`### ` za pododjeljke, `- ` za nabrajanja). Ništa se ne prepričava.

Provjera da je dohvat živ:

```bash
npm run rag:debug -- "Što je nulti trenutak istine?"
npm run rag:debug -- "eWOM" --poglavlje=7
```

---

## 4. Dopunski izvori (neobavezno)

Dopušteni su **isključivo izvori koje priručnik sam navodi** (poglavlje
„Literatura i izvori za daljnje učenje" ili izvori spomenuti u tekstu).

1. PDF stavite u `materijali/dopunski/`.
2. Dodajte unos u `data/dopunski-izvori.json` (oznaka, datoteka, naslov, autor,
   godina, jezik, napomena).
3. `npm run ingest:dopunski`

Dopunski izvori **nisu** u zadanom opsegu dohvata: student ih uključuje
prekidačem *„Uključi dopunske izvore"* u chatu, a citati ih uvijek posebno
označavaju. Priručnik ostaje izvor istine.

---

## 5. Ciljevi učenja i kviz

### Ciljevi učenja

Priručnik ih ne sadrži kao zaseban tekst. Nacrte možete pripremiti iz samog
teksta priručnika:

```bash
npm run nacrti -- --ciljevi
npm run nacrti -- --ciljevi --lekcija=22
```

Nacrti se upisuju s `odobreno = false` i **ne prikazuju se studentima**.
Odobravanje:

```sql
-- pregled nacrta za jednu lekciju
select c.id, c.tekst, c.kognitivna_razina, c.stranica
from ciljevi_ucenja c
join lekcije l on l.id = c.lekcija_id
where l.broj = 22 and not c.odobreno
order by c.redoslijed;

-- odobrenje
update ciljevi_ucenja set odobreno = true where id = '…';
```

### Kviz

**Preporučeni put — nastavnik isporučuje pitanja.** Ispunite datoteku po uzoru na
`data/kviz-predlozak.json` i uvezite je:

```bash
npm run kviz:uvezi -- --datoteka=data/kviz-poglavlje-4.json --suho   # provjera formata
npm run kviz:uvezi -- --datoteka=data/kviz-poglavlje-4.json
```

Ta su pitanja odmah odobrena i vidljiva studentima.

**Pomoćni put — nacrti.** `npm run nacrti -- --kviz` pripremi po 8 prijedloga po
poglavlju, strogo iz teksta priručnika, ali s `odobreno = false`. Prije objave ih
pregledajte:

```sql
select id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref
from kviz_pitanja
where poglavlje_id = (select id from poglavlja where broj = 4)
  and izvor_unosa = 'nacrt' and not odobreno;

update kviz_pitanja set odobreno = true where id = '…';
```

Dok poglavlje nema odobrenih pitanja, kviz studentu pokazuje poruku da ih
nastavnik još nije odobrio. **Asistent nikad sam ne objavljuje pitanja.**

Završna provjera znanja automatski uzima do 3 odobrena pitanja iz **svakog**
poglavlja, pa pokriva cijeli kolegij.

---

## 6. Mediji (video, audio, prezentacije)

Mediji nisu u gitu — učitavaju se u Supabase Storage.

1. Konvencija imenovanja: `NN-kratki-opis.ext` (npr. `04-zmot.mp4`,
   `07-recenzije.mp3`, `08-agentski-ai.pptx`).
2. Nakon uploada upišite red u tablicu `mediji`:

```sql
insert into mediji (lekcija_id, tip, naslov, url, trajanje_s, redoslijed)
values (
  (select id from lekcije where broj = 36),
  'video',
  'Nulti trenutak istine — objašnjenje',
  'https://<projekt>.supabase.co/storage/v1/object/public/mediji/07-zmot.mp4',
  412,
  0
);
```

Dopušteni `tip`: `video`, `audio`, `prezentacija`. Prezentacije: `.pdf` se
prikazuje izravno, `.pptx` preko Office Online preglednika (mora biti javno
dostupan URL).

---

## 7. Nakon svake promjene

```bash
npm run typecheck && npm run lint && npm run build
git add -A && git commit -m "…" && git push
```

Nakon deploya: lekcije su statičke rute s revalidacijom svakih sat vremena, pa se
promjene sadržaja na CDN-u vide s tim odmakom. Treba li odmah — pokrenite ručni
redeploy na Vercelu.

---

## 8. Praćenje kvalitete

```sql
select * from telemetrija_sazetak;
```

- **`postotak_bez_konteksta` raste** → dohvat prečesto ostaje bez pokrića.
  Provjerite je li lekcija ingestirana (`npm run rag:debug -- "…" --lekcija=N`) i
  razmotrite blago sniženje `RAG_MIN_SCORE`.
- **`prosjecno_ms` raste** → smanjite `RAG_TOP_K` ili isključite rerank
  (`RAG_RERANK=false`).
- **`prosjecna_rubrika` niska** → pitanja usmene vježbe su preteška za opseg
  lekcije; razmotrite vježbu na razini poglavlja.
