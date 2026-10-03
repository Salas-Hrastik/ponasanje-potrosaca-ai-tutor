import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Keep-alive ruta: periodičan beznačajan upit prema Supabaseu sprječava da se
 * besplatni projekt uspava zbog mirovanja (gasi se nakon tjedan dana bez
 * ijednog API zahtjeva). Poziva je Vercel Cron iz vercel.json.
 */
export async function GET() {
  const { error } = await supabaseAdmin().from('poglavlja').select('id').limit(1);
  if (error) return NextResponse.json({ budan: false, greska: error.message }, { status: 500 });
  return NextResponse.json({ budan: true });
}
