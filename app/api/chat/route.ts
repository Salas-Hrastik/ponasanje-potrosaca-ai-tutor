import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { retrieve, dovoljnoKonteksta, toCitations, sigurnostKonteksta } from '@/lib/retrieval';
import { buildChatStreamSystemPrompt, buildChatUserPrompt, type PorukaPovijesti } from '@/lib/prompt';
import { streamClaudeText } from '@/lib/claude';
import { config } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

/**
 * Dohvat (embedding + vektorska i leksička pretraga + reranking) pa generiranje
 * odgovora traje i preko 30 s — znatno više od Vercelove zadane granice od 10 s,
 * uz koju se funkcija u produkciji prekida prije nego što odgovor stigne.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/chat — pismeni razgovor sa STRUJANJEM odgovora.
 *
 * Vraća niz redaka u NDJSON obliku:
 *   {"t":"tekst","v":"komadić"}      — dijelovi odgovora kako nastaju
 *   {"t":"citati","v":[...]}         — izvori iz stvarno dohvaćenih isječaka
 *   {"t":"sigurnost","v":"visoka"}   — pokriće pitanja u priručniku
 *   {"t":"nedovoljno","v":{...}}     — dohvat nema pokrića, model se ne poziva
 *   {"t":"kraj"}
 *
 * Zašto strujanje: odgovor se ispisuje rečenicu po rečenicu kako nastaje,
 * umjesto da student gleda u prazno desetak sekundi pa dobije cijeli tekst
 * odjednom.
 *
 * VJERNOST IZVORU je nepromijenjena, čak i pojačana: brana „dovoljno konteksta"
 * radi PRIJE generiranja, a citati i procjena pokrića ne dolaze od modela nego
 * iz stvarno dohvaćenih isječaka.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const pitanje: string = (body?.pitanje || '').trim();
  const poglavljeBroj: number | undefined = body?.poglavljeBroj || undefined;
  const ukljuciDopunske: boolean = body?.ukljuciDopunske === true;
  // Povijest je ograničena: dovoljna za potpitanja („objasni to detaljnije"), a
  // da ne naraste proračun konteksta ni cijena poziva.
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

  const admin = supabaseAdmin();
  let poglavljeId: string | undefined;
  if (poglavljeBroj) {
    const { data } = await admin.from('poglavlja').select('id').eq('broj', poglavljeBroj).single();
    poglavljeId = data?.id;
  }

  const kraj = mjeri();
  const chunks = await retrieve(pitanje, { poglavljeId, ukljuciDopunske });

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
    const prijedlozi = await predlozeneCjeline(pitanje);
    return new NextResponse(
      new ReadableStream({
        start(c) {
          c.enqueue(
            redak({
              t: 'nedovoljno',
              v: {
                poruka:
                  'U priručniku nisam pronašao dovoljno podloge za pouzdan odgovor na to pitanje. Možete li ga preciznije postaviti — ili navesti poglavlje, odjeljak ili stranicu na koju se odnosi?',
                predlozene_cjeline: prijedlozi,
              },
            }),
          );
          c.enqueue(redak({ t: 'kraj' }));
          c.close();
        },
      }),
      { headers: NDJSON_ZAGLAVLJA },
    );
  }

  const nacin: 'cjelina' | 'opci' = poglavljeBroj ? 'cjelina' : 'opci';

  const tok = new ReadableStream({
    async start(c) {
      try {
        // Zadane vrijednosti u streamClaudeText su za USMENI odgovor (kratak,
        // 400 tokena); pismeni odgovor smije biti dulji.
        for await (const dio of streamClaudeText(
          buildChatStreamSystemPrompt(nacin),
          buildChatUserPrompt(pitanje, chunks, poglavljeBroj, body?.naslovPoglavlja, povijest),
          config.claudeMaxTokens,
          config.claudeModel,
        )) {
          c.enqueue(redak({ t: 'tekst', v: dio }));
        }
        // Dohvat vrati do desetak isječaka; u stupcu razgovora popis svih
        // izvora zauzme više prostora od samog odgovora, pa se prikazuju
        // četiri najbolje rangirana (isječci su već poredani po ocjeni).
        c.enqueue(redak({ t: 'citati', v: toCitations(chunks).slice(0, 4) }));
        c.enqueue(redak({ t: 'sigurnost', v: sigurnostKonteksta(chunks) }));
      } catch (e) {
        console.error('[chat] greška pri strujanju:', e);
        c.enqueue(redak({ t: 'tekst', v: '\n\nDošlo je do prekida. Pokušajte ponovno.' }));
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

/** Odjeljci s najboljim leksičkim poklapanjem — prijedlog kad dohvat zakaže. */
async function predlozeneCjeline(pitanje: string): Promise<string[]> {
  const rijeci = pitanje
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 4);
  if (rijeci.length === 0) return [];

  const { data } = await supabaseAdmin()
    .from('odjeljci')
    .select('oznaka, naslov')
    .or(rijeci.slice(0, 4).map((w) => `naslov.ilike.%${w}%`).join(','))
    .limit(3);

  return (data ?? []).map((o) => (o.oznaka ? `${o.oznaka} ${o.naslov}` : o.naslov));
}

/** Neuhvaćena greška (npr. nedostajuća ENV varijabla) inače postane prazan 500. */
export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Došlo je do pogreške pri dohvatu odgovora. Pokušajte ponovno.');
  }
}
