/**
 * Ingest priručnika — glavni korak RAG cjevovoda.
 *
 * Ulaz:  lokalni DOCX priručnika (PRIRUCNIK_DOCX_PATH; NIKAD se ne commita) +
 *        potvrđena struktura data/sadrzaj.json (vidi npm run struktura).
 * Izlaz: redovi u Supabaseu — izvori, poglavlja, lekcije (sa sažetkom),
 *        chunkovi i ugradnje. Mediji NE ulaze ovom skriptom; njih nastavnik
 *        učitava u Supabase Storage prema konvenciji NN-kratki-opis.ext.
 *
 * Sažetak lekcije (sazetak_md) je DOSLOVNI tekst pripadajućeg odjeljka
 * priručnika pretvoren u Markdown — ništa se ne prepričava ni ne dodaje.
 *
 * Pokretanje:
 *   npm run ingest -- --suho            # bez upisa u bazu i bez embeddinga
 *   npm run ingest -- --lekcija=22      # samo jedna lekcija (testiranje)
 *   npm run ingest                      # puni ingest priručnika
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config';
import { readDocx } from '../lib/docx';
import { segmentirajPrirucnik, sazetakMarkdown, blokoviZaChunking, type SegLekcija } from '../lib/prirucnik';
import { extractKeywords, normalizeText, splitBySentences } from '../lib/chunking';
import { embedTexts, l2norm } from '../lib/embeddings';
import { supabaseAdmin } from '../lib/supabase';

interface SadrzajLekcija {
  broj: number;
  oznaka: string;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
}
interface SadrzajPoglavlje {
  broj: number;
  naslov: string;
  dio: string;
  stranica_od: number;
  stranica_do: number;
  lekcije: SadrzajLekcija[];
}
interface Sadrzaj {
  izvor: { oznaka: string; naslov: string; ustanova: string; ukupno_stranica: number };
  poglavlja: SadrzajPoglavlje[];
}

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho') || ARGS.includes('--dry-run');
const SAMO_LEKCIJA = ARGS.find((a) => a.startsWith('--lekcija='))?.split('=')[1];

async function main() {
  const docxPath = path.resolve(process.cwd(), config.prirucnikDocxPath);
  const sadrzajPath = path.resolve(process.cwd(), 'data/sadrzaj.json');
  if (!fs.existsSync(sadrzajPath)) {
    throw new Error(`Nedostaje ${sadrzajPath}. Pokrenite prvo: npm run struktura`);
  }
  const sadrzaj: Sadrzaj = JSON.parse(fs.readFileSync(sadrzajPath, 'utf8'));

  console.log(`[ingest] Čitam priručnik: ${docxPath}`);
  const { odlomci, ukupnoStranica } = await readDocx(docxPath);
  const segmenti = segmentirajPrirucnik(odlomci, ukupnoStranica);
  console.log(`[ingest] Segmentirano: ${segmenti.length} poglavlja, ${segmenti.flatMap((p) => p.lekcije).length} lekcija, ${ukupnoStranica} stranica.`);

  const sb = SUHO ? null : supabaseAdmin();

  // --- Izvor -----------------------------------------------------------------
  let izvorId = 'SUHO';
  if (sb) {
    const { data, error } = await sb
      .from('izvori')
      .upsert(
        {
          oznaka: 'prirucnik',
          vrsta: 'prirucnik',
          naslov: sadrzaj.izvor.naslov,
          autor: sadrzaj.izvor.ustanova,
          jezik: 'hr',
          napomena: 'Izvor istine kolegija — svi odgovori asistenta citiraju ovaj priručnik.',
          ukupno_stranica: ukupnoStranica,
        },
        { onConflict: 'oznaka' },
      )
      .select('id')
      .single();
    if (error) throw new Error(`upsert izvora: ${error.message}`);
    izvorId = data.id;
  }

  let ukupnoIsjecaka = 0;
  let nepovezanih = 0;

  for (const pogSadrzaj of sadrzaj.poglavlja) {
    const pogSeg = segmenti.find((p) => p.broj === pogSadrzaj.broj);
    if (!pogSeg) {
      console.warn(`[ingest] UPOZORENJE: poglavlje ${pogSadrzaj.broj} iz sadrzaj.json nije pronađeno u DOCX-u — preskačem.`);
      nepovezanih++;
      continue;
    }

    let poglavljeId: string | null = null;
    if (sb) {
      const { data, error } = await sb
        .from('poglavlja')
        .upsert(
          {
            broj: pogSadrzaj.broj,
            naslov: pogSadrzaj.naslov,
            dio: pogSadrzaj.dio,
            stranica_od: pogSadrzaj.stranica_od,
            stranica_do: pogSadrzaj.stranica_do,
          },
          { onConflict: 'broj' },
        )
        .select('id')
        .single();
      if (error) throw new Error(`upsert poglavlja (${pogSadrzaj.broj}): ${error.message}`);
      poglavljeId = data.id;
    }

    for (const lekSadrzaj of pogSadrzaj.lekcije) {
      if (SAMO_LEKCIJA && String(lekSadrzaj.broj) !== SAMO_LEKCIJA) continue;

      const lekSeg = nadjiLekciju(pogSeg.lekcije, lekSadrzaj);
      if (!lekSeg) {
        console.warn(`[ingest] UPOZORENJE: lekcija L${lekSadrzaj.broj} „${lekSadrzaj.naslov}" nije pronađena u DOCX-u — preskačem.`);
        nepovezanih++;
        continue;
      }

      const isjecci = izradiIsjecke(lekSeg, lekSadrzaj);
      ukupnoIsjecaka += isjecci.length;
      console.log(
        `[ingest] Pogl. ${pogSadrzaj.broj} / L${lekSadrzaj.broj} ${lekSadrzaj.oznaka} „${lekSadrzaj.naslov}" (str. ${lekSadrzaj.stranica_od}–${lekSadrzaj.stranica_do}): ${isjecci.length} isječaka`,
      );

      if (!sb) continue;

      const { data: lekData, error: lekErr } = await sb
        .from('lekcije')
        .upsert(
          {
            poglavlje_id: poglavljeId,
            broj: lekSadrzaj.broj,
            oznaka: lekSadrzaj.oznaka,
            naslov: lekSadrzaj.naslov,
            stranica_od: lekSadrzaj.stranica_od,
            stranica_do: lekSadrzaj.stranica_do,
            redoslijed: lekSadrzaj.broj,
            sazetak_md: sazetakMarkdown(lekSeg),
          },
          { onConflict: 'poglavlje_id,broj' },
        )
        .select('id')
        .single();
      if (lekErr) throw new Error(`upsert lekcije (L${lekSadrzaj.broj}): ${lekErr.message}`);

      if (isjecci.length === 0) continue;

      const ugradnje = await embedTexts(isjecci.map((c) => c.text));
      const payload = isjecci.map((c, i) => ({
        chunk_index: c.chunk_index,
        text: c.text,
        stranica_od: c.stranica_od,
        stranica_do: c.stranica_do,
        naslov_odjeljka: c.naslov_odjeljka,
        kljucne_rijeci: extractKeywords(c.text),
        tokens_est: c.tokens_est,
        embedding: ugradnje[i],
        norm: l2norm(ugradnje[i]),
      }));

      const { error: rpcErr } = await sb.rpc('upsert_chunkovi', {
        p_izvor_id: izvorId,
        p_lekcija_id: lekData.id,
        p_chunks: payload,
      });
      if (rpcErr) throw new Error(`upsert_chunkovi (L${lekSadrzaj.broj}): ${rpcErr.message}`);
    }
  }

  console.log(
    `[ingest] Gotovo. Isječaka: ${ukupnoIsjecaka}${nepovezanih ? `, nepovezanih stavki: ${nepovezanih}` : ''}${SUHO ? ' (suhi prolaz — ništa nije upisano)' : ''}`,
  );
  if (nepovezanih > 0) {
    console.warn('[ingest] Provjerite poklapa li se data/sadrzaj.json s naslovima u priručniku (npm run struktura -- --provjeri).');
  }
}

/** Poklapanje lekcije iz sadrzaj.json sa segmentom DOCX-a: po oznaci, pa po naslovu. */
function nadjiLekciju(segmenti: SegLekcija[], trazena: SadrzajLekcija): SegLekcija | undefined {
  if (trazena.oznaka) {
    const poOznaci = segmenti.find((s) => s.oznaka === trazena.oznaka);
    if (poOznaci) return poOznaci;
  }
  const cilj = kljuc(trazena.naslov);
  return segmenti.find((s) => kljuc(s.naslov) === cilj);
}

