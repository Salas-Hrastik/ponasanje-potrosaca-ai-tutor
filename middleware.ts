import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const JAVNE_PUTANJE = ['/prijava', '/registracija', '/auth/callback'];
const GOST_COOKIE = 'gost_id';
const GODINA_S = 60 * 60 * 24 * 365;

/**
 * Middleware ima dvije zadaće:
 *  1) uvijek osigurati stabilan `gost_id` kolačić (nositelj napretka dok je
 *     autentikacija umirovljena — vidi lib/auth.ts);
 *  2) kad je AUTH_ENABLED=true, osvježiti Supabase sesiju i preusmjeriti
 *     neprijavljene na /prijava.
 *
 * Vrijednost se čita iz process.env izravno jer middleware radi u Edge
 * runtimeu i ne uvozi lib/config (koji povlači Node ovisnosti).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  if (!request.cookies.get(GOST_COOKIE)) {
    // Edge runtime: Web Crypto je globalan (node:crypto ovdje nije dostupan).
    response.cookies.set(GOST_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GODINA_S,
    });
  }

  const authEnabled = process.env.AUTH_ENABLED === 'true' || process.env.AUTH_ENABLED === '1';
  if (!authEnabled) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const javna = JAVNE_PUTANJE.some((p) => request.nextUrl.pathname.startsWith(p));
  const statika = /\.(svg|png|jpg|jpeg|ico|css|js|webmanifest)$/.test(request.nextUrl.pathname);

  if (!user && !javna && !statika) {
    const url = request.nextUrl.clone();
    url.pathname = '/prijava';
    url.searchParams.set('sljedeci', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
