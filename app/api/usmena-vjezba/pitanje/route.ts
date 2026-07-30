import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildPitanjeSystemPrompt } from '@/lib/prompt';
import { askClaudeJson, nedovoljnoKonteksta } from '@/lib/claude';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

/** Dohvat + generiranje pitanja premašuje Vercelovu zadanu granicu od 10 s. */
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/usmena-vjezba/pitanje?poglavljeBroj=4
 *
 * Postavlja JEDNO pitanje iz nastavne cjeline, strogo utemeljeno na isječcima
 * dohvaćenima za to poglavlje — bez izmišljanja izvan priručnika.
 */
async function GETImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const poglavljeBroj = Number(request.nextUrl.searchParams.get('poglavljeBroj'));
  if (!poglavljeBroj) return NextResponse.json({ greska: 'Nedostaje poglavljeBroj.' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pog } = await admin
    .from('poglavlja')
    .select('id, broj, naslov')
    .eq('broj', poglavljeBroj)
    .single();
  if (!pog) return NextResponse.json({ greska: 'Cjelina nije pronađena.' }, { status: 404 });

  const kraj = mjeri();

  // Pitanje se svaki put veže uz nasumično odabran odjeljak cjeline, uz nasumičan
  // kut gledanja — tako uzastopne vježbe pokrivaju cijelo poglavlje umjesto da se
  // vrte oko istog, najistaknutijeg odlomka.
  const { data: odjeljci } = await admin
    .from('odjeljci')
    .select('id, oznaka, naslov')
    .eq('poglavlje_id', pog.id)
    .order('redoslijed');

  const odjeljak = odjeljci?.length
    ? odjeljci[Math.floor(Math.random() * odjeljci.length)]
    : null;
  const kutovi = ['definicija i pojmovi', 'primjeri i primjena', 'usporedba i razlike', 'proces i faze'];
  const kut = kutovi[Math.floor(Math.random() * kutovi.length)];
  const upit = odjeljak ? `${odjeljak.oznaka} ${odjeljak.naslov} — ${kut}` : `${pog.naslov} — ${kut}`;

  const chunks = await retrieve(upit, { poglavljeId: pog.id, topK: 6 });

  if (!dovoljnoKonteksta(chunks)) {
    await zabiljezi({
      vrsta: 'usmena_pitanje',
      poglavljeId: pog.id,
      imaKontekst: false,
      brojIsjecaka: chunks.length,
      trajanjeMs: kraj(),
    });
    return NextResponse.json(
      nedovoljnoKonteksta(
        'Za ovu cjelinu još nema ingestiranog sadržaja priručnika, pa ne mogu postaviti pitanje. Nastavnik treba pokrenuti ingest (npm run ingest).',
      ),
    );
  }

  const rezultat = await askClaudeJson<{ pitanje?: string; kljucne_tocke?: string[] }>(
    buildPitanjeSystemPrompt(),
    `Nastavna cjelina: Pogl. ${pog.broj}. ${pog.naslov}\nTežište: ${odjeljak ? `${odjeljak.oznaka} ${odjeljak.naslov}` : pog.naslov}\n\n<izvori>\n${chunks
      .map((c) => `<izvor odjeljak="${c.naslovOdjeljka}" stranice="${c.stranicaOd}-${c.stranicaDo}">\n${c.text}\n</izvor>`)
      .join('\n\n')}\n</izvori>`,
    700,
  );

  await zabiljezi({
    vrsta: 'usmena_pitanje',
    poglavljeId: pog.id,
    odjeljakId: odjeljak?.id ?? null,
    imaKontekst: true,
    brojIsjecaka: chunks.length,
    najboljiScore: chunks[0]?.score ?? null,
    trajanjeMs: kraj(),
  });

  if (!rezultat.pitanje) return NextResponse.json(rezultat);

  return NextResponse.json({
    tip: 'usmena_vjezba_pitanje',
    poglavljeBroj: pog.broj,
    opseg: `Pogl. ${pog.broj}. ${pog.naslov}`,
    pitanje: rezultat.pitanje,
    kljucne_tocke: rezultat.kljucne_tocke ?? [],
    citati: toCitations(chunks).slice(0, 3),
  });
}

/** Neuhvaćena greška (npr. nedostajuća ENV varijabla) inače postane prazan 500. */
export async function GET(request: NextRequest) {
  try {
    return await GETImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Pitanje trenutačno nije moguće pripremiti.');
  }
}
