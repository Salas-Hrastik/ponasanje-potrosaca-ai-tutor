/**
 * Segmentacija priručnika: DOCX odlomci → Poglavlje → Lekcija → blokovi teksta.
 *
 * Hijerarhija se čita iz stilova naslova koje je nastavnik već koristio u
 * priručniku (Heading1 = poglavlje, Heading2 = lekcija/odjeljak, Heading3 =
 * pododjeljak), a brojevi stranica iz Wordove paginacije (vidi lib/docx.ts).
 * Radi i u ingestu i u skripti za izvlačenje strukture — jedna implementacija,
 * pa se sadrzaj.json i stvarni ingest ne mogu raziću.
 */
import type { DocxOdlomak } from './docx';

export interface Blok {
  vrsta: DocxOdlomak['vrsta'];
  tekst: string;
  stranica: number;
  /** Najbliži prethodni pododjeljak (Heading3) — koristi se kao naslov_odjeljka. */
  pododjeljak: string;
}

export interface SegLekcija {
  oznaka: string;
  naslov: string;
  stranicaOd: number;
  stranicaDo: number;
  podnaslovi: { naslov: string; stranica: number }[];
  blokovi: Blok[];
}

export interface SegPoglavlje {
  broj: number;
  naslov: string;
  dio: string;
  stranicaOd: number;
  stranicaDo: number;
  lekcije: SegLekcija[];
}

/** Poglavlje u koje idu Predgovor, Pojmovnik i Literatura. */
export const DODACI_BROJ = 11;
export const DODACI_NASLOV = 'Dodaci — predgovor, pojmovnik i literatura';

export function dioZaPoglavlje(broj: number): string {
  if (broj <= 5) return 'DIO I · Temelji ponašanja potrošača';
  if (broj <= 10) return 'DIO II · Digitalno doba i umjetna inteligencija';
  return 'Dodaci';
}

/** "01 · Uvod u ponašanje potrošača" → {broj: 1, naslov: "Uvod u ponašanje potrošača"} */
function razlomiNaslovPoglavlja(tekst: string): { broj: number; naslov: string } | null {
  const m = /^(\d{1,2})\s*[·.\-–]\s*(.+)$/.exec(tekst);
  if (!m) return null;
  return { broj: parseInt(m[1], 10), naslov: m[2].trim() };
}

/** "4.4Traženje informacija" → {oznaka: "4.4", naslov: "Traženje informacija"} */
function razlomiNaslovLekcije(tekst: string): { oznaka: string; naslov: string } {
  const m = /^(\d{1,2}\.\d{1,2})\.?\s*(.+)$/.exec(tekst);
  return m ? { oznaka: m[1], naslov: m[2].trim() } : { oznaka: '', naslov: tekst.trim() };
}

