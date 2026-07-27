/**
 * Priprema NACRTA nastavnih elemenata koje priručnik nema kao zaseban tekst:
 * ciljeva učenja, kartica za učenje i kviz pitanja — sve na razini NASTAVNE
 * CJELINE (poglavlja).
 *
 * VAŽNO — ovo NIJE izmišljanje sadržaja:
 *  - model dobiva isključivo sažetak cjeline i ingestirane isječke priručnika,
 *    i ne smije izaći iz njih;
 *  - sve što nastane upisuje se s `odobreno = false` i studentima se NE prikazuje;
 *  - nastavnik nacrte pregledava i odobrava (ili briše), odnosno unosi vlastita
 *    pitanja skriptom `npm run kviz:uvezi`.
 * Time je zadovoljeno pravilo „ne izmišljaj pitanja": ništa neodobreno ne dolazi
 * pred studenta.
 *
 * Pokretanje:
 *   npm run nacrti -- --ciljevi                  # ciljevi učenja za sve cjeline
 *   npm run nacrti -- --kartice                  # kartice za učenje
 *   npm run nacrti -- --kviz                     # kviz pitanja
 *   npm run nacrti -- --ciljevi --kartice --kviz --poglavlje=4
 */
import { askClaudeJson } from '../lib/claude';
import { retrieve } from '../lib/retrieval';
import { supabaseAdmin } from '../lib/supabase';
import { PRIRUCNIK } from '../lib/prompt';

const ARGS = process.argv.slice(2);
const RADI_CILJEVE = ARGS.includes('--ciljevi');
const RADI_KARTICE = ARGS.includes('--kartice');
const RADI_KVIZ = ARGS.includes('--kviz');
const SAMO_POGLAVLJE = ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];

const PITANJA_PO_CJELINI = 8;
const KARTICA_PO_CJELINI = 10;
/** Sažetak cjeline zna biti dug; modelu ide početak, a ostatak stiže kroz isječke. */
const SAZETAK_LIMIT = 12000;

const OGRADA = `Radiš isključivo iz priloženog sažetka cjeline i isječaka izvora ${PRIRUCNIK}. Ne dodaješ pojmove, primjere ni brojke kojih u priloženom tekstu nema. Odgovaraš na hrvatskom, terminologijom priručnika, i ISKLJUČIVO validnim JSON-om bez markdown ograda.`;

interface Cjelina {
  id: string;
  broj: number;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
  sazetak_md: string;
}

async function main() {
  if (!RADI_CILJEVE && !RADI_KARTICE && !RADI_KVIZ) {
    console.log('Navedite --ciljevi, --kartice i/ili --kviz.');
    console.log('Primjer: npm run nacrti -- --ciljevi --kartice --kviz --poglavlje=4');
    return;
  }

  const sb = supabaseAdmin();
  let upit = sb
    .from('poglavlja')
    .select('id, broj, naslov, stranica_od, stranica_do, sazetak_md')
    .order('broj');
  if (SAMO_POGLAVLJE) upit = upit.eq('broj', Number(SAMO_POGLAVLJE));
  const { data: cjeline, error } = await upit;
  if (error) throw new Error(error.message);

  for (const cjelina of (cjeline ?? []) as Cjelina[]) {
    const chunks = await retrieve(cjelina.naslov, { poglavljeId: cjelina.id, topK: 14 });
    if (chunks.length === 0 && !cjelina.sazetak_md) {
      console.warn(`[nacrti] Cjelina ${cjelina.broj} — nema ingestiranog sadržaja, preskačem.`);
      continue;
    }
    const kontekst = kontekstCjeline(cjelina, chunks);

    if (RADI_CILJEVE) await ciljevi(cjelina, kontekst);
    if (RADI_KARTICE) await kartice(cjelina, kontekst);
    if (RADI_KVIZ) await kviz(cjelina, kontekst);
  }

  console.log('\n[nacrti] Nacrti NISU vidljivi studentima dok ih nastavnik ne odobri:');
  console.log("  update ciljevi_ucenja set odobreno = true where poglavlje_id = '…';");
  console.log("  update kartice        set odobreno = true where poglavlje_id = '…';");
  console.log("  update kviz_pitanja   set odobreno = true where poglavlje_id = '…';");
}

