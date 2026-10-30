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
import { ucitajCjelinu } from '../lib/ingest-cjelina';
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
  const md = fs.readFileSync(path.resolve(process.cwd(), DATOTEKA), 'utf8');
  const { broj, isjecaka } = await ucitajCjelinu(md, { suho: SUHO });
  if (SLAJDOVI) await podigniSlajdove(broj, path.resolve(process.cwd(), SLAJDOVI));
  console.log(`[cjelina] Gotovo. Isječaka: ${isjecaka}${SUHO ? ' (suhi prolaz — ništa nije upisano)' : ''}`);
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
