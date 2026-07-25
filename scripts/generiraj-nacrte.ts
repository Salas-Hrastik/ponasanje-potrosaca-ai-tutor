/**
 * Priprema NACRTA nastavnih elemenata koje priručnik nema kao zaseban tekst:
 * ciljeva učenja po lekciji i kviz pitanja po poglavlju.
 *
 * VAŽNO — ovo NIJE izmišljanje sadržaja:
 *  - model dobiva isključivo ingestirane isječke priručnika i ne smije izaći iz njih;
 *  - sve što nastane upisuje se s `odobreno = false` i studentima se NE prikazuje;
 *  - nastavnik nacrte pregledava i odobrava (ili briše) u bazi, odnosno unosi
 *    vlastita pitanja skriptom `npm run kviz:uvezi`.
 * Time je zadovoljeno pravilo „ne izmišljaj pitanja": ništa neodobreno ne dolazi
 * pred studenta.
 *
 * Pokretanje:
 *   npm run nacrti -- --ciljevi              # nacrti ciljeva učenja za sve lekcije
 *   npm run nacrti -- --kviz                 # nacrti kviz pitanja za sva poglavlja
 *   npm run nacrti -- --kviz --poglavlje=4   # samo jedno poglavlje
 *   npm run nacrti -- --ciljevi --lekcija=22
 */
import { askClaudeJson } from '../lib/claude';
import { retrieve } from '../lib/retrieval';
import { supabaseAdmin } from '../lib/supabase';
import { PRIRUCNIK } from '../lib/prompt';

const ARGS = process.argv.slice(2);
const RADI_CILJEVE = ARGS.includes('--ciljevi');
const RADI_KVIZ = ARGS.includes('--kviz');
const SAMO_LEKCIJA = ARGS.find((a) => a.startsWith('--lekcija='))?.split('=')[1];
const SAMO_POGLAVLJE = ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];
const PITANJA_PO_POGLAVLJU = 8;

const OGRADA = `Radiš isključivo iz priloženih isječaka izvora ${PRIRUCNIK}. Ne dodaješ pojmove, primjere ni brojke kojih u isječcima nema. Odgovaraš na hrvatskom, terminologijom priručnika, i ISKLJUČIVO validnim JSON-om bez markdown ograda.`;

async function main() {
  if (!RADI_CILJEVE && !RADI_KVIZ) {
    console.log('Navedite --ciljevi i/ili --kviz. Primjer: npm run nacrti -- --ciljevi --kviz');
    return;
  }
  if (RADI_CILJEVE) await ciljevi();
  if (RADI_KVIZ) await kviz();
}

// --- Ciljevi učenja ---------------------------------------------------------
async function ciljevi() {
  const sb = supabaseAdmin();
  let upit = sb.from('lekcije').select('id, broj, oznaka, naslov, stranica_od, stranica_do').order('redoslijed');
  if (SAMO_LEKCIJA) upit = upit.eq('broj', Number(SAMO_LEKCIJA));
  const { data: lekcije, error } = await upit;
  if (error) throw new Error(error.message);

  for (const lek of lekcije ?? []) {
    const chunks = await retrieve(`${lek.oznaka} ${lek.naslov}`, { lekcijaId: lek.id, topK: 8 });
    if (chunks.length === 0) {
      console.warn(`[nacrti] L${lek.broj} „${lek.naslov}" — nema ingestiranih isječaka, preskačem.`);
      continue;
    }

    const system = `${OGRADA}

Pripremaš CILJEVE UČENJA za jednu lekciju. Svaki cilj:
 - formuliran je infinitivom ("objasniti…", "razlikovati…", "primijeniti…");
 - odnosi se na sadržaj koji stvarno postoji u priloženim isječcima;
 - ima kognitivnu razinu po Bloomu: "znanje" | "razumijevanje" | "primjena" | "analiza" | "vrednovanje";
 - ima stranicu na kojoj se gradivo nalazi (iz atributa stranice priloženog isječka).

Vrati 3–5 ciljeva:
{"ciljevi": [{"tekst": "…", "kognitivna_razina": "…", "stranica": 12}]}`;

    const korisnik = `Lekcija: ${lek.oznaka} ${lek.naslov} (str. ${lek.stranica_od}–${lek.stranica_do})\n\n<izvori>\n${chunks
      .map((c) => `<izvor stranice="${c.stranicaOd}-${c.stranicaDo}">\n${c.text}\n</izvor>`)
      .join('\n\n')}\n</izvori>`;

    const rez = await askClaudeJson<{ ciljevi?: { tekst: string; kognitivna_razina: string; stranica: number }[] }>(
      system,
      korisnik,
    );
    const stavke = rez.ciljevi ?? [];
    if (stavke.length === 0) {
      console.warn(`[nacrti] L${lek.broj} — model nije vratio ciljeve.`);
      continue;
    }

    await sb.from('ciljevi_ucenja').delete().eq('lekcija_id', lek.id).eq('odobreno', false);
    const { error: insErr } = await sb.from('ciljevi_ucenja').insert(
      stavke.map((c, i) => ({
        lekcija_id: lek.id,
        tekst: c.tekst,
        kognitivna_razina: c.kognitivna_razina ?? '',
        stranica: Number.isFinite(c.stranica) ? c.stranica : lek.stranica_od,
        redoslijed: i,
        odobreno: false,
      })),
    );
    if (insErr) throw new Error(`ciljevi (L${lek.broj}): ${insErr.message}`);
    console.log(`[nacrti] L${lek.broj} „${lek.naslov}": ${stavke.length} nacrta ciljeva (odobreno = false)`);
  }
}

