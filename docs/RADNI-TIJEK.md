# Radni tijek punjenja sadržaja (za nastavnika)

Ovaj dokument opisuje kako se kolegij puni sadržajem i kako se održava. Namijenjen
je nastavniku; programerski detalji su u [`../README.md`](../README.md).

> Pišete li **novu knjigu** koja treba izgledati kao ova, počnite od
> [`PREDLOZAK-NOVE-KNJIGE.md`](PREDLOZAK-NOVE-KNJIGE.md): ondje je struktura,
> kostur poglavlja i koliko čega ide po cjelini. Ovdje je kako se to unosi.

> **Nastavna cjelina = poglavlje.** Sažetak, ciljevi učenja, kartice za učenje,
> mediji i kviz dodaju se **po poglavlju**. Odjeljci (1.1, 4.4 …) nisu zasebne
> stranice — oni strukturiraju sažetak cjeline i nose brojeve stranica za citate.

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
| `Heading 2` | Odjeljak cjeline (npr. `4.4 Traženje informacija`) |
| `Heading 3` | Pododjeljak unutar odjeljka |
| `List Paragraph` | Nabrajanje |

Naslovi bez broja poglavlja (Predgovor, Pojmovnik, Literatura) automatski ulaze u
cjelinu **Dodaci**.

> **Brojevi stranica** čitaju se iz Wordove paginacije zapisane u DOCX-u. Otvorite
> li dokument i prelomite ga drukčije, ponovite korake 2 i 3 da citati ostanu točni.

---

## 2. Potvrda mapiranja na cjeline i odjeljke

```bash
npm run struktura -- --provjeri   # samo ispis, ništa se ne mijenja
npm run struktura                 # upiše data/sadrzaj.json
```

Ispis pokazuje svaku cjelinu i njezine odjeljke s rasponom stranica. **Pregledajte ga.**

`data/sadrzaj.json` smijete ručno urediti:

- promijeniti naslov cjeline ili odjeljka (npr. skratiti ga za prikaz u sučelju);
- promijeniti redoslijed ili globalni broj odjeljka (`broj`);
- izbaciti odjeljak koji se ne obrađuje na kolegiju;
- spojiti dva odjeljka (obrišite jedan unos, drugom proširite raspon stranica).

Ingest čita **ovu potvrđenu datoteku**, a ne izvorne oznake iz dokumenta.
Odjeljci se s tekstom povezuju prvo po oznaci (`4.4`), a zatim po naslovu; ako
poklapanje ne uspije, ingest ispisuje upozorenje i preskače stavku.

---

## 3. Ingest

```bash
npm run ingest -- --suho        # probni prolaz: ništa se ne upisuje, ni embeddinzi
npm run ingest                  # pravi ingest
npm run ingest -- --poglavlje=4 # samo jedna cjelina (nakon ispravka teksta)
```

Što ingest upisuje:

- `poglavlja` — nastavne cjeline, uključujući **sažetak cjeline** (`sazetak_md`);
- `odjeljci` — odjeljci cjeline s rasponima stranica;
- `chunkovi` + `ugradnje` (isječci s metapodacima: poglavlje, raspon stranica,
  naslov odjeljka, ključne riječi).

**Sažetak cjeline je doslovni tekst cijelog poglavlja** pretvoren u Markdown:
`## 4.4 Traženje informacija` po odjeljku, `### ` po pododjeljku, `- ` za
nabrajanja. Ništa se ne prepričava — taj je sažetak podloga za kartice i kviz.

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

## 5. Ciljevi učenja, kartice i kviz

### Ciljevi učenja

Priručnik ih ne sadrži kao zaseban tekst. Nacrte možete pripremiti iz sažetka
cjeline:

```bash
npm run nacrti -- --ciljevi
npm run nacrti -- --ciljevi --poglavlje=4
```

Nacrti se upisuju s `odobreno = false` i **ne prikazuju se studentima**.
Odobravanje:

```sql
-- pregled nacrta za jednu cjelinu
select c.id, c.tekst, c.kognitivna_razina, c.stranica
from ciljevi_ucenja c
join poglavlja p on p.id = c.poglavlje_id
where p.broj = 4 and not c.odobreno
order by c.redoslijed;

-- odobrenje
update ciljevi_ucenja set odobreno = true where id = '…';
```

### Kartice za učenje

Pojam → definicija, izvedeno iz sažetka cjeline, sa stranicom na poleđini.

```bash
npm run nacrti -- --kartice --poglavlje=4
```

```sql
select k.id, k.pojam, k.definicija, k.stranica_ref
from kartice k
join poglavlja p on p.id = k.poglavlje_id
where p.broj = 4 and not k.odobreno
order by k.redoslijed;

update kartice set odobreno = true where id = '…';
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
cjelini, strogo iz sažetka cjeline, ali s `odobreno = false`. Prije objave ih
pregledajte:

```sql
select id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref
from kviz_pitanja
where poglavlje_id = (select id from poglavlja where broj = 4)
  and izvor_unosa = 'nacrt' and not odobreno;

update kviz_pitanja set odobreno = true where id = '…';
```

Dok cjelina nema odobrenih pitanja, kviz studentu pokazuje poruku da ih
nastavnik još nije odobrio. **Asistent nikad sam ne objavljuje pitanja.**

Završna provjera znanja automatski uzima do 3 odobrena pitanja iz **svake**
cjeline, pa pokriva cijeli kolegij.

---

## 6. Mediji (video, audio, prezentacije)

Mediji nisu u gitu — učitavaju se u Supabase Storage.

1. Konvencija imenovanja: `NN-kratki-opis.ext` (npr. `04-zmot.mp4`,
   `07-recenzije.mp3`, `08-agentski-ai.pptx`).
2. Nakon uploada upišite red u tablicu `mediji` — vezan uz **cjelinu**:

```sql
insert into mediji (poglavlje_id, tip, naslov, url, trajanje_s, redoslijed)
values (
  (select id from poglavlja where broj = 7),
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

Nakon deploya: stranice cjelina su statičke rute s revalidacijom svakih sat
vremena, pa se promjene sadržaja na CDN-u vide s tim odmakom. Treba li odmah — pokrenite ručni
redeploy na Vercelu.

---

## 8. Praćenje kvalitete

```sql
select * from telemetrija_sazetak;
```

- **`postotak_bez_konteksta` raste** → dohvat prečesto ostaje bez pokrića.
  Provjerite je li cjelina ingestirana (`npm run rag:debug -- "…" --poglavlje=N`) i
  razmotrite blago sniženje `RAG_MIN_SCORE`.
- **`prosjecno_ms` raste** → smanjite `RAG_TOP_K` ili isključite rerank
  (`RAG_RERANK=false`).
- **`prosjecna_rubrika` niska** → pitanja usmene vježbe su preteška; provjerite
  pokrivaju li sažeci cjelina gradivo na koje se pitanja oslanjaju.
