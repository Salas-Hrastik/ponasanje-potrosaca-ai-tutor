/**
 * Minimalni čitač DOCX-a (OOXML) za ingest — SAMO Node (skripte), ne web build.
 *
 * Zašto vlastiti čitač: gotove biblioteke (mammoth i sl.) daju HTML/tekst, ali
 * gube dvije stvari koje su nam presudne:
 *   1) stil odlomka (Heading1/Heading2/Heading3) — nosi hijerarhiju poglavlje →
 *      lekcija → pododjeljak;
 *   2) `w:lastRenderedPageBreak` — oznaku koju Word upisuje pri paginaciji, iz
 *      koje rekonstruiramo STVARNE brojeve stranica priručnika. Bez toga ne
 *      bismo mogli citirati stranicu, a citat stranice je uvjet vjernosti izvoru.
 *
 * Parsiranje je namjerno jednostavno: linearni prolaz kroz XML oznake uz
 * praćenje stanja. document.xml je strojno generiran i ravnog oblika (w:p,
 * w:tbl, w:r, w:t), pa nam potpuni XML DOM ovdje ne donosi ništa.
 */
import fs from 'node:fs';
import JSZip from 'jszip';

export type ParaVrsta = 'naslov1' | 'naslov2' | 'naslov3' | 'popis' | 'tekst' | 'tablica';

export interface DocxOdlomak {
  vrsta: ParaVrsta;
  tekst: string;
  /** Stranica na kojoj odlomak počinje (1-based, prema Wordovoj paginaciji). */
  stranicaOd: number;
  /** Stranica na kojoj odlomak završava. */
  stranicaDo: number;
}

export interface DocxDokument {
  odlomci: DocxOdlomak[];
  ukupnoStranica: number;
}

const STIL_U_VRSTU: Record<string, ParaVrsta> = {
  Heading1: 'naslov1',
  Heading2: 'naslov2',
  Heading3: 'naslov3',
  ListParagraph: 'popis',
};

export async function readDocx(putanja: string): Promise<DocxDokument> {
  if (!fs.existsSync(putanja)) {
    throw new Error(
      `DOCX nije pronađen: ${putanja}\nPostavite PRIRUCNIK_DOCX_PATH u .env.local na lokalnu putanju priručnika (datoteka se NE commita u git).`,
    );
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(putanja));
  const dio = zip.file('word/document.xml');
  if (!dio) throw new Error(`Neispravan DOCX (nedostaje word/document.xml): ${putanja}`);
  return parseDocumentXml(await dio.async('string'));
}

export function parseDocumentXml(xml: string): DocxDokument {
  const odlomci: DocxOdlomak[] = [];
  let stranica = 1;

  // Stanje tekućeg odlomka (w:p) odnosno tablice (w:tbl).
  let uOdlomku = false;
  let uTablici = false;
  let uTekstu = false;
  let stil = '';
  let dijelovi: string[] = [];
  let pocetnaStranica = 1;
  let celijeTablice: string[] = [];

  const tagRe = /<([^>]+)>/g;
  let zadnjiKraj = 0;
  let m: RegExpExecArray | null;

  const zavrsiOdlomak = () => {
    const tekst = ocistiTekst(dijelovi.join(''));
    if (tekst) {
      odlomci.push({
        vrsta: STIL_U_VRSTU[stil] ?? 'tekst',
        tekst,
        stranicaOd: pocetnaStranica,
        stranicaDo: stranica,
      });
    }
    uOdlomku = false;
    stil = '';
    dijelovi = [];
  };

  while ((m = tagRe.exec(xml)) !== null) {
    const tag = m[1];
    const ime = tag.replace(/^\//, '').split(/[\s/>]/)[0];

    // Tekst između oznaka pripada tekućem <w:t> elementu.
    if (uTekstu) {
      const sadrzaj = xml.slice(zadnjiKraj, m.index);
      if (sadrzaj) dijelovi.push(dekodiraj(sadrzaj));
    }
    zadnjiKraj = tagRe.lastIndex;

    if (tag.startsWith('/')) {
      if (ime === 'w:t') uTekstu = false;
      else if (ime === 'w:p' && uOdlomku) {
        if (uTablici) {
          const t = ocistiTekst(dijelovi.join(''));
          if (t) celijeTablice.push(t);
          uOdlomku = false;
          stil = '';
          dijelovi = [];
        } else {
          zavrsiOdlomak();
        }
      } else if (ime === 'w:tbl') {
        uTablici = false;
        const tekst = celijeTablice.join(' · ');
        if (tekst) {
          odlomci.push({ vrsta: 'tablica', tekst, stranicaOd: pocetnaStranica, stranicaDo: stranica });
        }
        celijeTablice = [];
      }
      continue;
    }

    switch (ime) {
      case 'w:tbl':
        uTablici = true;
        celijeTablice = [];
        pocetnaStranica = stranica;
        break;
      case 'w:p':
        uOdlomku = true;
        dijelovi = [];
        stil = '';
        if (!uTablici) pocetnaStranica = stranica;
        // Samozatvarajući <w:p/> je prazan odlomak.
        if (tag.endsWith('/')) uOdlomku = false;
        break;
      case 'w:pStyle': {
        const val = /w:val="([^"]*)"/.exec(tag);
        if (val) stil = val[1];
        break;
      }
      case 'w:pageBreakBefore':
        // Word bilježi prijelom prije odlomka; odlomak time počinje na novoj stranici.
        if (!tag.includes('w:val="0"')) {
          stranica += 1;
          pocetnaStranica = stranica;
        }
        break;
      case 'w:lastRenderedPageBreak':
        stranica += 1;
        break;
      case 'w:br':
        if (/w:type="page"/.test(tag)) stranica += 1;
        break;
      case 'w:t':
        if (!tag.endsWith('/')) uTekstu = true;
        break;
      case 'w:tab':
        dijelovi.push(' ');
        break;
      default:
        break;
    }
  }

  if (uOdlomku) zavrsiOdlomak();

  return { odlomci, ukupnoStranica: stranica };
}

function dekodiraj(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function ocistiTekst(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
