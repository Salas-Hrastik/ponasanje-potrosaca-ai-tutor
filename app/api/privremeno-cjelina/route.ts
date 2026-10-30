/**
 * PRIVREMENA ruta: mediji cjeline 12 (TOMAS) iz produkcije, gdje su ključevi
 * Supabasea već postavljeni. Uklanja se odmah nakon upisa.
 *
 * Zaštita: zaglavlje x-tajna mora dati SHA-256 naveden ispod.
 *
 *   POST ?korak=potpis   tijelo: {putevi: [...]} → potpisani URL-ovi za upload
 *   POST ?korak=mediji   tijelo: {stavke: [{tip, naslov, url, trajanje_s}]}
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SAZETAK_TAJNE = '0f7fdb1ca93a7cb351c382e916e0dcd1e654a889af5c63969703b5d296214732';

export async function POST(request: NextRequest) {
  const tajna = request.headers.get('x-tajna') ?? '';
  if (createHash('sha256').update(tajna).digest('hex') !== SAZETAK_TAJNE) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }
  const korak = request.nextUrl.searchParams.get('korak');
  if (korak !== 'potpis' && korak !== 'mediji') {
    return NextResponse.json({ greska: 'Nepoznat korak.' }, { status: 400 });
  }

  try {
    const ulaz = await request.json();
    const sb = supabaseAdmin();

    if (korak === 'potpis') {
      const putevi = (ulaz.putevi ?? []) as string[];
      const rez = [];
      for (const put of putevi) {
        if (!/^12 cjelina\/[\w./-]+$/.test(put)) throw new Error(`Neispravan put: ${put}`);
        const { data, error } = await sb.storage.from('mediji').createSignedUploadUrl(put, { upsert: true });
        if (error) throw new Error(`${put}: ${error.message}`);
        rez.push({ put, signedUrl: data.signedUrl });
      }
      return NextResponse.json({ potpisi: rez });
    }

    const stavke = (ulaz.stavke ?? []) as { tip: string; naslov: string; url: string; trajanje_s?: number }[];
    const { data: pog } = await sb.from('poglavlja').select('id').eq('broj', 12).single();
    if (!pog) throw new Error('Nema cjeline 12.');
    await sb.from('mediji').delete().eq('poglavlje_id', pog.id);
    const { error } = await sb.from('mediji').insert(
      stavke.map((s, i) => ({
        poglavlje_id: pog.id,
        tip: s.tip,
        naslov: s.naslov,
        url: s.url,
        trajanje_s: s.trajanje_s ?? null,
        redoslijed: i,
      })),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ mediji: stavke.length });
  } catch (e) {
    return NextResponse.json({ greska: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
