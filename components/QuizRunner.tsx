'use client';

import { useEffect, useState } from 'react';

interface Pitanje {
  id: string;
  pitanje: string;
  odgovori: string[];
  tocan_index: number;
  objasnjenje: string;
  stranica_ref?: string;
}

interface Rezultat {
  tocno: number;
  ukupno: number;
  postotak: number;
  preporuka: string;
}

const PREPORUKA_OPIS: Record<string, string> = {
  Izvrsno: 'Gradivo je usvojeno. Prijeđite na sljedeće poglavlje.',
  Dobro: 'Solidno — prođite još jednom lekcije u kojima ste griješili.',
  'Potrebno ponoviti gradivo': 'Vratite se na lekcije poglavlja i ponovite sažetke prije novog pokušaja.',
};

export default function QuizRunner({ poglavljeBroj, zavrsna }: { poglavljeBroj?: number; zavrsna?: boolean }) {
  const [pitanja, setPitanja] = useState<Pitanje[] | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [indeks, setIndeks] = useState(0);
  const [odabrano, setOdabrano] = useState<number | null>(null);
  const [potvrdjeno, setPotvrdjeno] = useState(false);
  const [odgovori, setOdgovori] = useState<{ pitanjeId: string; odabraniIndex: number }[]>([]);
  const [rezultat, setRezultat] = useState<Rezultat | null>(null);
  const [salje, setSalje] = useState(false);

  useEffect(() => {
    fetch(zavrsna ? '/api/kviz?zavrsna=1' : `/api/kviz?poglavljeBroj=${poglavljeBroj}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tip === 'nedovoljno_konteksta' || data.greska) {
          setPoruka(data.poruka ?? data.greska);
          setPitanja([]);
        } else {
          setPitanja(data.pitanja ?? []);
        }
      })
      .catch(() => {
        setPoruka('Kviz nije moguće učitati. Pokušajte ponovno.');
        setPitanja([]);
      });
  }, [poglavljeBroj, zavrsna]);

  if (!pitanja) return <p className="kviz-cekanje">Učitavam kviz…</p>;
  if (poruka) return <p className="kviz-poruka">{poruka}</p>;
  if (pitanja.length === 0) return <p className="kviz-poruka">Nema dostupnih pitanja.</p>;

  if (rezultat) {
    return (
      <div className="kviz-rezultat">
        <h2>{rezultat.preporuka}</h2>
        <p className="kviz-rezultat-brojka">
          Točno <strong>{rezultat.tocno}</strong> od {rezultat.ukupno} ({rezultat.postotak}%)
        </p>
        <p className="kviz-rezultat-opis">{PREPORUKA_OPIS[rezultat.preporuka] ?? ''}</p>
      </div>
    );
  }

  const trenutno = pitanja[indeks];
  const zadnje = indeks + 1 >= pitanja.length;

  function potvrdi() {
    if (odabrano === null) return;
    setPotvrdjeno(true);
    setOdgovori((prev) => [...prev, { pitanjeId: trenutno.id, odabraniIndex: odabrano }]);
  }

  async function dalje() {
    if (!zadnje) {
      setIndeks((i) => i + 1);
      setOdabrano(null);
      setPotvrdjeno(false);
      return;
    }
    setSalje(true);
    try {
      const res = await fetch('/api/kviz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poglavljeBroj, zavrsna: !!zavrsna, odgovori }),
      });
      setRezultat(await res.json());
    } catch {
      // Mreža je pukla pri predaji — rezultat se izračuna lokalno da student
      // ipak dobije povratnu informaciju (pokušaj se tada ne bilježi u bazu).
      const tocno = odgovori.filter((o) => {
        const p = pitanja!.find((q) => q.id === o.pitanjeId);
        return p && p.tocan_index === o.odabraniIndex;
      }).length;
      const postotak = Math.round((tocno / odgovori.length) * 100);
      setRezultat({
        tocno,
        ukupno: odgovori.length,
        postotak,
        preporuka: postotak >= 85 ? 'Izvrsno' : postotak >= 60 ? 'Dobro' : 'Potrebno ponoviti gradivo',
      });
    } finally {
      setSalje(false);
    }
  }

  return (
    <div className="kviz-runner">
      <div className="kviz-napredak-traka">
        <div className="napredak-traka">
          <div
            className="napredak-traka-ispuna"
            style={{ width: `${Math.round((indeks / pitanja.length) * 100)}%` }}
          />
        </div>
        <p className="kviz-napredak">
          Pitanje {indeks + 1} / {pitanja.length}
        </p>
      </div>

      <h3 className="kviz-pitanje">{trenutno.pitanje}</h3>

      <ul className="kviz-odgovori">
        {trenutno.odgovori.map((odg, i) => {
          let klasa = 'kviz-odgovor-gumb';
          if (odabrano === i) klasa += ' odabrano';
          if (potvrdjeno && i === trenutno.tocan_index) klasa += ' tocno';
          if (potvrdjeno && odabrano === i && i !== trenutno.tocan_index) klasa += ' netocno';
          return (
            <li key={i}>
              <button className={klasa} disabled={potvrdjeno} onClick={() => setOdabrano(i)}>
                <span className="kviz-slovo">{'ABCD'[i]}</span>
                <span className="kviz-tekst">{odg}</span>
                {potvrdjeno && i === trenutno.tocan_index && <span className="kviz-znak">✓</span>}
                {potvrdjeno && odabrano === i && i !== trenutno.tocan_index && (
                  <span className="kviz-znak">✗</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {potvrdjeno && (trenutno.objasnjenje || trenutno.stranica_ref) && (
        <p className="kviz-objasnjenje">
          {trenutno.objasnjenje}
          {trenutno.stranica_ref && <span className="kviz-stranica"> ({trenutno.stranica_ref})</span>}
        </p>
      )}

      {!potvrdjeno ? (
        <button className="gumb-primarni" disabled={odabrano === null} onClick={potvrdi}>
          Potvrdi
        </button>
      ) : (
        <button className="gumb-primarni" onClick={dalje} disabled={salje}>
          {zadnje ? (salje ? 'Računam…' : 'Prikaži rezultat') : 'Sljedeće pitanje'}
        </button>
      )}
    </div>
  );
}
