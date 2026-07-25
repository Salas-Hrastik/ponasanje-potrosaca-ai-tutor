/**
 * Dijagnostika dohvata — pokaži što bi RAG vratio za zadano pitanje, bez poziva
 * generativnom modelu. Koristi se pri podešavanju RAG_TOP_K / RAG_MIN_SCORE i
 * pri provjeri je li neka lekcija uopće ingestirana.
 *
 * Pokretanje:
 *   npm run rag:debug -- "Što je nulti trenutak istine?"
 *   npm run rag:debug -- "eWOM" --lekcija=37
 *   npm run rag:debug -- "agentski AI" --dopunski
 */
import { retrieve, dovoljnoKonteksta } from '../lib/retrieval';
import { supabaseAdmin } from '../lib/supabase';

async function main() {
  const args = process.argv.slice(2);
  const upit = args.filter((a) => !a.startsWith('--')).join(' ');
  if (!upit) {
    console.log('Upotreba: npm run rag:debug -- "vaše pitanje" [--lekcija=N] [--poglavlje=N] [--dopunski]');
    return;
  }
  const lekcijaBroj = args.find((a) => a.startsWith('--lekcija='))?.split('=')[1];
  const poglavljeBroj = args.find((a) => a.startsWith('--poglavlje='))?.split('=')[1];
  const dopunski = args.includes('--dopunski');

  const sb = supabaseAdmin();
  let lekcijaId: string | undefined;
  let poglavljeId: string | undefined;

  if (lekcijaBroj) {
    const { data } = await sb.from('lekcije').select('id, naslov').eq('broj', Number(lekcijaBroj)).single();
    if (!data) throw new Error(`Lekcija ${lekcijaBroj} nije pronađena.`);
    lekcijaId = data.id;
    console.log(`Opseg: lekcija L${lekcijaBroj} „${data.naslov}"`);
  }
  if (poglavljeBroj) {
    const { data } = await sb.from('poglavlja').select('id, naslov').eq('broj', Number(poglavljeBroj)).single();
    if (!data) throw new Error(`Poglavlje ${poglavljeBroj} nije pronađeno.`);
    poglavljeId = data.id;
    console.log(`Opseg: poglavlje ${poglavljeBroj}. ${data.naslov}`);
  }

  const pocetak = Date.now();
  const chunks = await retrieve(upit, { lekcijaId, poglavljeId, ukljuciDopunske: dopunski });
  const trajanje = Date.now() - pocetak;

  console.log(`\nUpit: „${upit}"`);
  console.log(`Dohvaćeno: ${chunks.length} isječaka u ${trajanje} ms`);
  console.log(`Dovoljno konteksta: ${dovoljnoKonteksta(chunks) ? 'DA' : 'NE'}\n`);

  chunks.forEach((c, i) => {
    const oznaka =
      c.izvorVrsta === 'prirucnik'
        ? `Pogl. ${c.poglavljeBroj}. ${c.poglavljeNaslov} — ${c.naslovOdjeljka}`
        : `[DOPUNSKI] ${c.izvorNaslov}`;
    console.log(`${String(i + 1).padStart(2)}. score=${c.score.toFixed(4)}  str. ${c.stranicaOd}–${c.stranicaDo}  ${oznaka}`);
    console.log(`    ${c.text.slice(0, 180).replace(/\s+/g, ' ')}…\n`);
  });
}

main().catch((err) => {
  console.error('[rag:debug] GREŠKA:', err);
  process.exit(1);
});
