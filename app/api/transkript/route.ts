import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { config, speechApiKey } from '@/lib/config';
import { mjeri, zabiljezi } from '@/lib/telemetrija';
import { odgovorNaGresku } from '@/lib/greske';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BAJTOVA = 20 * 1024 * 1024; // ~20 MB (nekoliko minuta govora)

/**
 * POST /api/transkript — multipart/form-data s poljem `audio`.
 *
 * PRIVATNOST — ključno: snimka se prosljeđuje ASR usluzi izravno iz memorije i
 * NIGDJE se ne zapisuje: ni na disk, ni u Supabase Storage, ni u bazu. Sprema
 * se samo tekstualni transkript (i to tek kad ga student potvrdi, u ruti
 * /api/usmena-vjezba/ocijeni) te tehničke metrike bez sadržaja.
 */
async function POSTImpl(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const forma = await request.formData();
  const audio = forma.get('audio');
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ greska: 'Nedostaje audio zapis.' }, { status: 400 });
  }
  if (audio.size > MAX_BAJTOVA) {
    return NextResponse.json({ greska: 'Snimka je predugačka. Snimite odgovor u trajanju do nekoliko minuta.' }, { status: 413 });
  }

  const kraj = mjeri();
  const uzlazna = new FormData();
  uzlazna.append('file', audio, imeDatoteke(audio.type));
  uzlazna.append('model', config.asrModel);
  uzlazna.append('language', 'hr');
  uzlazna.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${speechApiKey()}` },
    body: uzlazna,
  });

  if (!res.ok) {
    console.error('[transkript] ASR greška:', res.status, await res.text());
    return NextResponse.json({ greska: 'Transkripcija nije uspjela. Pokušajte ponovno ili upišite odgovor.' }, { status: 502 });
  }

  const json = (await res.json()) as { text?: string };
  const transkript = normaliziraj(json.text ?? '');

  await zabiljezi({ vrsta: 'asr', imaKontekst: transkript.length > 0, trajanjeMs: kraj() });

  return NextResponse.json({ tip: 'transkript', transkript });
}

/** Whisper prepoznaje format po ekstenziji imena datoteke, ne po MIME tipu. */
function imeDatoteke(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'odgovor.mp4';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'odgovor.mp3';
  if (mime.includes('ogg')) return 'odgovor.ogg';
  if (mime.includes('wav')) return 'odgovor.wav';
  return 'odgovor.webm';
}

/** Blaga normalizacija transkripta prije nego ga student potvrdi. */
function normaliziraj(t: string): string {
  return t
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

/** Neuhvaćena greška (npr. nedostajuća ENV varijabla) inače postane prazan 500. */
export async function POST(request: NextRequest) {
  try {
    return await POSTImpl(request);
  } catch (e) {
    return odgovorNaGresku(e, 'Transkripcija trenutačno nije dostupna.');
  }
}
