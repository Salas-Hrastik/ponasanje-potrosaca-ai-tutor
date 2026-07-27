'use client';

import { useState } from 'react';
import OralPractice from './OralPractice';

interface PoglavljeIzbor {
  broj: number;
  naslov: string;
  brojOdjeljaka: number;
}

/** Izbor nastavne cjeline za usmenu vježbu izvan konteksta same cjeline. */
export default function OralPracticePicker({ poglavlja }: { poglavlja: PoglavljeIzbor[] }) {
  const [odabrano, setOdabrano] = useState<number | null>(null);
  const poglavlje = poglavlja.find((p) => p.broj === odabrano);

  return (
    <>
      <div className="usmena-izbor">
        {poglavlja.map((p) => (
          <button
            key={p.broj}
            className={`usmena-izbor-gumb ${odabrano === p.broj ? 'odabrano' : ''}`}
            onClick={() => setOdabrano(p.broj)}
          >
            <span className="usmena-izbor-broj">{p.broj}.</span>
            <span className="usmena-izbor-naslov">{p.naslov}</span>
            <span className="usmena-izbor-meta">{p.brojOdjeljaka} odjeljaka</span>
          </button>
        ))}
      </div>

      {poglavlje && (
        <OralPractice
          key={poglavlje.broj}
          poglavljeBroj={poglavlje.broj}
          naslovOpsega={`${poglavlje.broj}. ${poglavlje.naslov}`}
        />
      )}
    </>
  );
}
