/**
 * Uvoz ciljeva učenja koje je pripremio ili potvrdio NASTAVNIK.
 *
 * Ulaz: JSON s poljem "ciljevi" (vidi data/ciljevi-poglavlje-12.json). Ciljevi
 * uneseni ovom skriptom odmah su `odobreno = true`, za razliku od nacrta iz
 * `npm run nacrti -- --ciljevi`. Ponovni uvoz zamjenjuje sve ciljeve istih
 * cjelina, pa se datoteka smije ispraviti i uvesti ponovno.
 *
 * Pokretanje:
 *   npm run ciljevi:uvezi -- --datoteka=data/ciljevi-poglavlje-12.json
 *   npm run ciljevi:uvezi -- --datoteka=… --suho     # samo provjera formata
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '../lib/supabase';

interface UlazniCilj {
  poglavlje_broj: number;
  tekst: string;
  kognitivna_razina?: string;
  stranica?: number;
}

const RAZINE = ['znanje', 'razumijevanje', 'primjena', 'analiza', 'vrednovanje'];
const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho');
const DATOTEKA = ARGS.find((a) => a.startsWith('--datoteka='))?.split('=')[1];

async function main() {
  if (!DATOTEKA) throw new Error('Navedite datoteku: --datoteka=data/ciljevi-poglavlje-N.json');
  const putanja = path.resolve(process.cwd(), DATOTEKA);
  const ciljevi: UlazniCilj[] = JSON.parse(fs.readFileSync(putanja, 'utf8')).ciljevi ?? [];
  if (ciljevi.length === 0) throw new Error('Datoteka ne sadrži polje "ciljevi" ili je prazno.');

  const greske = ciljevi.flatMap((c, i) => [
    ...(Number.isInteger(c.poglavlje_broj) ? [] : [`#${i + 1}: poglavlje_broj mora biti cijeli broj`]),
    ...(c.tekst?.trim() ? [] : [`#${i + 1}: nedostaje tekst`]),
    ...(!c.kognitivna_razina || RAZINE.includes(c.kognitivna_razina)
      ? []
      : [`#${i + 1}: kognitivna_razina mora biti jedna od: ${RAZINE.join(', ')}`]),
  ]);
  if (greske.length > 0) {
    console.error('[ciljevi] Neispravni ciljevi:\n  - ' + greske.join('\n  - '));
    process.exit(1);
  }
  console.log(`[ciljevi] Format je ispravan: ${ciljevi.length} ciljeva.`);
  if (SUHO) return;

  const sb = supabaseAdmin();
  const { data: poglavlja } = await sb.from('poglavlja').select('id, broj');
  const pogPoBroju = new Map((poglavlja ?? []).map((p) => [p.broj, p.id]));

  for (const broj of new Set(ciljevi.map((c) => c.poglavlje_broj))) {
    const poglavljeId = pogPoBroju.get(broj);
    if (!poglavljeId) throw new Error(`Cjelina ${broj} ne postoji u bazi.`);
    await sb.from('ciljevi_ucenja').delete().eq('poglavlje_id', poglavljeId);
  }

  const { error } = await sb.from('ciljevi_ucenja').insert(
    ciljevi.map((c, i) => ({
      poglavlje_id: pogPoBroju.get(c.poglavlje_broj),
      tekst: c.tekst.trim(),
      kognitivna_razina: c.kognitivna_razina ?? '',
      stranica: c.stranica ?? null,
      redoslijed: i,
      odobreno: true,
    })),
  );
  if (error) throw new Error(`unos ciljeva: ${error.message}`);
  console.log(`[ciljevi] Uneseno i odobreno: ${ciljevi.length} ciljeva.`);
}

main().catch((err) => {
  console.error('[ciljevi] GREŠKA:', err);
  process.exit(1);
});
