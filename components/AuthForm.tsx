'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { config } from '@/lib/config';

/**
 * Prijava/registracija (Supabase Auth). Sloj je implementiran u cijelosti, ali
 * je do završetka izrade asistenta umirovljen zastavicom AUTH_ENABLED — dok je
 * isključena, middleware nikoga ne preusmjerava ovamo, a aplikacija radi s
 * anonimnim identitetom gosta.
 */
export default function AuthForm({ mode }: { mode: 'prijava' | 'registracija' }) {
  const [email, setEmail] = useState('');
  const [lozinka, setLozinka] = useState('');
  const [imePrezime, setImePrezime] = useState('');
  const [poruka, setPoruka] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [ucitava, setUcitava] = useState(false);

  const authUkljucen = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';

  async function posalji(e: React.FormEvent) {
    e.preventDefault();
    setGreska(null);
    setUcitava(true);
    const supabase = supabaseBrowser();
    try {
      if (mode === 'registracija') {
        const { error } = await supabase.auth.signUp({
          email,
          password: lozinka,
          options: { data: { puno_ime: imePrezime } },
        });
        if (error) throw error;
        setPoruka('Registracija uspješna. Provjerite e-poštu za potvrdu, zatim se prijavite.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: lozinka });
        if (error) throw error;
        // Tvrda navigacija: middleware odmah vidi novu sesiju.
        window.location.assign('/');
        return;
      }
    } catch (err: unknown) {
      setGreska(err instanceof Error ? err.message : 'Došlo je do pogreške.');
    } finally {
      setUcitava(false);
    }
  }

  async function magicLink() {
    setGreska(null);
    setUcitava(true);
    try {
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setPoruka('Poslali smo vam poveznicu za prijavu na e-poštu.');
    } catch (err: unknown) {
      setGreska(err instanceof Error ? err.message : 'Došlo je do pogreške.');
    } finally {
      setUcitava(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={posalji}>
      <h1>{mode === 'prijava' ? 'Prijava' : 'Registracija'}</h1>
      <p className="auth-podnaslov">
        {config.kolegij} · {config.ustanova}
      </p>

      {!authUkljucen && (
        <p className="auth-napomena">
          Autentikacija je trenutačno isključena dok traje izrada asistenta — aplikacija je dostupna i
          bez prijave. Ova je forma spremna i aktivira se postavljanjem <code>AUTH_ENABLED=true</code>.
        </p>
      )}

      {mode === 'registracija' && (
        <label>
          Ime i prezime
          <input value={imePrezime} onChange={(e) => setImePrezime(e.target.value)} required />
        </label>
      )}
      <label>
        E-pošta
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Lozinka
        <input
          type="password"
          value={lozinka}
          onChange={(e) => setLozinka(e.target.value)}
          required
          minLength={6}
        />
      </label>

      {greska && <p className="auth-greska">{greska}</p>}
      {poruka && <p className="auth-poruka">{poruka}</p>}

      <button type="submit" disabled={ucitava}>
        {mode === 'prijava' ? 'Prijavi se' : 'Registriraj se'}
      </button>

      {mode === 'prijava' && (
        <button type="button" className="auth-magic" onClick={magicLink} disabled={ucitava || !email}>
          Pošalji mi poveznicu za prijavu (bez lozinke)
        </button>
      )}

      <p className="auth-link">
        {mode === 'prijava' ? (
          <>
            Nemate račun? <a href="/registracija">Registrirajte se</a>
          </>
        ) : (
          <>
            Već imate račun? <a href="/prijava">Prijavite se</a>
          </>
        )}
      </p>
    </form>
  );
}
