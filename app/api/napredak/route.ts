import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/napredak — napredak trenutnog korisnika (ili gosta) po cjelinama
export async function GET() {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from('napredak')
    .select('poglavlje_id, posjeceno, zavrseno')
    .eq('user_id', auth.korisnik.id);
  if (error) return NextResponse.json({ greska: error.message }, { status: 500 });
  return NextResponse.json({ napredak: data ?? [] });
}

// POST /api/napredak — { poglavljeBroj, zavrseno? }
export async function POST(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const poglavljeBroj: number = body?.poglavljeBroj;
  if (!poglavljeBroj) return NextResponse.json({ greska: 'Nedostaje poglavljeBroj.' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pog } = await admin.from('poglavlja').select('id').eq('broj', poglavljeBroj).single();
  if (!pog) return NextResponse.json({ greska: 'Cjelina nije pronađena.' }, { status: 404 });

  // `zavrseno` se ne dira pri običnom posjetu — jednom pregledana cjelina ostaje
  // pregledana dok je student sam ne poništi.
  const zapis: Record<string, unknown> = {
    user_id: auth.korisnik.id,
    poglavlje_id: pog.id,
    posjeceno: true,
    posljednji_pristup: new Date().toISOString(),
  };
  if (typeof body?.zavrseno === 'boolean') zapis.zavrseno = body.zavrseno;

  const { error } = await admin.from('napredak').upsert(zapis, { onConflict: 'user_id,poglavlje_id' });
  if (error) return NextResponse.json({ greska: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, poglavljeId: pog.id });
}
