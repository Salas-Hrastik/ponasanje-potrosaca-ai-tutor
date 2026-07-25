/**
 * Korak 1 radnog tijeka punjenja sadržaja: iz priručnika (DOCX) izvuci
 * strukturu kolegija u data/sadrzaj.json — poglavlja, lekcije, oznake odjeljaka,
 * rasponi stranica i pododjeljci.
 *
 * NASTAVNIK zatim POTVRĐUJE mapiranje: datoteka se smije ručno urediti (spojiti
 * dvije lekcije, preimenovati naslov, promijeniti redoslijed). Ingest čita
 * upravo tu potvrđenu datoteku, pa se izvorne oznake iz dokumenta ne uzimaju
 * zdravo za gotovo.
 *
 * Pokretanje:
 *   npm run struktura                 # ispiše sažetak i upiše data/sadrzaj.json
 *   npm run struktura -- --provjeri   # samo ispis, bez pisanja (usporedba s postojećim)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config';
import { readDocx } from '../lib/docx';
import { segmentirajPrirucnik } from '../lib/prirucnik';

const ARGS = process.argv.slice(2);
const SAMO_PROVJERA = ARGS.includes('--provjeri');
const IZLAZ = path.resolve(process.cwd(), 'data/sadrzaj.json');

async function main() {
  const putanja = path.resolve(process.cwd(), config.prirucnikDocxPath);
  console.log(`[struktura] Čitam priručnik: ${putanja}`);

  const { odlomci, ukupnoStranica } = await readDocx(putanja);
  const poglavlja = segmentirajPrirucnik(odlomci, ukupnoStranica);

  let brojLekcije = 0;
  const izlaz = {
    izvor: {
      oznaka: 'prirucnik',
      naslov: 'Ponašanje potrošača u turizmu',
      podnaslov: 'Od klasičnih čimbenika odlučivanja do interneta i umjetne inteligencije',
      vrsta: 'Veleučilišni priručnik',
      ustanova: config.ustanova,
      kolegij: config.kolegij,
      studij: config.studij,
      ukupno_stranica: ukupnoStranica,
    },
    poglavlja: poglavlja.map((p) => ({
      broj: p.broj,
      naslov: p.naslov,
      dio: p.dio,
      stranica_od: p.stranicaOd,
      stranica_do: p.stranicaDo,
      lekcije: p.lekcije.map((l) => ({
        broj: ++brojLekcije,
        oznaka: l.oznaka,
        naslov: l.naslov,
        stranica_od: l.stranicaOd,
        stranica_do: l.stranicaDo,
        podnaslovi: l.podnaslovi,
      })),
    })),
  };

  console.log(
    `[struktura] Poglavlja: ${poglavlja.length} | lekcije: ${brojLekcije} | stranica: ${ukupnoStranica}`,
  );
  for (const p of izlaz.poglavlja) {
    console.log(`  ${String(p.broj).padStart(2)}. ${p.naslov}  (str. ${p.stranica_od}–${p.stranica_do}, lekcija: ${p.lekcije.length})`);
    for (const l of p.lekcije) {
      console.log(`       L${l.broj} ${l.oznaka.padEnd(5)} ${l.naslov}  (str. ${l.stranica_od}–${l.stranica_do})`);
    }
  }

  if (SAMO_PROVJERA) {
    console.log('[struktura] --provjeri: ništa nije upisano.');
    return;
  }

  fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
  fs.writeFileSync(IZLAZ, JSON.stringify(izlaz, null, 2) + '\n', 'utf8');
  console.log(`[struktura] Upisano: ${IZLAZ}`);
  console.log('[struktura] Pregledajte i po potrebi uredite datoteku prije `npm run ingest`.');
}

main().catch((err) => {
  console.error('[struktura] GREŠKA:', err);
  process.exit(1);
});
