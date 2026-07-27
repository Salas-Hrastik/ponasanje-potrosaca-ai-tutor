'use client';

import { useEffect, useState } from 'react';

/**
 * Napredak se dohvaća i mijenja isključivo na klijentu — time stranica cjeline
 * ostaje statička i cacheable, a svaki student ipak vidi svoje stanje.
 */
export default function NapredakOznaka({ poglavljeBroj }: { poglavljeBroj: number }) {
  const [zavrseno, setZavrseno] = useState<boolean | null>(null);

  useEffect(() => {
    let otkazano = false;

    // Posjet cjelini bilježi se pri otvaranju; POST vraća id cjeline, pa se
    // stanje očita iz istog kruga bez dodatnog upita za mapiranje broj → id.
    let poglavljeId: string | null = null;
    fetch('/api/napredak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poglavljeBroj }),
    })
      .then((r) => r.json())
      .then((data) => {
        poglavljeId = data.poglavljeId ?? null;
        return fetch('/api/napredak');
      })
      .then((r) => r.json())
      .then((data) => {
        if (otkazano) return;
        const zapis = (data.napredak ?? []).find(
          (n: { poglavlje_id: string }) => n.poglavlje_id === poglavljeId,
        );
        setZavrseno(!!zapis?.zavrseno);
      })
      .catch(() => {
        if (!otkazano) setZavrseno(false);
      });

    return () => {
      otkazano = true;
    };
  }, [poglavljeBroj]);

  async function prebaci() {
    const novo = !zavrseno;
    setZavrseno(novo);
    await fetch('/api/napredak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poglavljeBroj, zavrseno: novo }),
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
      {zavrseno ? '✓ Cjelina pregledana' : 'Označi cjelinu pregledanom'}
    </button>
  );
}
