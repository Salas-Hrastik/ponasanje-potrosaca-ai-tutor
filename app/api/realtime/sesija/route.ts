import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { config, speechApiKey } from '@/lib/config';
import { buildRealtimeUpute } from '@/lib/prompt';
import { supabaseAdmin } from '@/lib/supabase';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';

/**
 * POST /api/realtime/sesija — { poglavljeBroj, nacin } → efemerni ključ
 *
 * Govor-na-govor traži da preglednik razgovara izravno s OpenAI-jem, pa mu
 * treba ključ. Trajni ključ se NIKAD ne šalje pregledniku: ovdje se traži
 * efemerni (`ek_…`), koji vrijedi nekoliko minuta i vezan je uz jednu sesiju.
 *
 * Upute i alat postavljaju se OVDJE, na poslužitelju — preglednik ih ne može
 * promijeniti i time zaobići pravilo da se odgovara samo prema priručniku.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  if (!config.realtimeUkljucen) {
    return NextResponse.json({ greska: 'Glasovni razgovor je isključen.' }, { status: 503 });
  }

  const body = await request.json();
  const poglavljeBroj = Number(body?.poglavljeBroj);
  const nacin: 'razgovor' | 'ispit' = body?.nacin === 'ispit' ? 'ispit' : 'razgovor';
  if (!Number.isFinite(poglavljeBroj)) {
    return NextResponse.json({ greska: 'Nedostaje cjelina.' }, { status: 400 });
  }

  const { data: pog } = await supabaseAdmin()
    .from('poglavlja')
    .select('broj, naslov')
    .eq('broj', poglavljeBroj)
    .single();
  if (!pog) return NextResponse.json({ greska: 'Nema te cjeline.' }, { status: 404 });

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${speechApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: config.realtimeModel,
        instructions: buildRealtimeUpute(nacin, pog.broj, pog.naslov),
        audio: {
          input: {
            // Prijepis studentova govora ide na zaslon, da razgovor ostane
            // provjerljiv i da se može čitati bez slušanja.
            transcription: { model: config.asrModel, language: 'hr' },
            turn_detection: { type: 'server_vad', silence_duration_ms: 700 },
          },
          output: { voice: config.realtimeVoice },
        },
        tools: [
          {
            type: 'function',
            name: 'dohvati_gradivo',
            description:
              'Dohvaća isječke priručnika za zadani pojam ili pitanje. Pozovi PRIJE svake tvrdnje o gradivu i odgovaraj isključivo prema vraćenim isječcima.',
            parameters: {
              type: 'object',
              properties: {
                upit: {
                  type: 'string',
                  description: 'Pojam ili pitanje na hrvatskom, npr. „percipirani rizik u turizmu".',
                },
              },
              required: ['upit'],
            },
          },
        ],
        tool_choice: 'auto',
      },
    }),
  });

  if (!res.ok) {
    console.error('[realtime] sesija:', res.status, await res.text());
    return NextResponse.json(
      { greska: 'Glasovni razgovor trenutačno nije dostupan.' },
      { status: 502 },
    );
  }

  const podaci = (await res.json()) as { value: string; expires_at: number };
  return NextResponse.json(
    {
      kljuc: podaci.value,
      model: config.realtimeModel,
      istice: podaci.expires_at,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Glasovni razgovor trenutačno nije dostupan.');
  }
}
