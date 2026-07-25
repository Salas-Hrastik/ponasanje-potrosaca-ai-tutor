'use client';

import { useEffect, useState } from 'react';

/**
 * Napredak se dohvaća i mijenja isključivo na klijentu — time stranica lekcije
 * ostaje statička i cacheable, a svaki student ipak vidi svoje stanje.
 */
export default function NapredakOznaka({ lekcijaId }: { lekcijaId: string }) {
  const [zavrseno, setZavrseno] = useState<boolean | null>(null);

  useEffect(() => {
    let otkazano = false;

    // Posjet lekciji bilježi se pri otvaranju; odgovor sadrži i trenutačno stanje.
    fetch('/api/napredak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lekcijaId }),
    })
      .then(() => fetch('/api/napredak'))
      .then((r) => r.json())
      .then((data) => {
        if (otkazano) return;
        const zapis = (data.napredak ?? []).find((n: { lekcija_id: string }) => n.lekcija_id === lekcijaId);
        setZavrseno(!!zapis?.zavrseno);
      })
      .catch(() => {
        if (!otkazano) setZavrseno(false);
      });

    return () => {
      otkazano = true;
    };
  }, [lekcijaId]);

  async function prebaci() {
    const novo = !zavrseno;
    setZavrseno(novo);
    await fetch('/api/napredak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lekcijaId, zavrseno: novo }),
    }).catch(() => setZavrseno(!novo));
  }

  if (zavrseno === null) {
    return <span className="gumb-pregledano gumb-onemogucen">Učitavam napredak…</span>;
  }

  return (
    <button
      className={zavrseno ? 'gumb-pregledano gumb-pregledano-aktivno' : 'gumb-pregledano'}
      onClick={prebaci}
    >
      {zavrseno ? '✓ Lekcija pregledana' : 'Označi lekciju pregledanom'}
    </button>
  );
}
