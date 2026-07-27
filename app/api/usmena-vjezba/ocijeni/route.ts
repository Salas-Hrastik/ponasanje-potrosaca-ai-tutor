import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildOralSystemPrompt, buildOralUserPrompt } from '@/lib/prompt';
import { askClaudeJson, nedovoljnoKonteksta } from '@/lib/claude';
import { mjeri, zabiljezi } from '@/lib/telemetrija';

interface Rubrika {
  tocnost?: number;
  pokrivenost?: number;
  terminologija?: number;
  jasnoca?: number;
}
interface Povratna {
  tip: string;
  procjena?: string;
  tocno?: string[];
  nedostaje?: string[];
  pogresno?: string[];
  savjeti?: string[];
  idealni_odgovor?: string;
  citati?: { poglavlje: string; stranice: string }[];
  rubrika?: Rubrika;
}

/**
 * POST /api/usmena-vjezba/ocijeni — { poglavljeBroj, pitanje, transkript }
 *
 * PRIVATNOST: ova ruta prima i pohranjuje ISKLJUČIVO potvrđeni tekstualni
 * transkript i metrike. Audio snimka nikad ne dolazi ovamo niti se igdje
 * trajno pohranjuje (vidi /api/transkript — transkribira u memoriji i odbacuje).
 *
 * Vježba je TRENING: procjena je opisna („uglavnom točno / djelomično /
 * netočno"), bez službenog ocjenjivanja.
 */
export async function POST(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const poglavljeBroj: number | undefined = body?.poglavljeBroj || undefined;
  const pitanje: string = (body?.pitanje || '').trim();
  const transkript: string = (body?.transkript || '').trim();
  if (!pitanje || !transkript) {
    return NextResponse.json({ greska: 'Nedostaje pitanje ili transkript.' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let poglavljeId: string | undefined;
  if (poglavljeBroj) {
    const { data } = await admin.from('poglavlja').select('id').eq('broj', poglavljeBroj).single();
    poglavljeId = data?.id;
  }

  const kraj = mjeri();
  // Dohvat vodi pitanje; transkript se dodaje samo kao pomoćni signal (skraćen),
  // da studentove vlastite formulacije ne odvuku dohvat s teme pitanja.
  const chunks = await retrieve(`${pitanje}\n${transkript.slice(0, 400)}`, {
    poglavljeId,
    topK: 8,
  });

  if (!dovoljnoKonteksta(chunks)) {
    await zabiljezi({ vrsta: 'usmena_ocjena', poglavljeId, imaKontekst: false, brojIsjecaka: chunks.length, trajanjeMs: kraj() });
    return NextResponse.json(
      nedovoljnoKonteksta('Nemam dovoljno podloge u priručniku da bih pouzdano vrednovao ovaj odgovor. Pokušajte s pitanjem iz druge cjeline.'),
    );
  }

  const rezultat = await askClaudeJson<Povratna>(
    buildOralSystemPrompt(),
    buildOralUserPrompt(pitanje, transkript, chunks),
  );

  if (rezultat.tip === 'usmena_vjezba') {
    if (!rezultat.citati || rezultat.citati.length === 0) {
      rezultat.citati = toCitations(chunks).map((c) => ({ poglavlje: c.poglavlje, stranice: c.stranice }));
    }
    await admin.from('usmene_vjezbe_pokusaji').insert({
      user_id: auth.korisnik.id,
      poglavlje_id: poglavljeId ?? null,
      pitanje,
      transkript,
      procjena: rezultat.procjena ?? null,
      nedostaje: rezultat.nedostaje ?? [],
      pogresno: rezultat.pogresno ?? [],
      savjeti: rezultat.savjeti ?? [],
      idealni_odgovor: rezultat.idealni_odgovor ?? '',
      rubrika: rezultat.rubrika ?? {},
    });
  }

  await zabiljezi({
    vrsta: 'usmena_ocjena',
    poglavljeId,
    imaKontekst: true,
    brojIsjecaka: chunks.length,
    najboljiScore: chunks[0]?.score ?? null,
    trajanjeMs: kraj(),
    rubrikaZbroj: zbrojRubrike(rezultat.rubrika),
  });

  return NextResponse.json(rezultat);
}

function zbrojRubrike(r?: Rubrika): number | null {
  if (!r) return null;
  const vrijednosti = [r.tocnost, r.pokrivenost, r.terminologija, r.jasnoca].filter(
    (v): v is number => typeof v === 'number',
  );
  return vrijednosti.length > 0 ? vrijednosti.reduce((a, b) => a + b, 0) : null;
}
