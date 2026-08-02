import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { retrieve, toCitations } from '@/lib/retrieval';
import { config } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/realtime/gradivo — alat glasovnog razgovora.
 *
 * Ovo je jedini put kojim gradivo dolazi do glasovnog modela: vrti isti dohvat
 * kao pismeni razgovor, uz oštriju branu (niže). Ako pokrića nema, alat to
 * izričito kaže i model dobiva uputu da prizna neznanje umjesto da nagađa.
 *
 * Isječci se skraćuju: govorni odgovor je kratak, a dugačak kontekst usporava
 * odgovor bez koristi.
 */

/**
 * Brana je OŠTRIJA nego u pismenom razgovoru. Ondje odgovor prolazi kroz JSON s
 * citatima, pa se promašaj vidi; izgovorenu tvrdnju ne provjerava nitko.
 *
 * Izmjereno na cjelini 1: pitanja iz gradiva postižu 0,53–0,69, a pitanja izvan
 * njega („cijena karte za Tokio", „vrijeme sutra", „recept za sarmu") 0,27–0,32.
 * Opća brana od 0,18 propušta i jedno i drugo; 0,41 ih čisto razdvaja.
 */
const GOVORNA_BRANA = config.ragMinScore * 2.3;

async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const upit: string = (body?.upit || '').trim();
  const poglavljeBroj = Number(body?.poglavljeBroj);
  if (!upit) return NextResponse.json({ greska: 'Nedostaje upit.' }, { status: 400 });

  let poglavljeId: string | undefined;
  if (Number.isFinite(poglavljeBroj)) {
    const { data } = await supabaseAdmin()
      .from('poglavlja')
      .select('id')
      .eq('broj', poglavljeBroj)
      .single();
    poglavljeId = data?.id;
  }

  const kraj = mjeri();
  const chunks = await retrieve(upit, { poglavljeId, topK: 6, rerank: false });
  const najbolji = chunks.length > 0 ? Math.max(...chunks.map((c) => c.score)) : 0;
  const ima = najbolji >= GOVORNA_BRANA;

  await zabiljezi({
    vrsta: 'chat',
    poglavljeId,
    imaKontekst: ima,
    brojIsjecaka: chunks.length,
    najboljiScore: chunks[0]?.score ?? null,
    trajanjeMs: kraj(),
  });

  if (!ima) {
    return NextResponse.json({
      nadjeno: false,
      uputa:
        'U priručniku nema dovoljno podloge za ovo pitanje. Reci to studentu otvoreno u jednoj rečenici i predloži u kojoj bi cjelini mogao tražiti. NEMOJ odgovoriti iz vlastitog znanja.',
    });
  }

  return NextResponse.json({
    nadjeno: true,
    uputa: 'Odgovori isključivo prema ovim isječcima. Ne dodaji ništa izvan njih.',
    isjecci: chunks.slice(0, 4).map((c) => ({
      poglavlje: c.poglavljeNaslov,
      odjeljak: c.naslovOdjeljka,
      tekst: c.text.slice(0, 900),
    })),
    citati: toCitations(chunks).slice(0, 3),
  });
}

export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Dohvat gradiva trenutačno nije dostupan.');
  }
}
