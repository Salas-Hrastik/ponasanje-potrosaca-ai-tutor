/**
 * PRIVREMENA ruta: upis kviza i kartica cjeline 12 (TOMAS) iz produkcije, gdje
 * su ključevi Supabasea već postavljeni. Uklanja se odmah nakon upisa.
 *
 * Zaštita: zaglavlje x-tajna mora dati SHA-256 naveden ispod.
 *
 *   POST ?korak=kviz      tijelo: data/kviz-poglavlje-12.json
 *   POST ?korak=kartice   tijelo: data/kartice-poglavlje-12.json
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SAZETAK_TAJNE = '55124e6e095dd2aee59c59402b05ca66c0210920bbdca542df6bf33312c50e0d';

export async function POST(request: NextRequest) {
  const tajna = request.headers.get('x-tajna') ?? '';
  if (createHash('sha256').update(tajna).digest('hex') !== SAZETAK_TAJNE) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }

  const korak = request.nextUrl.searchParams.get('korak');
  if (korak !== 'kviz' && korak !== 'kartice') {
    return NextResponse.json({ greska: 'Nepoznat korak.' }, { status: 400 });
  }

  try {
    const ulaz = await request.json();
    const sb = supabaseAdmin();
    const { data: pog } = await sb.from('poglavlja').select('id').eq('broj', 12).single();
    if (!pog) throw new Error('Nema cjeline 12.');
    const { data: odjeljci } = await sb.from('odjeljci').select('id, oznaka').eq('poglavlje_id', pog.id);
    const odj = new Map((odjeljci ?? []).map((o) => [o.oznaka, o.id]));

    if (korak === 'kviz') {
      const pitanja = (ulaz.pitanja ?? []) as {
        odjeljak_oznaka?: string; pitanje: string; odgovori: string[];
        tocan_index: number; objasnjenje?: string; stranica_ref?: string;
      }[];
      await sb.from('kviz_pitanja').delete().eq('poglavlje_id', pog.id).eq('izvor_unosa', 'nastavnik');
      const { error } = await sb.from('kviz_pitanja').insert(
        pitanja.map((p) => ({
          poglavlje_id: pog.id,
          odjeljak_id: p.odjeljak_oznaka ? odj.get(p.odjeljak_oznaka) ?? null : null,
          pitanje: p.pitanje,
          odgovori: p.odgovori,
          tocan_index: p.tocan_index,
          objasnjenje: p.objasnjenje ?? '',
          stranica_ref: p.stranica_ref ?? '',
          odobreno: true,
          izvor_unosa: 'nastavnik',
        })),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ kviz: pitanja.length });
    }

    const kartice = (ulaz.kartice ?? []) as {
      odjeljak_oznaka?: string; pojam: string; definicija: string; stranica_ref?: string;
    }[];
    await sb.from('kartice').delete().eq('poglavlje_id', pog.id).eq('izvor_unosa', 'nastavnik');
    const { error } = await sb.from('kartice').insert(
      kartice.map((k, i) => ({
        poglavlje_id: pog.id,
        odjeljak_id: k.odjeljak_oznaka ? odj.get(k.odjeljak_oznaka) ?? null : null,
        pojam: k.pojam,
        definicija: k.definicija,
        stranica_ref: k.stranica_ref ?? '',
        redoslijed: i,
        odobreno: true,
        izvor_unosa: 'nastavnik',
      })),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ kartice: kartice.length });
  } catch (e) {
    return NextResponse.json({ greska: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