function kontekstCjeline(c: Cjelina, chunks: Awaited<ReturnType<typeof retrieve>>): string {
  const izvori = chunks
    .map((x) => `<izvor odjeljak="${x.naslovOdjeljka}" stranice="${x.stranicaOd}-${x.stranicaDo}">\n${x.text}\n</izvor>`)
    .join('\n\n');
  return `Nastavna cjelina: ${c.broj}. ${c.naslov} (str. ${c.stranica_od}–${c.stranica_do})

<sazetak_cjeline>
${(c.sazetak_md || '').slice(0, SAZETAK_LIMIT)}
</sazetak_cjeline>

<izvori>
${izvori || '(nema dodatnih isječaka)'}
</izvori>`;
}

// --- Ciljevi učenja ---------------------------------------------------------
async function ciljevi(c: Cjelina, kontekst: string) {
  const sb = supabaseAdmin();
  const system = `${OGRADA}

Pripremaš CILJEVE UČENJA za jednu nastavnu cjelinu. Svaki cilj:
 - formuliran je infinitivom ("objasniti…", "razlikovati…", "primijeniti…");
 - odnosi se na sadržaj koji stvarno postoji u priloženom tekstu;
 - ima kognitivnu razinu po Bloomu: "znanje" | "razumijevanje" | "primjena" | "analiza" | "vrednovanje";
 - ima stranicu na kojoj se gradivo nalazi.

Vrati 4–6 ciljeva koji zajedno pokrivaju cijelu cjelinu:
{"ciljevi": [{"tekst": "…", "kognitivna_razina": "…", "stranica": 12}]}`;

  const rez = await askClaudeJson<{
    ciljevi?: { tekst: string; kognitivna_razina?: string; stranica?: number }[];
  }>(system, kontekst, 2000);

  const stavke = (rez.ciljevi ?? []).filter((x) => x.tekst?.trim());
  if (stavke.length === 0) {
    console.warn(`[nacrti] Cjelina ${c.broj} — model nije vratio ciljeve.`);
    return;
  }

  await sb.from('ciljevi_ucenja').delete().eq('poglavlje_id', c.id).eq('odobreno', false);
  const { error } = await sb.from('ciljevi_ucenja').insert(
    stavke.map((x, i) => ({
      poglavlje_id: c.id,
      tekst: x.tekst,
      kognitivna_razina: x.kognitivna_razina ?? '',
      stranica: Number.isFinite(x.stranica) ? x.stranica : c.stranica_od,
      redoslijed: i,
      odobreno: false,
    })),
  );
  if (error) throw new Error(`ciljevi (cjelina ${c.broj}): ${error.message}`);
  console.log(`[nacrti] Cjelina ${c.broj} „${c.naslov}": ${stavke.length} nacrta ciljeva`);
}

// --- Kartice za učenje ------------------------------------------------------
async function kartice(c: Cjelina, kontekst: string) {
  const sb = supabaseAdmin();
  const system = `${OGRADA}

Pripremaš KARTICE ZA UČENJE za jednu nastavnu cjelinu (pojam → definicija).
Pravila:
 - "pojam" je stručni termin ili model iz priručnika (npr. „percipirani rizik", „nulti trenutak istine (ZMOT)");
 - "definicija" je 1–2 rečenice, doslovno utemeljene na priloženom tekstu, u terminologiji priručnika;
 - ne izmišljaj pojmove kojih u tekstu nema i ne ponavljaj isti pojam;
 - "stranica_ref" je oznaka stranice u obliku "str. 24" ili "str. 24–25".

Vrati do ${KARTICA_PO_CJELINI} kartica, poredanih onako kako se pojmovi pojavljuju u cjelini:
{"kartice": [{"pojam": "…", "definicija": "…", "stranica_ref": "str. 24–25"}]}`;

  const rez = await askClaudeJson<{
    kartice?: { pojam: string; definicija: string; stranica_ref?: string }[];
  }>(system, kontekst, 3000);

  const stavke = (rez.kartice ?? []).filter((x) => x.pojam?.trim() && x.definicija?.trim());
  if (stavke.length === 0) {
    console.warn(`[nacrti] Cjelina ${c.broj} — model nije vratio kartice.`);
    return;
  }

  await sb.from('kartice').delete().eq('poglavlje_id', c.id).eq('izvor_unosa', 'nacrt').eq('odobreno', false);
  const { error } = await sb.from('kartice').insert(
    stavke.slice(0, KARTICA_PO_CJELINI).map((x, i) => ({
      poglavlje_id: c.id,
      pojam: x.pojam.trim(),
      definicija: x.definicija.trim(),
      stranica_ref: x.stranica_ref ?? '',
      redoslijed: i,
      odobreno: false,
      izvor_unosa: 'nacrt',
    })),
  );
  if (error) throw new Error(`kartice (cjelina ${c.broj}): ${error.message}`);
  console.log(`[nacrti] Cjelina ${c.broj} „${c.naslov}": ${stavke.length} nacrta kartica`);
}

