'use client';

import { useState } from 'react';

interface Kartica {
  id: string;
  pojam: string;
  definicija: string;
  stranica_ref: string;
}

/**
 * Kartice za učenje cjeline: pojam s prednje strane, definicija iz priručnika sa
 * stražnje, uz stranicu. Okretanje je namjerno po kartici (a ne skupno) — tako
 * student može pokrivati one koje još ne zna, a otkrivene ostaviti otvorene.
 */
export default function Kartice({ kartice }: { kartice: Kartica[] }) {
  const [okrenute, setOkrenute] = useState<Set<string>>(new Set());

  if (kartice.length === 0) return null;

  function prebaci(id: string) {
    setOkrenute((prije) => {
      const nove = new Set(prije);
      if (nove.has(id)) nove.delete(id);
      else nove.add(id);
      return nove;
    });
  }

  const sveOkrenute = okrenute.size === kartice.length;

  return (
    <section className="kartica kartice-blok">
      <div className="kartice-zaglavlje">
        <h3>🗂️ Kartice za učenje ({kartice.length})</h3>
        <button
          className="gumb-tekstualni"
          onClick={() => setOkrenute(sveOkrenute ? new Set() : new Set(kartice.map((k) => k.id)))}
        >
          {sveOkrenute ? 'Sakrij sve definicije' : 'Prikaži sve definicije'}
        </button>
      </div>
      <p className="kartice-uputa">Kliknite karticu da vidite definiciju iz priručnika.</p>
      <div className="kartice-mreza">
        {kartice.map((k) => {
          const otvorena = okrenute.has(k.id);
          return (
            <button
              key={k.id}
              className={`ucenje-kartica ${otvorena ? 'otvorena' : ''}`}
              onClick={() => prebaci(k.id)}
              aria-expanded={otvorena}
            >
              <span className="ucenje-pojam">{k.pojam}</span>
              {otvorena ? (
                <>
                  <span className="ucenje-definicija">{k.definicija}</span>
                  {k.stranica_ref && <span className="ucenje-stranica">{k.stranica_ref}</span>}
                </>
              ) : (
                <span className="ucenje-nagovjestaj">Prikaži definiciju</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
