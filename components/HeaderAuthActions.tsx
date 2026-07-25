'use client';

import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function HeaderAuthActions({ email }: { email: string }) {
  const router = useRouter();

  async function odjava() {
    await supabaseBrowser().auth.signOut();
    router.push('/prijava');
    router.refresh();
  }

  return (
    <div className="zaglavlje-desno">
      <span className="korisnik-email">{email}</span>
      <button className="gumb-odjava" onClick={odjava}>
        Odjava
      </button>
    </div>
  );
}
