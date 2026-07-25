import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/napredak — napredak trenutnog korisnika (ili gosta)
export async function GET() {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from('napredak')
    .select('lekcija_id, posjeceno, zavrseno')
    .eq('user_id', auth.korisnik.id);
  if (error) return NextResponse.json({ greska: error.message }, { status: 500 });
  return NextResponse.json({ napredak: data ?? [] });
}

// POST /api/napredak — { lekcijaId, zavrseno? }
export async function POST(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const lekcijaId: string = body?.lekcijaId;
  if (!lekcijaId) return NextResponse.json({ greska: 'Nedostaje lekcijaId.' }, { status: 400 });

  // `zavrseno` se nikad ne vraća na false posjetom: jednom pregledana lekcija
  // ostaje pregledana dok je student sam ne poništi.
  const zapis: Record<string, unknown> = {
    user_id: auth.korisnik.id,
    lekcija_id: lekcijaId,
    posjeceno: true,
    posljednji_pristup: new Date().toISOString(),
  };
  if (typeof body?.zavrseno === 'boolean') zapis.zavrseno = body.zavrseno;

  const { error } = await supabaseAdmin()
    .from('napredak')
    .upsert(zapis, { onConflict: 'user_id,lekcija_id' });
  if (error) return NextResponse.json({ greska: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
