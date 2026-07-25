/** Anon Supabase klijent za klijentske ('use client') komponente. */
import { createBrowserClient } from '@supabase/ssr';

// Doslovni process.env.NEXT_PUBLIC_* izrazi su obavezni: Next.js ih ugrađuje
// u klijentski bundle pri buildu, a dinamički pristup (process.env[name])
// u pregledniku vraća undefined.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
