/**
 * Jedinstvena točka za identitet korisnika.
 *
 * Autentikacija (Supabase Auth: e-mail/lozinka + magic link, uloge student /
 * nastavnik) IMPLEMENTIRANA je u cijelosti, ali je NAMJERNO UMIROVLJENA do
 * završetka izrade asistenta — prekidač je config.authEnabled (ENV AUTH_ENABLED).
 *
 *  - AUTH_ENABLED=true  → identitet dolazi iz Supabase Auth sesije; neprijavljeni
 *                         korisnik ne prolazi (middleware ga preusmjeri na /prijava).
 *  - AUTH_ENABLED=false → identitet je anonimni "gost": stabilan UUID u kolačiću
 *                         `gost_id`. Napredak, kviz pokušaji i usmene vježbe rade
 *                         normalno i vežu se uz taj UUID, pa se nakon uključivanja
 *                         autentikacije ništa u shemi ne mijenja.
 */
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { config } from './config';
import { supabaseServer, supabaseAdmin } from './supabase';

export const GOST_COOKIE = 'gost_id';
const GODINA_S = 60 * 60 * 24 * 365;

export interface Korisnik {
  id: string;
  email: string;
  uloga: 'student' | 'nastavnik' | 'gost';
  gost: boolean;
}

/**
 * Vraća trenutačnog korisnika ili null ako je autentikacija uključena, a
 * korisnik nije prijavljen. Uz isključenu autentikaciju nikad ne vraća null.
 */
export async function dohvatiKorisnika(): Promise<Korisnik | null> {
  if (!config.authEnabled) {
    return { id: gostId(), email: '', uloga: 'gost', gost: true };
  }

  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return null;

  const { data: profil } = await supabaseAdmin()
    .from('profili')
    .select('uloga')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? '',
    uloga: (profil?.uloga as 'student' | 'nastavnik') ?? 'student',
    gost: false,
  };
}

/**
 * Stabilan identifikator gosta iz kolačića. Kolačić se ne može postaviti iz
 * server komponente (samo iz rute/akcije), pa se pri čitanju u komponenti
 * vraća postojeća vrijednost, a nova se upisuje tek kad je zapis moguć.
 */
export function gostId(): string {
  const jar = cookies();
  const postojeci = jar.get(GOST_COOKIE)?.value;
  if (postojeci) return postojeci;

  const novi = randomUUID();
  try {
    jar.set(GOST_COOKIE, novi, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GODINA_S,
    });
  } catch {
    // Server komponenta bez prava pisanja — kolačić postavlja middleware.
  }
  return novi;
}

/** Pomoćnik za API rute: 401 kad je autentikacija uključena, a korisnika nema. */
export async function zahtijevajKorisnika(): Promise<
  { ok: true; korisnik: Korisnik } | { ok: false; poruka: string }
> {
  const korisnik = await dohvatiKorisnika();
  if (!korisnik) return { ok: false, poruka: 'Niste prijavljeni.' };
  return { ok: true, korisnik };
}