export function segmentirajPrirucnik(
  odlomci: DocxOdlomak[],
  ukupnoStranica: number,
): SegPoglavlje[] {
  const poglavlja: SegPoglavlje[] = [];
  let tekuce: SegPoglavlje | null = null;
  let tekucaLekcija: SegLekcija | null = null;
  let pododjeljak = '';

  const otvoriPoglavlje = (broj: number, naslov: string, stranica: number): SegPoglavlje => {
    // Dodaci se u knjizi pojavljuju na dva mjesta (predgovor prije, pojmovnik
    // poslije glavnog dijela) — isto poglavlje se tada samo ponovno otvara.
    const postojece = poglavlja.find((p) => p.broj === broj);
    if (postojece) return postojece;
    const novo: SegPoglavlje = {
      broj,
      naslov,
      dio: dioZaPoglavlje(broj),
      stranicaOd: stranica,
      stranicaDo: stranica,
      lekcije: [],
    };
    poglavlja.push(novo);
    return novo;
  };

  const otvoriLekciju = (oznaka: string, naslov: string, o: DocxOdlomak): SegLekcija => {
    const lek: SegLekcija = {
      oznaka,
      naslov,
      stranicaOd: o.stranicaOd,
      stranicaDo: o.stranicaDo,
      podnaslovi: [],
      blokovi: [],
    };
    tekuce!.lekcije.push(lek);
    pododjeljak = '';
    return lek;
  };

  for (const o of odlomci) {
    if (o.vrsta === 'naslov1') {
      const raz = razlomiNaslovPoglavlja(o.tekst);
      if (raz) {
        tekuce = otvoriPoglavlje(raz.broj, raz.naslov, o.stranicaOd);
        tekucaLekcija = null;
        pododjeljak = '';
      } else {
        // Predgovor / Pojmovnik / Literatura — svaki je vlastita lekcija Dodataka.
        tekuce = otvoriPoglavlje(DODACI_BROJ, DODACI_NASLOV, o.stranicaOd);
        tekucaLekcija = otvoriLekciju('', o.tekst, o);
      }
      continue;
    }

    if (o.vrsta === 'naslov2' && tekuce) {
      const { oznaka, naslov } = razlomiNaslovLekcije(o.tekst);
      tekucaLekcija = otvoriLekciju(oznaka, naslov, o);
      continue;
    }

    if (o.vrsta === 'naslov3' && tekucaLekcija) {
      pododjeljak = o.tekst;
      tekucaLekcija.podnaslovi.push({ naslov: o.tekst, stranica: o.stranicaOd });
      tekucaLekcija.blokovi.push({
        vrsta: 'naslov3',
        tekst: o.tekst,
        stranica: o.stranicaOd,
        pododjeljak,
      });
      tekucaLekcija.stranicaDo = Math.max(tekucaLekcija.stranicaDo, o.stranicaDo);
      continue;
    }

    if (tekucaLekcija) {
      tekucaLekcija.blokovi.push({
        vrsta: o.vrsta,
        tekst: o.tekst,
        stranica: o.stranicaOd,
        pododjeljak,
      });
      tekucaLekcija.stranicaDo = Math.max(tekucaLekcija.stranicaDo, o.stranicaDo);
    }
  }

  poglavlja.sort((a, b) => a.broj - b.broj);
  zaokruziRaspone(poglavlja, ukupnoStranica);
  return poglavlja;
}

/**
 * Lekcija seže do stranice na kojoj počinje sljedeća; posljednja do kraja knjige.
 * Iznimka: Dodaci se pojavljuju i prije i poslije glavnog dijela, pa "sljedeća"
 * lekcija ponekad počinje na ranijoj stranici — tada se raspon ne skraćuje.
 */
function zaokruziRaspone(poglavlja: SegPoglavlje[], ukupnoStranica: number): void {
  const sve = poglavlja.flatMap((p) => p.lekcije);
  sve.forEach((lek, i) => {
    const sljedeca = sve[i + 1];
    const kraj = sljedeca && sljedeca.stranicaOd >= lek.stranicaOd ? sljedeca.stranicaOd : ukupnoStranica;
    lek.stranicaDo = Math.max(lek.stranicaOd, Math.min(lek.stranicaDo, kraj));
  });

  for (const p of poglavlja) {
    if (p.lekcije.length === 0) continue;
    p.stranicaOd = Math.min(...p.lekcije.map((l) => l.stranicaOd));
    p.stranicaDo = Math.max(...p.lekcije.map((l) => l.stranicaDo));
  }
}

/** Markdown sažetak odjeljka — doslovno iz priručnika, bez ijedne dodane rečenice. */
export function sazetakMarkdown(lek: SegLekcija): string {
  const redci: string[] = [];
  for (const b of lek.blokovi) {
    if (b.vrsta === 'naslov3') redci.push(`\n### ${b.tekst}\n`);
    else if (b.vrsta === 'popis') redci.push(`- ${b.tekst}`);
    else if (b.vrsta === 'tablica') redci.push(`\n${b.tekst}\n`);
    else redci.push(`\n${b.tekst}\n`);
  }
  return redci.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Sažetak CJELINE (poglavlja) — doslovni tekst cijelog poglavlja u Markdownu.
 * Odjeljci postaju naslovi druge razine (`## 4.4 Traženje informacija`), a
 * pododjeljci ostaju treće (`### …`). Ta hijerarhija je ujedno i navigacija
 * sažetka u sučelju te podloga za kartice i kviz cjeline.
 */
export function sazetakPoglavlja(pog: SegPoglavlje): string {
  return pog.lekcije
    .map((lek) => {
      const naslov = lek.oznaka ? `${lek.oznaka} ${lek.naslov}` : lek.naslov;
      const tijelo = sazetakMarkdown(lek);
      return `## ${naslov}\n\n${tijelo}`;
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Blokovi odjeljka s oznakom stranice — ulaz u chunking. */
export function blokoviZaChunking(lek: SegLekcija): Blok[] {
  return lek.blokovi.filter((b) => b.tekst.trim().length > 0);
}
