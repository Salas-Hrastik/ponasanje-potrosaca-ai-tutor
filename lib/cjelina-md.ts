/**
 * Samostalna nastavna cjelina zapisana u Markdownu (data/cjeline/*.md).
 *
 * Za cjeline koje NISU dio Word priručnika — npr. cjelina 12 izvedena iz
 * prezentacije rezultata istraživanja TOMAS Hrvatska 2025./2026. Datoteka se
 * pretvara u istu strukturu koju daje segmentacija DOCX-a (SegPoglavlje), pa
 * sažetak cjeline, odjeljci i isječci nastaju istim kodom kao za priručnik.
 *
 * Zapis:
 *   ---                       zaglavlje (ključ: vrijednost), vidi CjelinaMeta
 *   ## 12.1 Naslov            odjeljak cjeline
 *   ### Naslov                pododjeljak
 *   - stavka                  nabrajanje
 *   <!-- str. N -->           blokovi ispod oznake citiraju se sa „str. N"
 * Ostali HTML komentari se preskaču.
 */
import type { Blok, SegLekcija, SegPoglavlje } from './prirucnik';

export interface CjelinaMeta {
  broj: number;
  naslov: string;
  dio: string;
  /** Globalni broj prvog odjeljka; ostali slijede redom (priručnik ima 1–60). */
  odjeljak_od: number;
  izvor_oznaka: string;
  izvor_naslov: string;
  izvor_autor: string;
  izvor_godina: number | null;
  izvor_napomena: string;
  ukupno_stranica: number | null;
}

export interface CjelinaMd {
  meta: CjelinaMeta;
  poglavlje: SegPoglavlje;
}

function citajZaglavlje(tekst: string): { polja: Record<string, string>; tijelo: string } {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(tekst);
  if (!m) throw new Error('Cjelina nema zaglavlje (--- … ---) na početku datoteke.');
  const polja: Record<string, string> = {};
  for (const red of m[1].split('\n')) {
    const i = red.indexOf(':');
    if (i > 0) polja[red.slice(0, i).trim()] = red.slice(i + 1).trim();
  }
  return { polja, tijelo: tekst.slice(m[0].length) };
}

function obavezno(polja: Record<string, string>, kljuc: string): string {
  const v = polja[kljuc];
  if (!v) throw new Error(`Zaglavlju cjeline nedostaje „${kljuc}".`);
  return v;
}

export function parsirajCjelinu(tekst: string): CjelinaMd {
  const { polja, tijelo } = citajZaglavlje(tekst.replace(/\r\n?/g, '\n'));
  const broj = Number(obavezno(polja, 'broj'));
  if (!Number.isInteger(broj)) throw new Error(`Neispravan broj cjeline: ${polja.broj}`);

  const meta: CjelinaMeta = {
    broj,
    naslov: obavezno(polja, 'naslov'),
    dio: obavezno(polja, 'dio'),
    odjeljak_od: Number(obavezno(polja, 'odjeljak_od')),
    izvor_oznaka: obavezno(polja, 'izvor_oznaka'),
    izvor_naslov: obavezno(polja, 'izvor_naslov'),
    izvor_autor: polja.izvor_autor ?? '',
    izvor_godina: polja.izvor_godina ? Number(polja.izvor_godina) : null,
    izvor_napomena: polja.izvor_napomena ?? '',
    ukupno_stranica: polja.ukupno_stranica ? Number(polja.ukupno_stranica) : null,
  };

  const lekcije: SegLekcija[] = [];
  let lek: SegLekcija | null = null;
  let pododjeljak = '';
  let stranica = 1;
  let uKomentaru = false;
  let odlomak: string[] = [];

  const dodaj = (vrsta: Blok['vrsta'], tekst: string) => {
    if (!lek) throw new Error(`Tekst prije prvog odjeljka (## …): „${tekst.slice(0, 60)}"`);
    lek.blokovi.push({ vrsta, tekst, stranica, pododjeljak });
    lek.stranicaOd = Math.min(lek.stranicaOd, stranica);
    lek.stranicaDo = Math.max(lek.stranicaDo, stranica);
  };
  const zatvoriOdlomak = () => {
    if (odlomak.length) dodaj('tekst', odlomak.join(' '));
    odlomak = [];
  };

  for (const sirovi of tijelo.split('\n')) {
    const red = sirovi.trim();

    const oznaka = /^<!--\s*str\.\s*(\d+)\s*-->$/.exec(red);
    if (oznaka) {
      zatvoriOdlomak();
      stranica = Number(oznaka[1]);
      continue;
    }
    if (uKomentaru) {
      if (red.includes('-->')) uKomentaru = false;
      continue;
    }
    if (red.startsWith('<!--')) {
      zatvoriOdlomak();
      if (!red.includes('-->')) uKomentaru = true;
      continue;
    }

    if (red === '') {
      zatvoriOdlomak();
      continue;
    }

    const h2 = /^##\s+(\d{1,2}\.\d{1,2})\.?\s+(.+)$/.exec(red);
    if (h2) {
      zatvoriOdlomak();
      lek = {
        oznaka: h2[1],
        naslov: h2[2].trim(),
        stranicaOd: Infinity,
        stranicaDo: -Infinity,
        podnaslovi: [],
        blokovi: [],
      };
      lekcije.push(lek);
      pododjeljak = '';
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(red);
    if (h3) {
      zatvoriOdlomak();
      pododjeljak = h3[1].trim();
      dodaj('naslov3', pododjeljak);
      lek!.podnaslovi.push({ naslov: pododjeljak, stranica });
      continue;
    }

    const stavka = /^[-*]\s+(.+)$/.exec(red);
    if (stavka) {
      zatvoriOdlomak();
      dodaj('popis', stavka[1].trim());
      continue;
    }

    odlomak.push(red);
  }
  zatvoriOdlomak();

  if (lekcije.length === 0) throw new Error('Cjelina nema nijedan odjeljak (## N.M Naslov).');
  for (const l of lekcije) {
    if (!Number.isFinite(l.stranicaOd)) l.stranicaOd = l.stranicaDo = stranica;
    const kriva = l.oznaka.split('.')[0];
    if (Number(kriva) !== broj) {
      throw new Error(`Odjeljak ${l.oznaka} ne pripada cjelini ${broj}.`);
    }
  }

  return {
    meta,
    poglavlje: {
      broj,
      naslov: meta.naslov,
      dio: meta.dio,
      stranicaOd: Math.min(...lekcije.map((l) => l.stranicaOd)),
      stranicaDo: Math.max(...lekcije.map((l) => l.stranicaDo)),
      lekcije,
    },
  };
}
