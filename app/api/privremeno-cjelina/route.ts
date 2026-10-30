/**
 * PRIVREMENA ruta: ponovni upis teksta cjeline 12 (TOMAS) iz produkcije, gdje
 * su ključevi Supabasea i OpenAI-ja već postavljeni. Uklanja se odmah nakon upisa.
 *
 * Zaštita: zaglavlje x-tajna mora dati SHA-256 naveden ispod.
 *
 *   POST ?korak=tekst   tijelo: Markdown cjeline
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ucitajCjelinu } from '@/lib/ingest-cjelina';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SAZETAK_TAJNE = 'ce7798f426f92c8f97f635913ecb7673e5d21a54f2179e2a1aa36545ed6a1243';

export async function POST(request: NextRequest) {
  const tajna = request.headers.get('x-tajna') ?? '';
  if (createHash('sha256').update(tajna).digest('hex') !== SAZETAK_TAJNE) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }
  if (request.nextUrl.searchParams.get('korak') !== 'tekst') {
    return NextResponse.json({ greska: 'Nepoznat korak.' }, { status: 400 });
  }
  try {
    const zapis: string[] = [];
    const rez = await ucitajCjelinu(await request.text(), { log: (p) => zapis.push(p) });
    return NextResponse.json({ ...rez, zapis });
  } catch (e) {
    return NextResponse.json({ greska: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
