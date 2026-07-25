/**
 * Ingest DOPUNSKIH izvora (PDF) — isključivo izvora navedenih u priručniku
 * (poglavlje „Literatura i izvori za daljnje učenje" te izvori spomenuti u
 * tekstu, npr. industrijsko izvješće Skift & McKinsey, 2025.).
 *
 * Dopunski izvori NISU u zadanom opsegu dohvata: chat ih uključuje tek na
 * izričit zahtjev (prekidač „Uključi dopunske izvore"), a citati ih uvijek
 * označavaju kao dopunske. Priručnik ostaje izvor istine.
 *
 * Ulaz:  PDF-ovi u mapi DOPUNSKI_DIR + registar data/dopunski-izvori.json
 *        (naslov, autor, godina, napomena — što skripta ne može pouzdano
 *        pročitati iz same datoteke).
 * Izlaz: redovi u tablicama izvori / chunkovi / ugradnje (lekcija_id = NULL).
 *
 * Pokretanje:
 *   npm run ingest:dopunski -- --suho
 *   npm run ingest:dopunski
 */
import fs from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse');
import { config } from '../lib/config';
import { chunkText, extractKeywords, normalizeText } from '../lib/chunking';
import { embedTexts, l2norm } from '../lib/embeddings';
import { supabaseAdmin } from '../lib/supabase';

interface RegistarStavka {
  oznaka: string;
  datoteka: string;
  naslov: string;
  autor: string;
  godina: number | null;
  jezik: string;
  url: string;
  napomena: string;
}

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho') || ARGS.includes('--dry-run');

async function main() {
  const registarPath = path.resolve(process.cwd(), 'data/dopunski-izvori.json');
  if (!fs.existsSync(registarPath)) {
    throw new Error(`Nedostaje registar dopunskih izvora: ${registarPath}`);
  }
  const registar: RegistarStavka[] = JSON.parse(fs.readFileSync(registarPath, 'utf8')).izvori;
  const mapa = path.resolve(process.cwd(), config.dopunskiDir);
  const sb = SUHO ? null : supabaseAdmin();

  let ukupno = 0;
  for (const stavka of registar) {
    const putanja = path.join(mapa, stavka.datoteka);
    if (!fs.existsSync(putanja)) {
      console.warn(`[dopunski] Preskačem „${stavka.naslov}" — datoteka nije pronađena: ${putanja}`);
      continue;
    }

    const stranice = await izvuciStranice(putanja);
    console.log(`[dopunski] ${stavka.oznaka}: ${stranice.length} stranica (${stavka.datoteka})`);

    const isjecci = isjecciPoStranicama(stranice);
    ukupno += isjecci.length;
    console.log(`[dopunski] ${stavka.oznaka}: ${isjecci.length} isječaka`);
    if (!sb) continue;

    const { data: izvor, error } = await sb
      .from('izvori')
      .upsert(
        {
          oznaka: stavka.oznaka,
          vrsta: 'dopunski',
          naslov: stavka.naslov,
          autor: stavka.autor,
          godina: stavka.godina,
          jezik: stavka.jezik,
          url: stavka.url,
          napomena: stavka.napomena,
          ukupno_stranica: stranice.length,
        },
        { onConflict: 'oznaka' },
      )
      .select('id')
      .single();
    if (error) throw new Error(`upsert izvora (${stavka.oznaka}): ${error.message}`);

    if (isjecci.length === 0) continue;
    const ugradnje = await embedTexts(isjecci.map((c) => c.text));
    const payload = isjecci.map((c, i) => ({
      chunk_index: c.chunk_index,
      text: c.text,
      stranica_od: c.stranica_od,
      stranica_do: c.stranica_do,
      naslov_odjeljka: stavka.naslov,
      kljucne_rijeci: extractKeywords(c.text),
      tokens_est: c.tokens_est,
      embedding: ugradnje[i],
      norm: l2norm(ugradnje[i]),
    }));

    const { error: rpcErr } = await sb.rpc('upsert_chunkovi', {
      p_izvor_id: izvor.id,
      p_lekcija_id: null,
      p_chunks: payload,
    });
    if (rpcErr) throw new Error(`upsert_chunkovi (${stavka.oznaka}): ${rpcErr.message}`);
  }

  console.log(`[dopunski] Gotovo. Isječaka: ${ukupno}${SUHO ? ' (suhi prolaz)' : ''}`);
}

async function izvuciStranice(putanja: string): Promise<{ broj: number; text: string }[]> {
  const stranice: { broj: number; text: string }[] = [];
  function pagerender(pageData: any) {
    return pageData
      .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
      .then((tc: any) => {
        let lastY: number | undefined;
        let text = '';
        for (const item of tc.items) {
          if (lastY === item.transform[5] || lastY === undefined) text += item.str;
          else text += '\n' + item.str;
          lastY = item.transform[5];
        }
        stranice.push({ broj: pageData.pageIndex + 1, text });
        return text;
      });
  }
  await pdf(fs.readFileSync(putanja), { pagerender });
  stranice.sort((a, b) => a.broj - b.broj);
  return stranice;
}

/** Isječci ograničeni na jednu stranicu — u izvješćima je stranica prirodna cjelina. */
function isjecciPoStranicama(stranice: { broj: number; text: string }[]) {
  const out: {
    chunk_index: number;
    text: string;
    tokens_est: number;
    stranica_od: number;
    stranica_do: number;
  }[] = [];
  for (const s of stranice) {
    const tekst = normalizeText(s.text);
    if (tekst.length < 200) continue; // naslovnice, sadržaj, prazne stranice
    for (const c of chunkText(tekst)) {
      out.push({
        chunk_index: out.length,
        text: c.text,
        tokens_est: c.tokens_est,
        stranica_od: s.broj,
        stranica_do: s.broj,
      });
    }
  }
  return out;
}

main().catch((err) => {
  console.error('[dopunski] GREŠKA:', err);
  process.exit(1);
});
