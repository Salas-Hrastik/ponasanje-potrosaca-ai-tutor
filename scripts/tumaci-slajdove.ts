/**
 * Priprema TUMAČENJA SLAJDOVA za prezentaciju nastavne cjeline.
 *
 * Prezentacije su SLIKOVNE — svaki je slajd jedna slika, bez ijednog tekstualnog
 * okvira, pa se sadržaj ne može izvući iz XML-a. Zato se svaki slajd šalje
 * modelu kao slika, a on opisuje što slajd prikazuje i povezuje to s gradivom
 * cjeline.
 *
 * Ograda: tumačenje se drži onoga što je NA SLAJDU, uz terminologiju priručnika
 * iz priloženog sažetka cjeline. Rezultat se sprema kao podatak u repozitorij
 * (data/slajdovi/poglavlje-N.json), jednako kao data/sadrzaj.json.
 *
 * Pokretanje:
 *   npm run slajdovi -- --poglavlje=4
 *   npm run slajdovi -- --poglavlje=4 --od=1 --do=3   # samo dio (za probu)
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import Anthropic from '@anthropic-ai/sdk';
import { config, requireEnv } from '../lib/config';
import { supabaseAdmin } from '../lib/supabase';

const ARGS = process.argv.slice(2);
const POGLAVLJE = Number(ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1]);
const OD = Number(ARGS.find((a) => a.startsWith('--od='))?.split('=')[1] ?? 1);
const DO = Number(ARGS.find((a) => a.startsWith('--do='))?.split('=')[1] ?? Infinity);

interface Slajd {
  broj: number;
  naslov: string;
  tumacenje: string;
  /** Javni URL slike slajda — tumačenje se prikazuje uz sam slajd. */
  slika: string;
}

/**
 * Model zna prepisati znak sa slajda kao HTML entitet („Skift &amp; McKinsey").
 * U sučelju bi se takav zapis prikazao doslovno, pa se vraća u obični znak.
 */