// --- Kviz pitanja -----------------------------------------------------------
async function kviz() {
  const sb = supabaseAdmin();
  let upit = sb.from('poglavlja').select('id, broj, naslov').order('broj');
  if (SAMO_POGLAVLJE) upit = upit.eq('broj', Number(SAMO_POGLAVLJE));
  const { data: poglavlja, error } = await upit;
  if (error) throw new Error(error.message);

  for (const pog of poglavlja ?? []) {
    const { data: lekcije } = await sb
      .from('lekcije')
      .select('id, broj, oznaka, naslov')
      .eq('poglavlje_id', pog.id)
      .order('redoslijed');
    if (!lekcije || lekcije.length === 0) continue;

    const chunks = await retrieve(pog.naslov, { poglavljeId: pog.id, topK: 14 });
    if (chunks.length === 0) {
      console.warn(`[nacrti] Pogl. ${pog.broj} — nema ingestiranih isječaka, preskačem.`);
      continue;
    }

    const system = `${OGRADA}

Pripremaš NACRT kviza za jedno poglavlje. Kviz kombinira pitanja iz svih lekcija poglavlja.
Pravila za svako pitanje:
 - točno 4 ponuđena odgovora, točno jedan točan;
 - odgovor mora biti nedvojbeno provjerljiv u priloženim isječcima;
 - netočne opcije moraju biti uvjerljive, ali jasno netočne prema priručniku;
 - objašnjenje je jedna rečenica, uz oznaku stranice.

Vrati ${PITANJA_PO_POGLAVLJU} pitanja:
{"pitanja": [{"pitanje": "…", "odgovori": ["…","…","…","…"], "tocan_index": 0, "objasnjenje": "…", "stranica_ref": "str. 24–25", "odjeljak": "4.4"}]}`;

    const korisnik = `Poglavlje ${pog.broj}. ${pog.naslov}\nLekcije: ${lekcije.map((l) => `${l.oznaka} ${l.naslov}`).join('; ')}\n\n<izvori>\n${chunks
      .map((c) => `<izvor odjeljak="${c.naslovOdjeljka}" stranice="${c.stranicaOd}-${c.stranicaDo}">\n${c.text}\n</izvor>`)
      .join('\n\n')}\n</izvori>`;

    const rez = await askClaudeJson<{
      pitanja?: {
        pitanje: string;
        odgovori: string[];
        tocan_index: number;
        objasnjenje?: string;
        stranica_ref?: string;
        odjeljak?: string;
      }[];
    }>(system, korisnik, 4000);

    const valjana = (rez.pitanja ?? []).filter(
      (p) =>
        Array.isArray(p.odgovori) &&
        p.odgovori.length === 4 &&
        Number.isInteger(p.tocan_index) &&
        p.tocan_index >= 0 &&
        p.tocan_index <= 3,
    );
    if (valjana.length === 0) {
      console.warn(`[nacrti] Pogl. ${pog.broj} — model nije vratio valjana pitanja.`);
      continue;
    }

    await sb.from('kviz_pitanja').delete().eq('poglavlje_id', pog.id).eq('izvor_unosa', 'nacrt').eq('odobreno', false);
    const { error: insErr } = await sb.from('kviz_pitanja').insert(
      valjana.map((p) => ({
        poglavlje_id: pog.id,
        lekcija_id: lekcije.find((l) => l.oznaka && p.odjeljak === l.oznaka)?.id ?? null,
        pitanje: p.pitanje,
        odgovori: p.odgovori,
        tocan_index: p.tocan_index,
        objasnjenje: p.objasnjenje ?? '',
        stranica_ref: p.stranica_ref ?? '',
        odobreno: false,
        izvor_unosa: 'nacrt',
      })),
    );
    if (insErr) throw new Error(`kviz (pogl. ${pog.broj}): ${insErr.message}`);
    console.log(`[nacrti] Pogl. ${pog.broj} „${pog.naslov}": ${valjana.length} nacrta pitanja (odobreno = false)`);
  }

  console.log('\n[nacrti] Nacrti NISU vidljivi studentima dok ih nastavnik ne odobri:');
  console.log("  update kviz_pitanja set odobreno = true where poglavlje_id = '…';");
}

main().catch((err) => {
  console.error('[nacrti] GREŠKA:', err);
  process.exit(1);
});
