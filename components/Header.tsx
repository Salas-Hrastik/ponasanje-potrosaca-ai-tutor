import Link from 'next/link';
import { config } from '@/lib/config';
import { supabaseServer } from '@/lib/supabase';
import HeaderAuthActions from './HeaderAuthActions';

export default async function Header() {
  // Dok je autentikacija umirovljena, sesija se uopće ne dohvaća — nema
  // nepotrebnog poziva Supabaseu na svakom prikazu stranice.
  let email: string | null = null;
  if (config.authEnabled) {
    const {
      data: { user },
    } = await supabaseServer().auth.getUser();
    email = user?.email ?? null;
  }

  return (
    <header className="zaglavlje">
      <div className="zaglavlje-lijevo">
        <Link href="/" className="logo-link">
          <span className="logo-oznaka" aria-hidden="true">
            <img src="/baltazar-logo.png" alt="" className="logo-oznaka-slika" />
          </span>
          <span className="logo-tekst">
            <span className="naslov-app">Baltazarov AI asistent za učenje</span>
          </span>
        </Link>
      </div>
      <nav className="zaglavlje-nav">
        <Link href="/usmena-vjezba">Usmena vježba</Link>
        <Link href="/zavrsna-provjera">Završna provjera</Link>
        <Link href="/izvori">Izvori</Link>
        <Link href="/o-prirucniku">O priručniku</Link>
      </nav>
      {config.authEnabled && email && <HeaderAuthActions email={email} />}
    </header>
  );
}
