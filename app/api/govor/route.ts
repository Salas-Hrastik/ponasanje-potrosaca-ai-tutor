import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { config, speechApiKey } from '@/lib/config';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ZNAKOVA = 1800;

/**
 * POST /api/govor — { tekst } → audio/mpeg
 *
 * Čitanje pitanja i sažetaka naglas (TTS) u usmenoj vježbi. Generirani zvuk se
 * streama pregledniku i nigdje se ne pohranjuje.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const tekst: string = (body?.tekst || '').trim().slice(0, MAX_ZNAKOVA);
  if (!tekst) return NextResponse.json({ greska: 'Nedostaje tekst.' }, { status: 400 });

  const kraj = mjeri();
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${speechApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.ttsModel,
      voice: config.ttsVoice,
      input: tekst,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    console.error('[govor] TTS greška:', res.status, await res.text());
    return NextResponse.json({ greska: 'Čitanje naglas trenutačno nije dostupno.' }, { status: 502 });
  }

  await zabiljezi({ vrsta: 'tts', imaKontekst: true, trajanjeMs: kraj() });

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}

/** Neuhvaćena greška (npr. nedostajuća ENV varijabla) inače postane prazan 500. */
export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Čitanje naglas trenutačno nije dostupno.');
  }
}
