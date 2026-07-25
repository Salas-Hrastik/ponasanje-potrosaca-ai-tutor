'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Citat {
  poglavlje: string;
  stranice: string;
  isjecak?: string;
  izvor?: string;
}

interface Poruka {
  autor: 'student' | 'asistent';
  tekst: string;
  citati?: Citat[];
  sigurnost?: string;
}

const VIDLJIVIH_PRIJEDLOGA = 3;

const SIGURNOST_OZNAKA: Record<string, string> = {
  visoka: 'Pokriće u priručniku: visoko',
  srednja: 'Pokriće u priručniku: srednje',
  niska: 'Pokriće u priručniku: nisko — provjerite navedene stranice',
};

export default function AiChat({
  lekcijaId,
  naslovLekcije,
  poglavljeBroj,
  predlozenaPitanja = [],
}: {
  lekcijaId?: string;
  naslovLekcije?: string;
  poglavljeBroj?: number;
  predlozenaPitanja?: string[];
}) {
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const [upit, setUpit] = useState('');
  const [ucitava, setUcitava] = useState(false);
  const [dopunski, setDopunski] = useState(false);
  const [iskoristena, setIskoristena] = useState<Set<number>>(new Set());

  // Red čekanja: iskorišteni prijedlog nestaje, a sljedeći neiskorišteni ulazi na njegovo mjesto.
  const vidljiviPrijedlozi = predlozenaPitanja
    .map((tekst, i) => ({ tekst, i }))
    .filter((p) => !iskoristena.has(p.i))
    .slice(0, VIDLJIVIH_PRIJEDLOGA);

  async function posaljiPitanje(pitanje: string) {
    if (!pitanje || ucitava) return;
    setPoruke((p) => [...p, { autor: 'student', tekst: pitanje }]);
    setUcitava(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitanje, lekcijaId, naslovLekcije, ukljuciDopunske: dopunski }),
      });
      const data = await res.json();

      if (data.tip === 'nedovoljno_konteksta') {
        const prijedlozi = data.predlozene_lekcije?.length
          ? `\n\n**Možda tražite u:** ${data.predlozene_lekcije.join(' · ')}`
          : '';
        setPoruke((p) => [...p, { autor: 'asistent', tekst: `${data.poruka}${prijedlozi}` }]);
      } else if (data.greska) {
        setPoruke((p) => [...p, { autor: 'asistent', tekst: data.greska }]);
      } else {
        setPoruke((p) => [
          ...p,
          {
            autor: 'asistent',
            tekst: data.odgovor + (data.kratko_objasnjenje ? `\n\n_${data.kratko_objasnjenje}_` : ''),
            citati: data.citati,
            sigurnost: data.sigurnost_konteksta,
          },
        ]);
      }
    } catch {
      setPoruke((p) => [
        ...p,
        { autor: 'asistent', tekst: 'Došlo je do pogreške pri dohvatu odgovora. Pokušajte ponovno.' },
      ]);
    } finally {
      setUcitava(false);
    }
  }

  function posalji(e: React.FormEvent) {
    e.preventDefault();
    const pitanje = upit.trim();
    if (!pitanje) return;
    setUpit('');
    void posaljiPitanje(pitanje);
  }

  function klikNaPrijedlog(indeks: number, tekst: string) {
    setIskoristena((s) => new Set(s).add(indeks));
    void posaljiPitanje(tekst);
  }

  return (
    <div className="ai-chat">
      <div className="chat-zaglavlje">
        <h3>🤖 AI asistent</h3>
        {poglavljeBroj && <span className="chat-poglavlje">{poglavljeBroj}. poglavlje</span>}
      </div>

      {/* Opći chat (izvan lekcije) uvijek nosi kratak disclaimer. */}
      {!lekcijaId && <p className="chat-disclaimer">Odgovaram samo prema udžbeniku.</p>}

      <div className="chat-poruke">
        {poruke.length === 0 && (
          <div className="chat-dobrodoslica">
            <p>
              Tema: <strong>{naslovLekcije ?? 'cijeli priručnik'}</strong>. Pitajte me bilo što —
              odgovaram isključivo prema priručniku i uz svaki odgovor navodim stranicu.
            </p>
          </div>
        )}
        {poruke.map((p, i) => (
          <div key={i} className={`chat-poruka chat-${p.autor}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.tekst}</ReactMarkdown>
            {p.citati && p.citati.length > 0 && (
              <ul className="chat-citati">
                {p.citati.map((c, j) => (
                  <li key={j} className={c.izvor === 'dopunski' ? 'citat-dopunski' : undefined}>
                    {c.poglavlje}, str. {c.stranice}
                  </li>
                ))}
              </ul>
            )}
            {p.sigurnost && SIGURNOST_OZNAKA[p.sigurnost] && (
              <p className={`chat-sigurnost sigurnost-${p.sigurnost}`}>{SIGURNOST_OZNAKA[p.sigurnost]}</p>
            )}
          </div>
        ))}
        {ucitava && <div className="chat-poruka chat-asistent chat-ucitava">…</div>}
      </div>

      {vidljiviPrijedlozi.length > 0 && (
        <div className="chat-prijedlozi">
          {vidljiviPrijedlozi.map((p) => (
            <button
              key={p.i}
              type="button"
              className="chat-prijedlog"
              onClick={() => klikNaPrijedlog(p.i, p.tekst)}
              disabled={ucitava}
            >
              {p.tekst}
            </button>
          ))}
        </div>
      )}

      <label className="chat-dopunski">
        <input type="checkbox" checked={dopunski} onChange={(e) => setDopunski(e.target.checked)} />
        Uključi dopunske izvore (uz priručnik)
      </label>

      <form className="chat-forma" onSubmit={posalji}>
        <input
          value={upit}
          onChange={(e) => setUpit(e.target.value)}
          placeholder={lekcijaId ? 'Postavite pitanje o ovoj lekciji…' : 'Postavite pitanje o gradivu…'}
          disabled={ucitava}
        />
        <button type="submit" className="chat-posalji" aria-label="Pošalji" disabled={ucitava || !upit.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}
