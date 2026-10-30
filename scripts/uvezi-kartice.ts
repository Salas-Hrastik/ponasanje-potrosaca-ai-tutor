/**
 * Uvoz kartica za učenje koje je pripremio ili potvrdio NASTAVNIK.
 *
 * Ulaz: JSON s poljem "kartice" (vidi data/kartice-poglavlje-12.json). Kartice
 * unesene ovom skriptom odmah su `odobreno = true`, za razliku od nacrta iz
 * `npm run nacrti -- --kartice`. Ponovni uvoz zamjenjuje nastavnikove kartice
 * istih cjelina, pa se datoteka smije ispraviti i uvesti ponovno.
 *
 * Pokretanje:
 *   npm run kartice:uvezi -- --datoteka=data/kartice-poglavlje-12.json
 *   npm run kartice:uvezi -- --datoteka=… --suho     # samo provjera formata
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '../lib/supabase';

interface UlaznaKartica {
  poglavlje_broj: number;
  odjeljak_oznaka?: string;
  pojam: string;
  definicija: string;
  stranica_ref?: string;
}

const ARGS = process.argv.slice(2);
const SUHO = ARGS.includes('--suho');
const DATOTEKA = ARGS.find((a) => a.startsWith('--datoteka='))?.split('=')[1];

async function main() {
  if (!DATOTEKA) throw new Error('Navedite datoteku: --datoteka=data/kartice-poglavlje-N.json');
  const putanja = path.resolve(process.cwd(), DATOTEKA);
  const kartice: UlaznaKartica[] = JSON.parse(fs.readFileSync(putanja, 'utf8')).kartice ?? [];
  if (kartice.length === 0) throw new Error('Datoteka ne sadrži polje "kartice" ili je prazno.');

  const greske = kartice.flatMap((k, i) => [
    ...(Number.isInteger(k.poglavlje_broj) ? [] : [`#${i + 1}: poglavlje_broj mora biti cijeli broj`]),
    ...(k.pojam?.trim() ? [] : [`#${i + 1}: nedostaje pojam`]),
    ...(k.definicija?.trim() ? [] : [`#${i + 1}: nedostaje definicija`]),
  ]);
  if (greske.length > 0) {
    console.error('[kartice] Neispravne kartice:\n  - ' + greske.join('\n  - '));
    process.exit(1);
  }
  console.log(`[kartice] Format je ispravan: ${kartice.length} kartica.`);
  if (SUHO) return;

  const sb = supabaseAdmin();
  const { data: poglavlja } = await sb.from('poglavlja').select('id, broj');
  const { data: odjeljci } = await sb.from('odjeljci').select('id, oznaka');
  const pogPoBroju = new Map((poglavlja ?? []).map((p) => [p.broj, p.id]));
  const odjPoOznaci = new Map((odjeljci ?? []).filter((o) => o.oznaka).map((o) => [o.oznaka, o.id]));

  for (const broj of new Set(kartice.map((k) => k.poglavlje_broj))) {
    const poglavljeId = pogPoBroju.get(broj);
    if (!poglavljeId) throw new Error(`Cjelina ${broj} ne postoji u bazi.`);
    await sb.from('kartice').delete().eq('poglavlje_id', poglavljeId).eq('izvor_unosa', 'nastavnik');
  }

  const { error } = await sb.from('kartice').insert(
    kartice.map((k, i) => ({
      poglavlje_id: pogPoBroju.get(k.poglavlje_broj),
      odjeljak_id: k.odjeljak_oznaka ? odjPoOznaci.get(k.odjeljak_oznaka) ?? null : null,
      pojam: k.pojam.trim(),
      definicija: k.definicija.trim(),
      stranica_ref: k.stranica_ref ?? '',
      redoslijed: i,
      odobreno: true,
      izvor_unosa: 'nastavnik',
    })),
  );
  if (error) throw new Error(`unos kartica: ${error.message}`);
  console.log(`[kartice] Uneseno i odobreno: ${kartice.length} kartica.`);
}

main().catch((err) => {
  console.error('[kartice] GREŠKA:', err);
  process.exit(1);
});