function bezEntiteta(t: string): string {
  return t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(#39|apos);/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Slajdovi u ispravnom redoslijedu, sa slikom svakog slajda. */
async function izvuciSlike(pptx: Buffer): Promise<{ broj: number; slika: Buffer; tip: string }[]> {
  const zip = await JSZip.loadAsync(pptx);
  const imena = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const rezultat = [];
  for (const ime of imena) {
    const broj = Number(ime.match(/\d+/)![0]);
    const xml = await zip.file(ime)!.async('string');
    const embed = xml.match(/r:embed="([^"]+)"/)?.[1];
    if (!embed) continue;

    const rels = await zip.file(`ppt/slides/_rels/slide${broj}.xml.rels`)?.async('string');
    const meta = rels ? new RegExp(`Id="${embed}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] : null;
    if (!meta) continue;

    const put = 'ppt/' + meta.replace(/^\.\.\//, '');
    const bin = await zip.file(put)?.async('nodebuffer');
    if (!bin) continue;

    const ext = put.split('.').pop()?.toLowerCase();
    const tip = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    rezultat.push({ broj, slika: bin, tip });
  }
  return rezultat;
}

async function main() {
  if (!Number.isFinite(POGLAVLJE)) {
    console.log('Navedite cjelinu, npr.: npm run slajdovi -- --poglavlje=4');
    return;
  }

  const sb = supabaseAdmin();
  const { data: pog } = await sb
    .from('poglavlja')
    .select('id, broj, naslov, sazetak_md')
    .eq('broj', POGLAVLJE)
    .single();
  if (!pog) throw new Error(`Nema cjeline ${POGLAVLJE}.`);

  const { data: medij } = await sb
    .from('mediji')
    .select('naslov, url')
    .eq('poglavlje_id', pog.id)
    .eq('tip', 'prezentacija')
    .maybeSingle();
  if (!medij) {
    console.log(`[slajdovi] Cjelina ${POGLAVLJE} nema prezentaciju.`);
    return;
  }

  console.log(`[slajdovi] Preuzimam: ${medij.naslov}`);
  const pptx = Buffer.from(await (await fetch(medij.url)).arrayBuffer());
  const slike = (await izvuciSlike(pptx)).filter((s) => s.broj >= OD && s.broj <= DO);
  if (slike.length === 0) {
    console.log('[slajdovi] Nije pronađen nijedan slajd sa slikom.');
    return;
  }
  console.log(`[slajdovi] Slajdova za obradu: ${slike.length}`);

  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const sazetak = (pog.sazetak_md ?? '').slice(0, 6000);

  const system = `Ti si nastavni asistent kolegija ${config.kolegij} (${config.studij}, ${config.ustanova}).

Dobivaš SLIKU jednog slajda iz prezentacije uz nastavnu cjelinu „${pog.broj}. ${pog.naslov}".

Zadatak: napiši kratko tumačenje slajda za studenta.
 - "naslov": naslov slajda onako kako stvarno piše na slajdu; ako ga nema, sažmi temu u 2–5 riječi.
 - "tumacenje": 2–4 rečenice o tome što slajd prikazuje i zašto je to važno za razumijevanje cjeline.

Pravila:
 - Opisuj ISKLJUČIVO ono što se vidi na slajdu; ne dodaji gradivo kojega na njemu nema.
 - Koristi terminologiju priručnika iz priloženog sažetka cjeline (npr. „percipirani rizik", „makro i mikro odluke").
 - Piši pravopisno ispravnim hrvatskim jezikom, bez Markdowna.
 - Ako je slajd samo naslovni ili dekorativni, reci to otvoreno u jednoj rečenici.`;

  const shema = {
    type: 'object' as const,
    properties: {
      naslov: { type: 'string' },
      tumacenje: { type: 'string' },
    },
    required: ['naslov', 'tumacenje'],
  };

  const slajdovi: Slajd[] = [];
  for (const s of slike) {
    // Slika slajda ide u Storage da se u aplikaciji može prikazati uz tumačenje.
    const putanja = `${POGLAVLJE} cjelina/slajdovi/slajd-${String(s.broj).padStart(2, '0')}.${s.tip.split('/')[1]}`;
    const { error: greskaUpload } = await sb.storage
      .from('mediji')
      .upload(putanja, s.slika, { contentType: s.tip, upsert: true });
    if (greskaUpload) throw new Error(`Upload slajda ${s.broj}: ${greskaUpload.message}`);
    const slikaUrl = sb.storage.from('mediji').getPublicUrl(putanja).data.publicUrl;

    const msg = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 700,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: s.tip as 'image/png', data: s.slika.toString('base64') },
            },
            {
              type: 'text',
              text: `Slajd ${s.broj}.\n\nSAŽETAK CJELINE (za terminologiju):\n${sazetak}`,
            },
          ],
        },
      ],
      tools: [{ name: 'tumaci', description: 'Vrati naslov i tumačenje slajda.', input_schema: shema }],
      tool_choice: { type: 'tool', name: 'tumaci' },
    });

    const alat = msg.content.find((b) => b.type === 'tool_use');
    if (!alat || alat.type !== 'tool_use') {
      console.warn(`  slajd ${s.broj}: model nije vratio tumačenje — preskačem.`);
      continue;
    }
    const { naslov, tumacenje } = alat.input as { naslov: string; tumacenje: string };
    slajdovi.push({
      broj: s.broj,
      naslov: bezEntiteta(naslov.trim()),
      tumacenje: bezEntiteta(tumacenje.trim()),
      slika: slikaUrl,
    });
    console.log(`  ${String(s.broj).padStart(2)}. ${naslov}`);
  }

  const izlaz = path.resolve(process.cwd(), `data/slajdovi/poglavlje-${POGLAVLJE}.json`);
  fs.mkdirSync(path.dirname(izlaz), { recursive: true });
  fs.writeFileSync(
    izlaz,
    JSON.stringify({ poglavlje: POGLAVLJE, prezentacija: medij.naslov, slajdovi }, null, 2) + '\n',
    'utf8',
  );
  console.log(`[slajdovi] Upisano ${slajdovi.length} tumačenja → ${izlaz}`);
}

main().catch((e) => {
  console.error('[slajdovi] GREŠKA:', e);
  process.exit(1);
});
