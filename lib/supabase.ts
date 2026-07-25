/**
 * Supabase klijenti — SAMO za server (API rute, server komponente, skripte).
 * next/headers se ne smije uvoziti u module koje uvoze klijentske ('use client')
 * komponente, stoga je supabaseBrowser() u zasebnoj datoteci (lib/supabase-browser.ts).
 *  - supabaseAdmin(): service-role, ISKLJUČIVO server.
 *  - supabaseServer(): server-side klijent vezan na korisnikovu sesiju (cookies).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireEnv } from './config';

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _admin;
}

export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Poziv iz server komponente (bez mogućnosti pisanja) — middleware već osvježava sesiju.
          }
        },
      },
    },
  );
}
