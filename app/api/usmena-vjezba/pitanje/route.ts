import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildPitanjeSystemPrompt } from '@/lib/prompt';
import { askClaudeJson, nedovoljnoKonteksta } from '@/lib/claude';
import { mjeri, zabiljezi } from '@/lib/telemetrija';

/**
 * GET /api/usmena-vjezba/pitanje?lekcijaId=…  ili  ?poglavljeBroj=4
 *
 * Postavlja JEDNO pitanje, strogo utemeljeno na isječcima dohvaćenima za
 * zadani opseg (lekcija ili poglavlje) — bez izmišljanja izvan priručnika.
 */
export async function GET(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const admin = supabaseAdmin();
  const lekcijaId = request.nextUrl.searchParams.get('lekcijaId') ?? undefined;
  const poglavljeBroj = request.nextUrl.searchParams.get('poglavljeBroj');

  let opisOpsega = '';
  let poglavljeId: string | undefined;
  let upitZaDohvat = '';

  if (lekcijaId) {
    const { data: lekcija } = await admin
      .from('lekcije')
      .select('id, oznaka, naslov, poglavlje_id')
      .eq('id', lekcijaId)
      .single();
    if (!lekcija) return NextResponse.json({ greska: 'Lekcija nije pronađena.' }, { status: 404 });
    opisOpsega = `${lekcija.oznaka} ${lekcija.naslov}`;
    upitZaDohvat = opisOpsega;
    poglavljeId = lekcija.poglavlje_id;
  } else if (poglavljeBroj) {
    const { data: pog } = await admin
      .from('poglavlja')
      .select('id, broj, naslov')
      .eq('broj', Number(poglavljeBroj))
      .single();
    if (!pog) return NextResponse.json({ greska: 'Poglavlje nije pronađeno.' }, { status: 404 });
    opisOpsega = `Poglavlje ${pog.broj}. ${pog.naslov}`;
    upitZaDohvat = pog.naslov;
    poglavljeId = pog.id;
  } else {
    return NextResponse.json({ greska: 'Navedite lekcijaId ili poglavljeBroj.' }, { status: 400 });
  }

  const kraj = mjeri();
  // Nasumičan pomak u upitu daje raznolikost pitanja kroz uzastopne vježbe, a da
  // dohvat i dalje ostane unutar istog (lekcijskog/poglavljem omeđenog) opsega.
  const kutovi = ['definicija i pojmovi', 'primjeri i primjena', 'usporedba i razlike', 'proces i faze'];
  const kut = kutovi[Math.floor(Math.random() * kutovi.length)];
  const chunks = await retrieve(`${upitZaDohvat} — ${kut}`, {
    lekcijaId: lekcijaId ?? undefined,
    poglavljeId: lekcijaId ? undefined : poglavljeId,
    topK: 6,
  });

  if (!dovoljnoKonteksta(chunks)) {
    await zabiljezi({ vrsta: 'usmena_pitanje', lekcijaId, poglavljeId, imaKontekst: false, brojIsjecaka: chunks.length, trajanjeMs: kraj() });
    return NextResponse.json(
      nedovoljnoKonteksta(
        'Za ovaj opseg još nema ingestiranog sadržaja priručnika, pa ne mogu postaviti pitanje. Nastavnik treba pokrenuti ingest (npm run ingest).',
      ),
    );
  }

  const rezultat = await askClaudeJson<{ pitanje?: string; kljucne_tocke?: string[] }>(
    buildPitanjeSystemPrompt(),
    `Opseg: ${opisOpsega}\n\n<izvori>\n${chunks
      .map((c) => `<izvor odjeljak="${c.naslovOdjeljka}" stranice="${c.stranicaOd}-${c.stranicaDo}">\n${c.text}\n</izvor>`)
      .join('\n\n')}\n</izvori>`,
    700,
  );

  await zabiljezi({
    vrsta: 'usmena_pitanje',
    lekcijaId,
    poglavljeId,
    imaKontekst: true,
    brojIsjecaka: chunks.length,
    najboljiScore: chunks[0]?.score ?? null,
    trajanjeMs: kraj(),
  });

  if (!rezultat.pitanje) return NextResponse.json(rezultat);

  return NextResponse.json({
    tip: 'usmena_vjezba_pitanje',
    lekcijaId: lekcijaId ?? null,
    poglavljeBroj: poglavljeBroj ? Number(poglavljeBroj) : null,
    opseg: opisOpsega,
    pitanje: rezultat.pitanje,
    kljucne_tocke: rezultat.kljucne_tocke ?? [],
    citati: toCitations(chunks).slice(0, 3),
  });
}
