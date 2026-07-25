import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { retrieve, dovoljnoKonteksta, toCitations } from '@/lib/retrieval';
import { buildChatSystemPrompt, buildChatUserPrompt } from '@/lib/prompt';
import { askClaudeJson, nedovoljnoKonteksta } from '@/lib/claude';
import { supabaseAdmin } from '@/lib/supabase';
import { mjeri, zabiljezi } from '@/lib/telemetrija';

/**
 * POST /api/chat — { pitanje, lekcijaId?, ukljuciDopunske? }
 *
 * Dva načina rada:
 *   - chat u lekciji (lekcijaId zadan): dohvat pristran prema toj lekciji, bez disclaimera;
 *   - opći chat: dohvat po cijelom priručniku, uz napomenu „Odgovaram samo prema udžbeniku.".
 *
 * Ako dohvat nema dovoljno pokrića, odgovor se odbija PRIJE poziva generativnom
 * modelu — jeftinije je i pouzdanije nego se osloniti na to da model sam prizna
 * neznanje.
 */
export async function POST(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const pitanje: string = (body?.pitanje || '').trim();
  const lekcijaId: string | undefined = body?.lekcijaId || undefined;
  const ukljuciDopunske: boolean = body?.ukljuciDopunske === true;
  if (!pitanje) return NextResponse.json({ greska: 'Nedostaje pitanje.' }, { status: 400 });

  const kraj = mjeri();
  const chunks = await retrieve(pitanje, { lekcijaId, ukljuciDopunske });
  const imaKontekst = dovoljnoKonteksta(chunks);

  if (!imaKontekst) {
    await zabiljezi({
      vrsta: 'chat',
      lekcijaId,
      imaKontekst: false,
      brojIsjecaka: chunks.length,
      najboljiScore: chunks[0]?.score ?? null,
      trajanjeMs: kraj(),
    });
    return NextResponse.json(
      nedovoljnoKonteksta(
        'U priručniku nisam pronašao dovoljno podloge za pouzdan odgovor na to pitanje. Možete li ga preciznije postaviti — ili navesti poglavlje, lekciju ili stranicu na koju se odnosi?',
        await predlozeneLekcije(pitanje),
      ),
    );
  }

  const nacin: 'lekcija' | 'opci' = lekcijaId ? 'lekcija' : 'opci';
  const odgovor = await askClaudeJson<Record<string, unknown>>(
    buildChatSystemPrompt(nacin),
    buildChatUserPrompt(pitanje, chunks, lekcijaId, body?.naslovLekcije),
  );

  // Citati su uvjet vjernosti izvoru: ako ih model izostavi, dopisuju se iz
  // stvarno dohvaćenih isječaka, da odgovor nikad ne ostane bez traga do izvora.
  if (odgovor.tip === 'chat_odgovor') {
    const citati = odgovor.citati as unknown[] | undefined;
    if (!citati || citati.length === 0) odgovor.citati = toCitations(chunks);
  }

  await zabiljezi({
    vrsta: 'chat',
    lekcijaId,
    imaKontekst: true,
    brojIsjecaka: chunks.length,
    najboljiScore: chunks[0]?.score ?? null,
    trajanjeMs: kraj(),
  });

  return NextResponse.json(odgovor);
}

/** Tri lekcije s najboljim leksičkim poklapanjem — prijedlog kad dohvat zakaže. */
async function predlozeneLekcije(pitanje: string): Promise<string[]> {
  const rijeci = pitanje
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 4);
  if (rijeci.length === 0) return [];

  const { data } = await supabaseAdmin()
    .from('lekcije')
    .select('oznaka, naslov')
    .or(rijeci.slice(0, 4).map((w) => `naslov.ilike.%${w}%`).join(','))
    .limit(3);

  return (data ?? []).map((l) => (l.oznaka ? `${l.oznaka} ${l.naslov}` : l.naslov));
}
