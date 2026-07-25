import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// Magic-link / OAuth povratni URL — zamjenjuje "code" za sesiju (cookie).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const sljedeci = request.nextUrl.searchParams.get('sljedeci') || '/';

  if (code) {
    await supabaseServer().auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(sljedeci, request.url));
}
