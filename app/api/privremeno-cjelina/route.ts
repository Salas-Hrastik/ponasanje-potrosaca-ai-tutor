/**
 * PRIVREMENA ruta: upis cjeline 12 (TOMAS) iz produkcije, gdje su ključevi
 * Supabasea i OpenAI-ja već postavljeni. Uklanja se odmah nakon upisa.
 *
 * Zaštita: zaglavlje x-tajna mora dati SHA-256 naveden ispod (u kodu je samo
 * sažetak, ne i sama tajna).
 *
 *   POST ?korak=tekst                       tijelo: Markdown cjeline
 *   POST ?korak=datoteka&put=<Storage put>  tijelo: binarna datoteka
 *   POST ?korak=medij                       tijelo: {broj, tip, naslov, url}
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ucitajCjelinu } from '@/lib/ingest-cjelina';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SAZETAK_TAJNE = '224868339e59824962fb78885ca28197b6c43d50e52de4ddd17484aa9f6e865b';

export async function POST(request: NextRequest) {
  const tajna = request.headers.get('x-tajna') ?? '';
  if (createHash('sha256').update(tajna).digest('hex') !== SAZETAK_TAJNE) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }

  const korak = request.nextUrl.searchParams.get('korak');
  try {
    if (korak === 'tekst') {
      const zapis: string[] = [];
      const rez = await ucitajCjelinu(await request.text(), { log: (p) => zapis.push(p) });
      return NextResponse.json({ ...rez, zapis });
    }

    if (korak === 'datoteka') {
      const put = request.nextUrl.searchParams.get('put') ?? '';
      if (!/^12 cjelina\/[\w./-]+$/.test(put)) {
        return NextResponse.json({ greska: 'Neispravan put.' }, { status: 400 });
      }
      const tip = request.headers.get('content-type') ?? 'application/octet-stream';
      const { error } = await supabaseAdmin()
        .storage.from('mediji')
        .upload(put, Buffer.from(await request.arrayBuffer()), { contentType: tip, upsert: true });
      if (error) throw new Error(error.message);
      const url = supabaseAdmin().storage.from('mediji').getPublicUrl(put).data.publicUrl;
      return NextResponse.json({ put, url });
    }

    if (korak === 'medij') {
      const { tip, naslov, url } = await request.json();
      const sb = supabaseAdmin();
      const { data: pog, error: e1 } = await sb.from('poglavlja').select('id').eq('broj', 12).single();
      if (e1 || !pog) throw new Error('Nema cjeline 12.');
      await sb.from('mediji').delete().eq('poglavlje_id', pog.id).eq('url', url);
      const { error: e2 } = await sb
        .from('mediji')
        .insert({ poglavlje_id: pog.id, tip, naslov, url, redoslijed: 0 });
      if (e2) throw new Error(e2.message);
      return NextResponse.json({ upisano: true });
    }

    return NextResponse.json({ greska: 'Nepoznat korak.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ greska: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