/** Ključ za usporedbu naslova: bez dijakritika, interpunkcije i razmaka. */
function kljuc(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

interface Isjecak {
  chunk_index: number;
  text: string;
  tokens_est: number;
  stranica_od: number;
  stranica_do: number;
  naslov_odjeljka: string;
}

/**
 * Chunking uz praćenje stranica: blokovi se pakiraju do MAX_CHUNK_TOKENS, a
 * svakom isječku se pamti najmanja i najveća stranica blokova koje sadrži —
 * odatle dolazi raspon stranica u citatu.
 */
function izradiIsjecke(lek: SegLekcija, meta: SadrzajLekcija): Isjecak[] {
  const maxChars = config.maxChunkTokens * 4;
  const overlapChars = config.chunkOverlapTokens * 4;
  const oznakaOdjeljka = meta.oznaka ? `${meta.oznaka} ${meta.naslov}` : meta.naslov;

  const blokovi = blokoviZaChunking(lek).flatMap((b) => {
    const tekst = normalizeText(b.tekst);
    if (tekst.length <= maxChars) return [{ ...b, tekst }];
    return splitBySentences(tekst, maxChars).map((dio) => ({ ...b, tekst: dio }));
  });

  const isjecci: Isjecak[] = [];
  let buffer = '';
  let odjeljak = oznakaOdjeljka;
  let pMin = Infinity;
  let pMax = -Infinity;

  const flush = () => {
    const t = buffer.trim();
    if (!t) return;
    isjecci.push({
      chunk_index: isjecci.length,
      text: t,
      tokens_est: Math.ceil(t.length / 4),
      stranica_od: Number.isFinite(pMin) ? pMin : meta.stranica_od,
      stranica_do: Number.isFinite(pMax) ? pMax : meta.stranica_do,
      naslov_odjeljka: odjeljak,
    });
  };

  for (const b of blokovi) {
    if (buffer.length + b.tekst.length + 2 > maxChars && buffer.length > 0) {
      flush();
      buffer = buffer.slice(Math.max(0, buffer.length - overlapChars));
      pMin = b.stranica;
      pMax = b.stranica;
    }
    buffer += (buffer ? '\n\n' : '') + b.tekst;
    odjeljak = b.pododjeljak ? `${oznakaOdjeljka} — ${b.pododjeljak}` : oznakaOdjeljka;
    pMin = Math.min(pMin, b.stranica);
    pMax = Math.max(pMax, b.stranica);
  }
  flush();

  return isjecci;
}

main().catch((err) => {
  console.error('[ingest] GREŠKA:', err);
  process.exit(1);
});
