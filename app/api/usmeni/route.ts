import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildUsmeniStreamSystemPrompt, buildChatUserPrompt, type Uloga, type PorukaPovijesti } from '@/lib/prompt';
import { streamClaudeText } from '@/lib/claude';
import { config } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/usmeni — usmeni razgovor sa STRUJANJEM odgovora.
 *
 * Vraća niz redaka u NDJSON obliku:
 *   {"t":"tekst","v":"komadić"}   — dijelovi odgovora kako nastaju
 *   {"t":"citati","v":[...]}      — citati iz stvarno dohvaćenih isječaka
 *   {"t":"kraj"}
 *
 * Zašto strujanje: klijent može izgovoriti prvu rečenicu čim je gotova, umjesto
 * da čeka cijeli odgovor pa tek onda sintezu — time perceptivno čekanje pada s
 * ~10 s na dvije-tri sekunde.
 *
 * VJERNOST IZVORU je nepromijenjena: brana „dovoljno konteksta" radi PRIJE
 * generiranja, a citati se ne uzimaju od modela nego iz dohvaćenih isječaka.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const pitanje: string = (body?.pitanje || '').trim();
  const poglavljeBroj: number | undefined = body?.poglavljeBroj || undefined;
  const uloga: Uloga = body?.uloga === 'ispitivac' ? 'ispitivac' : 'asistent';
  const povijest: PorukaPovijesti[] = Array.isArray(body?.povijest)
    ? body.povijest
        .filter(
          (p: unknown): p is PorukaPovijesti =>
            !!p &&
            typeof (p as PorukaPovijesti).tekst === 'string' &&
            ['student', 'asistent'].includes((p as PorukaPovijesti).autor),
        )
        .slice(-6)
    : [];
  if (!pitanje) return NextResponse.json({ greska: 'Nedostaje pitanje.' }, { status: 400 });

  let poglavljeId: string | undefined;
  if (poglavljeBroj) {
    const { data } = await supabaseAdmin()
      .from('poglavlja')
      .select('id')
      .eq('broj', poglavljeBroj)
      .single();
    poglavljeId = data?.id;
  }

  const kraj = mjeri();
  const zadnjeModelovo = [...povijest].reverse().find((p) => p.autor === 'asistent')?.tekst ?? '';
  const upitZaDohvat =
    uloga === 'ispitivac' && zadnjeModelovo ? `${zadnjeModelovo.slice(0, 400)}\n${pitanje}` : pitanje;

  const chunks = await retrieve(upitZaDohvat, {
    poglavljeId,
    topK: config.usmeniTopK,
    rerank: false,
  });

  const kodirnik = new TextEncoder();
  const redak = (o: unknown) => kodirnik.encode(`${JSON.stringify(o)}\n`);

  // Brana ostaje deterministička: bez dovoljnog pokrića model se ne poziva.
  if (!dovoljnoKonteksta(chunks)) {
    await zabiljezi({
      vrsta: 'chat',
      poglavljeId,
      imaKontekst: false,
      brojIsjecaka: chunks.length,
      najboljiScore: chunks[0]?.score ?? null,
      trajanjeMs: kraj(),
    });
    const poruka =
      'U priručniku nemam dovoljno podloge za pouzdan odgovor na to pitanje. Možete li ga postaviti preciznije ili navesti na koju se cjelinu odnosi?';
    return new NextResponse(
      new ReadableStream({
        start(c) {
          c.enqueue(redak({ t: 'tekst', v: poruka }));
          c.enqueue(redak({ t: 'kraj' }));
          c.close();
        },
      }),
      { headers: NDJSON_ZAGLAVLJA },
    );
  }

  const tok = new ReadableStream({
    async start(c) {
      let znakova = 0;
      try {
        for await (const dio of streamClaudeText(
          buildUsmeniStreamSystemPrompt(uloga),
          buildChatUserPrompt(pitanje, chunks, poglavljeBroj, body?.naslovPoglavlja, povijest, uloga),
        )) {
          znakova += dio.length;
          c.enqueue(redak({ t: 'tekst', v: dio }));
        }
        c.enqueue(redak({ t: 'citati', v: toCitations(chunks) }));
      } catch (e) {
        console.error('[usmeni] greška pri strujanju:', e);
        c.enqueue(redak({ t: 'tekst', v: ' Došlo je do prekida. Pokušajte ponovno.' }));
      } finally {
        c.enqueue(redak({ t: 'kraj' }));
        c.close();
        await zabiljezi({
          vrsta: 'chat',
          poglavljeId,
          imaKontekst: true,
          brojIsjecaka: chunks.length,
          najboljiScore: chunks[0]?.score ?? null,
          trajanjeMs: kraj(),
        });
        void znakova;
      }
    },
  });

  return new NextResponse(tok, { headers: NDJSON_ZAGLAVLJA });
}

const NDJSON_ZAGLAVLJA = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store',
  // Bez ovoga posrednici znaju puferirati odgovor i strujanje izgubi smisao.
  'X-Accel-Buffering': 'no',
};

export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Usmeni razgovor trenutačno nije dostupan.');
  }
}
