/**
 * Ingest SAMOSTALNE nastavne cjeline zapisane u Markdownu (data/cjeline/*.md).
 *
 * Za cjeline koje nisu dio Word priručnika (npr. cjelina 12 — TOMAS Hrvatska
 * 2025./2026.). Upisuje isto što i `npm run ingest` za jedno poglavlje:
 * poglavlje (sa sažetkom cjeline), odjeljke, isječke i ugradnje. Izvor cjeline
 * zapisuje se kao zaseban red u `izvori` (vrsta 'prirucnik'), pa je cjelina u
 * zadanom opsegu dohvata, a izvor ostaje zabilježen.
 *
 * Neobavezno podiže i slike slajdova u Storage (`N cjelina/slajdovi/`), na
 * putanje koje navodi data/slajdovi/poglavlje-N.json.
 *
 * Pokretanje:
 *   npm run ingest:cjelina -- --datoteka=data/cjeline/poglavlje-12-tomas.md --suho
 *   npm run ingest:cjelina -- --datoteka=data/cjeline/poglavlje-12-tomas.md
 *   npm run ingest:cjelina -- --datoteka=… --slajdovi=materijali/tomas-slajdovi
 */
import fs from 'node:fs';
import path from 'node:path';
import { parsirajCjelinu } from '../lib/cjelina-md';
import { sazetakMarkdown, sazetakPoglavlja } from '../lib/prirucnik';
import { extractKeywords } from '../lib/chunking';
import { izradiIsjecke } from '../lib/isjecci';
import { embedTexts, l2norm } from '../lib/embeddings';
import { supabaseAdmin } from '../lib/supabase';

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho') || ARGS.includes('--dry-run');
const DATOTEKA = ARGS.find((a) => a.startsWith('--datoteka='))?.split('=')[1];
const SLAJDOVI = ARGS.find((a) => a.startsWith('--slajdovi='))?.split('=')[1];

async function main() {
  if (!DATOTEKA) {
    console.log('Navedite datoteku, npr.: npm run ingest:cjelina -- --datoteka=data/cjeline/poglavlje-12-tomas.md');
    return;
  }
  const put = path.resolve(process.cwd(), DATOTEKA);
  const { meta, poglavlje } = parsirajCjelinu(fs.readFileSync(put, 'utf8'));
  console.log(
    `[cjelina] ${meta.broj}. ${meta.naslov} — ${poglavlje.lekcije.length} odjeljaka, str. ${poglavlje.stranicaOd}–${poglavlje.stranicaDo}`,
  );

  const sb = SUHO ? null : supabaseAdmin();

  let izvorId = 'SUHO';
  let poglavljeId: string | null = null;
  if (sb) {
    const { data: izvor, error: e1 } = await sb
      .from('izvori')
      .upsert(
        {
          oznaka: meta.izvor_oznaka,
          vrsta: 'prirucnik',
          naslov: meta.izvor_naslov,
          autor: meta.izvor_autor,
          godina: meta.izvor_godina,
          jezik: 'hr',
          napomena: meta.izvor_napomena,
          ukupno_stranica: meta.ukupno_stranica,
        },
        { onConflict: 'oznaka' },
      )
      .select('id')
      .single();
    if (e1) throw new Error(`upsert izvora: ${e1.message}`);
    izvorId = izvor.id;

    const { data: pog, error: e2 } = await sb
      .from('poglavlja')
      .upsert(
        {
          broj: meta.broj,
          naslov: meta.naslov,
          dio: meta.dio,
          stranica_od: poglavlje.stranicaOd,
          stranica_do: poglavlje.stranicaDo,
          sazetak_md: sazetakPoglavlja(poglavlje),
        },
        { onConflict: 'broj' },
      )
      .select('id')
      .single();
    if (e2) throw new Error(`upsert poglavlja (${meta.broj}): ${e2.message}`);
    poglavljeId = pog.id;
  }

  let ukupnoIsjecaka = 0;
  for (const [i, lek] of poglavlje.lekcije.entries()) {
    const odjBroj = meta.odjeljak_od + i;
    const odjMeta = {
      oznaka: lek.oznaka,
      naslov: lek.naslov,
      stranica_od: lek.stranicaOd,
      stranica_do: lek.stranicaDo,
    };
    const isjecci = izradiIsjecke(lek, odjMeta);
    ukupnoIsjecaka += isjecci.length;
    console.log(
      `[cjelina] ${lek.oznaka} „${lek.naslov}" (str. ${lek.stranicaOd}–${lek.stranicaDo}): ${isjecci.length} isječaka`,
    );
    if (!sb) continue;

    const { data: odj, error: e3 } = await sb
      .from('odjeljci')
      .upsert(
        {
          poglavlje_id: poglavljeId,
          broj: odjBroj,
          oznaka: lek.oznaka,
          naslov: lek.naslov,
          stranica_od: lek.stranicaOd,
          stranica_do: lek.stranicaDo,
          redoslijed: odjBroj,
          sazetak_md: sazetakMarkdown(lek),
        },
        { onConflict: 'poglavlje_id,broj' },
      )
      .select('id')
      .single();
    if (e3) throw new Error(`upsert odjeljka (${lek.oznaka}): ${e3.message}`);

    if (isjecci.length === 0) continue;
    const ugradnje = await embedTexts(isjecci.map((c) => c.text));
    const { error: e4 } = await sb.rpc('upsert_chunkovi', {
      p_izvor_id: izvorId,
      p_odjeljak_id: odj.id,
      p_chunks: isjecci.map((c, j) => ({
        ...c,
        kljucne_rijeci: extractKeywords(c.text),
        embedding: ugradnje[j],
        norm: l2norm(ugradnje[j]),
      })),
    });
    if (e4) throw new Error(`upsert_chunkovi (${lek.oznaka}): ${e4.message}`);
  }

  if (SLAJDOVI) await podigniSlajdove(meta.broj, path.resolve(process.cwd(), SLAJDOVI));

  console.log(
    `[cjelina] Gotovo. Isječaka: ${ukupnoIsjecaka}${SUHO ? ' (suhi prolaz — ništa nije upisano)' : ''}`,
  );
}

/** Slike slajdova (slajd-01.png …) → Storage `N cjelina/slajdovi/`. */
async function podigniSlajdove(broj: number, mapa: string) {
  const slike = fs
    .readdirSync(mapa)
    .filter((f) => /^slajd-\d+\.(png|jpe?g|webp)$/i.test(f))
    .sort();
  if (slike.length === 0) {
    console.warn(`[cjelina] U mapi ${mapa} nema slika slajd-NN.png — preskačem slajdove.`);
    return;
  }
  for (const ime of slike) {
    const ext = ime.split('.').pop()!.toLowerCase();
    const tip = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const putanja = `${broj} cjelina/slajdovi/${ime}`;
    if (SUHO) {
      console.log(`  (suho) ${putanja}`);
      continue;
    }
    const { error } = await supabaseAdmin()
      .storage.from('mediji')
      .upload(putanja, fs.readFileSync(path.join(mapa, ime)), { contentType: tip, upsert: true });
    if (error) throw new Error(`Upload ${ime}: ${error.message}`);
  }
  console.log(`[cjelina] Slajdova podignuto: ${slike.length} → mediji/${broj} cjelina/slajdovi/`);
}

main().catch((err) => {
  console.error('[cjelina] GREŠKA:', err);
  process.exit(1);
});
