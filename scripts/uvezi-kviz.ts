/**
 * Uvoz kviza koji je isporučio NASTAVNIK (korak 4 radnog tijeka punjenja sadržaja).
 *
 * Ulaz: JSON u obliku data/kviz-predlozak.json. Pitanja unesena ovom skriptom
 * odmah su `odobreno = true` (nastavnik je autor), za razliku od nacrta iz
 * `npm run nacrti` koji čekaju odobrenje.
 *
 * Pokretanje:
 *   npm run kviz:uvezi -- --datoteka=data/kviz-poglavlje-4.json
 *   npm run kviz:uvezi -- --datoteka=… --suho     # samo provjera formata
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '../lib/supabase';

interface UlaznoPitanje {
  poglavlje_broj: number;
  odjeljak_oznaka?: string;
  pitanje: string;
  odgovori: string[];
  tocan_index: number;
  objasnjenje?: string;
  stranica_ref?: string;
}

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho');
const DATOTEKA = ARGS.find((a) => a.startsWith('--datoteka='))?.split('=')[1] ?? 'data/kviz-predlozak.json';

async function main() {
  const putanja = path.resolve(process.cwd(), DATOTEKA);
  if (!fs.existsSync(putanja)) throw new Error(`Datoteka nije pronađena: ${putanja}`);

  const ulaz = JSON.parse(fs.readFileSync(putanja, 'utf8'));
  const pitanja: UlaznoPitanje[] = ulaz.pitanja ?? [];
  if (pitanja.length === 0) throw new Error('Datoteka ne sadrži polje "pitanja" ili je prazno.');

  const greske = provjeri(pitanja);
  if (greske.length > 0) {
    console.error('[kviz] Neispravna pitanja:');
    for (const g of greske) console.error('  - ' + g);
    process.exit(1);
  }
  console.log(`[kviz] Format je ispravan: ${pitanja.length} pitanja.`);
  if (SUHO) return;

  const sb = supabaseAdmin();
  const { data: poglavlja } = await sb.from('poglavlja').select('id, broj');
  const { data: odjeljci } = await sb.from('odjeljci').select('id, oznaka');
  const pogPoBroju = new Map((poglavlja ?? []).map((p) => [p.broj, p.id]));
  const odjPoOznaci = new Map((odjeljci ?? []).filter((o) => o.oznaka).map((o) => [o.oznaka, o.id]));

  let uneseno = 0;
  for (const p of pitanja) {
    const poglavljeId = pogPoBroju.get(p.poglavlje_broj);
    if (!poglavljeId) {
      console.warn(`[kviz] Cjelina ${p.poglavlje_broj} ne postoji u bazi — preskačem pitanje: ${p.pitanje.slice(0, 60)}…`);
      continue;
    }
    const { error } = await sb.from('kviz_pitanja').insert({
      poglavlje_id: poglavljeId,
      odjeljak_id: p.odjeljak_oznaka ? odjPoOznaci.get(p.odjeljak_oznaka) ?? null : null,
      pitanje: p.pitanje,
      odgovori: p.odgovori,
      tocan_index: p.tocan_index,
      objasnjenje: p.objasnjenje ?? '',
      stranica_ref: p.stranica_ref ?? '',
      odobreno: true,
      izvor_unosa: 'nastavnik',
    });
    if (error) throw new Error(`unos pitanja: ${error.message}`);
    uneseno++;
  }

  console.log(`[kviz] Uneseno i odobreno: ${uneseno} pitanja.`);
}

function provjeri(pitanja: UlaznoPitanje[]): string[] {
  const greske: string[] = [];
  pitanja.forEach((p, i) => {
    const oznaka = `#${i + 1}`;
    if (!p.pitanje?.trim()) greske.push(`${oznaka}: nedostaje tekst pitanja`);
    if (!Number.isInteger(p.poglavlje_broj)) greske.push(`${oznaka}: poglavlje_broj mora biti cijeli broj`);
    if (!Array.isArray(p.odgovori) || p.odgovori.length !== 4) {
      greske.push(`${oznaka}: mora imati točno 4 ponuđena odgovora`);
    } else if (p.odgovori.some((o) => !o?.trim())) {
      greske.push(`${oznaka}: prazan ponuđeni odgovor`);
    }
    if (!Number.isInteger(p.tocan_index) || p.tocan_index < 0 || p.tocan_index > 3) {
      greske.push(`${oznaka}: tocan_index mora biti 0–3`);
    }
  });
  return greske;
}

main().catch((err) => {
  console.error('[kviz] GREŠKA:', err);
  process.exit(1);
});
