/**
 * PRIVREMENA ruta: upis ciljeva učenja cjeline 12 (TOMAS) iz produkcije, gdje
 * su ključevi Supabasea već postavljeni. Uklanja se odmah nakon upisa.
 *
 * Zaštita: zaglavlje x-tajna mora dati SHA-256 naveden ispod.
 *
 *   POST ?korak=ciljevi   tijelo: data/ciljevi-poglavlje-12.json
 */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const SAZETAK_TAJNE = 'deb485baad9a2e2c6f3f72b251a27a50c21436168a45f6d4f05c5497b1d024e8';

export async function POST(request: NextRequest) {
  const tajna = request.headers.get('x-tajna') ?? '';
  if (createHash('sha256').update(tajna).digest('hex') !== SAZETAK_TAJNE) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }
  if (request.nextUrl.searchParams.get('korak') !== 'ciljevi') {
    return NextResponse.json({ greska: 'Nepoznat korak.' }, { status: 400 });
  }

  try {
    const ciljevi = ((await request.json()).ciljevi ?? []) as {
      tekst: string; kognitivna_razina?: string; stranica?: number;
    }[];
    const sb = supabaseAdmin();
    const { data: pog } = await sb.from('poglavlja').select('id').eq('broj', 12).single();
    if (!pog) throw new Error('Nema cjeline 12.');
    await sb.from('ciljevi_ucenja').delete().eq('poglavlje_id', pog.id);
    const { error } = await sb.from('ciljevi_ucenja').insert(
      ciljevi.map((c, i) => ({
        poglavlje_id: pog.id,
        tekst: c.tekst,
        kognitivna_razina: c.kognitivna_razina ?? '',
        stranica: c.stranica ?? null,
        redoslijed: i,
        odobreno: true,
      })),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ciljevi: ciljevi.length });
  } catch (e) {
    return NextResponse.json({ greska: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
