/**
 * Ingest priručnika — glavni korak RAG cjevovoda.
 *
 * Ulaz:  lokalni DOCX priručnika (PRIRUCNIK_DOCX_PATH; NIKAD se ne commita) +
 *        potvrđena struktura data/sadrzaj.json (vidi npm run struktura).
 * Izlaz: redovi u Supabaseu — izvori, poglavlja (nastavne cjeline, sa sažetkom
 *        cjeline), odjeljci, chunkovi i ugradnje. Mediji NE ulaze ovom skriptom;
 *        njih nastavnik učitava u Supabase Storage.
 *
 * Sažetak cjeline (poglavlja.sazetak_md) je DOSLOVNI tekst cijelog poglavlja
 * pretvoren u Markdown — odjeljci su naslovi druge razine, pododjeljci treće.
 * Ništa se ne prepričava ni ne dodaje; taj je sažetak podloga za kartice i kviz.
 *
 * Pokretanje:
 *   npm run ingest -- --suho            # bez upisa u bazu i bez embeddinga
 *   npm run ingest -- --poglavlje=4     # samo jedna cjelina (testiranje)
 *   npm run ingest                      # puni ingest priručnika
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config';
import { readDocx } from '../lib/docx';
import {
  segmentirajPrirucnik,
  sazetakMarkdown,
  sazetakPoglavlja,
  type SegLekcija,
} from '../lib/prirucnik';
import { extractKeywords } from '../lib/chunking';
import { izradiIsjecke } from '../lib/isjecci';
import { embedTexts, l2norm } from '../lib/embeddings';
import { supabaseAdmin } from '../lib/supabase';

interface SadrzajOdjeljak {
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
  odjeljci: SadrzajOdjeljak[];
}
interface Sadrzaj {
  izvor: { oznaka: string; naslov: string; ustanova: string; ukupno_stranica: number };
  poglavlja: SadrzajPoglavlje[];
}

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho') || ARGS.includes('--dry-run');
const SAMO_POGLAVLJE = ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];

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
  console.log(
    `[ingest] Segmentirano: ${segmenti.length} cjelina, ${segmenti.flatMap((p) => p.lekcije).length} odjeljaka, ${ukupnoStranica} stranica.`,
  );

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
    if (SAMO_POGLAVLJE && String(pogSadrzaj.broj) !== SAMO_POGLAVLJE) continue;

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
            sazetak_md: sazetakPoglavlja(pogSeg),
          },
          { onConflict: 'broj' },
        )
        .select('id')
        .single();
      if (error) throw new Error(`upsert poglavlja (${pogSadrzaj.broj}): ${error.message}`);
      poglavljeId = data.id;
    }

    for (const odjSadrzaj of pogSadrzaj.odjeljci) {
      const odjSeg = nadjiOdjeljak(pogSeg.lekcije, odjSadrzaj);
      if (!odjSeg) {
        console.warn(
          `[ingest] UPOZORENJE: odjeljak ${odjSadrzaj.oznaka || odjSadrzaj.broj} „${odjSadrzaj.naslov}" nije pronađen u DOCX-u — preskačem.`,
        );
        nepovezanih++;
        continue;
      }

      const isjecci = izradiIsjecke(odjSeg, odjSadrzaj);
      ukupnoIsjecaka += isjecci.length;
      console.log(
        `[ingest] Pogl. ${pogSadrzaj.broj} · ${odjSadrzaj.oznaka || '—'} „${odjSadrzaj.naslov}" (str. ${odjSadrzaj.stranica_od}–${odjSadrzaj.stranica_do}): ${isjecci.length} isječaka`,
      );

      if (!sb) continue;

      const { data: odjData, error: odjErr } = await sb
        .from('odjeljci')
        .upsert(
          {
            poglavlje_id: poglavljeId,
            broj: odjSadrzaj.broj,
            oznaka: odjSadrzaj.oznaka,
            naslov: odjSadrzaj.naslov,
            stranica_od: odjSadrzaj.stranica_od,
            stranica_do: odjSadrzaj.stranica_do,
            redoslijed: odjSadrzaj.broj,
            sazetak_md: sazetakMarkdown(odjSeg),
          },
          { onConflict: 'poglavlje_id,broj' },
        )
        .select('id')
        .single();
      if (odjErr) throw new Error(`upsert odjeljka (${odjSadrzaj.broj}): ${odjErr.message}`);

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
        p_odjeljak_id: odjData.id,
        p_chunks: payload,
      });
      if (rpcErr) throw new Error(`upsert_chunkovi (odjeljak ${odjSadrzaj.broj}): ${rpcErr.message}`);
    }
  }

  console.log(
    `[ingest] Gotovo. Isječaka: ${ukupnoIsjecaka}${nepovezanih ? `, nepovezanih stavki: ${nepovezanih}` : ''}${SUHO ? ' (suhi prolaz — ništa nije upisano)' : ''}`,
  );
  if (nepovezanih > 0) {
    console.warn('[ingest] Provjerite poklapa li se data/sadrzaj.json s naslovima u priručniku (npm run struktura -- --provjeri).');
  }
}

/** Poklapanje odjeljka iz sadrzaj.json sa segmentom DOCX-a: po oznaci, pa po naslovu. */
function nadjiOdjeljak(segmenti: SegLekcija[], trazena: SadrzajOdjeljak): SegLekcija | undefined {
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

main().catch((err) => {
  console.error('[ingest] GREŠKA:', err);
  process.exit(1);
});