// --- Kviz pitanja -----------------------------------------------------------
async function kviz(c: Cjelina, kontekst: string) {
  const sb = supabaseAdmin();
  const system = `${OGRADA}

Pripremaš NACRT kviza za jednu nastavnu cjelinu. Pitanja moraju pokriti cijelu cjelinu, ne samo jedan odjeljak.
Pravila za svako pitanje:
 - točno 4 ponuđena odgovora, točno jedan točan;
 - odgovor mora biti nedvojbeno provjerljiv u priloženom tekstu;
 - netočne opcije moraju biti uvjerljive, ali jasno netočne prema priručniku;
 - objašnjenje je jedna rečenica, uz oznaku stranice.

Vrati ${PITANJA_PO_CJELINI} pitanja:
{"pitanja": [{"pitanje": "…", "odgovori": ["…","…","…","…"], "tocan_index": 0, "objasnjenje": "…", "stranica_ref": "str. 24–25", "odjeljak": "4.4"}]}`;

  const rez = await askClaudeJson<{
    pitanja?: {
      pitanje: string;
      odgovori: string[];
      tocan_index: number;
      objasnjenje?: string;
      stranica_ref?: string;
      odjeljak?: string;
    }[];
  }>(system, kontekst, 4000);

  const valjana = (rez.pitanja ?? []).filter(
    (p) =>
      p.pitanje?.trim() &&
      Array.isArray(p.odgovori) &&
      p.odgovori.length === 4 &&
      p.odgovori.every((o) => o?.trim()) &&
      Number.isInteger(p.tocan_index) &&
      p.tocan_index >= 0 &&
      p.tocan_index <= 3,
  );
  if (valjana.length === 0) {
    console.warn(`[nacrti] Cjelina ${c.broj} — model nije vratio valjana pitanja.`);
    return;
  }

  const { data: odjeljci } = await sb.from('odjeljci').select('id, oznaka').eq('poglavlje_id', c.id);
  const poOznaci = new Map((odjeljci ?? []).filter((o) => o.oznaka).map((o) => [o.oznaka, o.id]));

  await sb.from('kviz_pitanja').delete().eq('poglavlje_id', c.id).eq('izvor_unosa', 'nacrt').eq('odobreno', false);
  const { error } = await sb.from('kviz_pitanja').insert(
    valjana.map((p) => ({
      poglavlje_id: c.id,
      odjeljak_id: p.odjeljak ? poOznaci.get(p.odjeljak) ?? null : null,
      pitanje: p.pitanje,
      odgovori: p.odgovori,
      tocan_index: p.tocan_index,
      objasnjenje: p.objasnjenje ?? '',
      stranica_ref: p.stranica_ref ?? '',
      odobreno: false,
      izvor_unosa: 'nacrt',
    })),
  );
  if (error) throw new Error(`kviz (cjelina ${c.broj}): ${error.message}`);
  console.log(`[nacrti] Cjelina ${c.broj} „${c.naslov}": ${valjana.length} nacrta pitanja`);
}

main().catch((err) => {
  console.error('[nacrti] GREŠKA:', err);
  process.exit(1);
});
