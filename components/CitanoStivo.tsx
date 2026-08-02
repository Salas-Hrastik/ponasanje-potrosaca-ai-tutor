'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Tekst koji se čita naglas REČENICU PO REČENICU, uz praćenje na zaslonu.
 *
 * Zašto ne jedan zahtjev za cijeli tekst: mjerenjem je utvrđeno da OpenAI počne
 * slati zvuk nakon ~1 s, ali cijelu datoteku za odlomak od 600 znakova preda
 * tek nakon 7–8 s. Čekanje na cijelu datoteku znači da student toliko gleda u
 * „Pripremam…". Ovako se traži zvuk prve rečenice (kratka, gotova za ~1 s),
 * pušta odmah, a sljedeća se dohvaća u pozadini dok prva svira.
 *
 * Uz to se dobiva ono čega prije nije bilo: pristup pojedinom dijelu teksta —
 * klik na rečenicu čita od nje, može se stati, nastaviti i preskakati.
 */

/** Dijeli tekst na rečenice; kratice („npr.", „str.") ne smiju biti granica. */
function naRecenice(tekst: string): string[] {
  const KRATICE = /(npr|tj|itd|str|god|sl|dr|prof|mr|sc|op|cca|tzv)\.$/i;
  const dijelovi: string[] = [];
  let tekuca = '';
  for (const komad of tekst.split(/(?<=[.!?…])\s+/)) {
    tekuca += (tekuca ? ' ' : '') + komad;
    if (!KRATICE.test(tekuca.trim())) {
      dijelovi.push(tekuca.trim());
      tekuca = '';
    }
  }
  if (tekuca.trim()) dijelovi.push(tekuca.trim());
  return dijelovi.filter(Boolean);
}

export default function CitanoStivo({
  tekst,
  klasa = '',
  oznaka = 'Pročitaj naglas',
}: {
  tekst: string;
  klasa?: string;
  oznaka?: string;
}) {
  const recenice = useMemo(() => naRecenice(tekst), [tekst]);
  const [indeks, setIndeks] = useState(-1);
  const [svira, setSvira] = useState(false);
  const [priprema, setPriprema] = useState(false);
  const [greska, setGreska] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const kesRef = useRef(new Map<number, string>());
  const indeksRef = useRef(-1);

  /** Zvuk jedne rečenice; jednom dohvaćen, ostaje za ponovno slušanje. */
  const dohvati = useCallback(
    async (i: number): Promise<string | null> => {
      const kes = kesRef.current;
      if (kes.has(i)) return kes.get(i)!;
      if (i < 0 || i >= recenice.length) return null;
      try {
        const res = await fetch('/api/govor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tekst: recenice[i] }),
        });
        if (!res.ok) return null;
        const url = URL.createObjectURL(await res.blob());
        kes.set(i, url);
        return url;
      } catch {
        return null;
      }
    },
    [recenice],
  );

  const zaustavi = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    indeksRef.current = -1;
    setIndeks(-1);
    setSvira(false);
    setPriprema(false);
  }, []);

  const pusti = useCallback(
    async (i: number) => {
      if (i >= recenice.length) {
        zaustavi();
        return;
      }
      audioRef.current?.pause();
      indeksRef.current = i;
      setIndeks(i);
      setGreska(false);
      setPriprema(true);

      const url = await dohvati(i);
      // Student je u međuvremenu stao ili skočio drugdje.
      if (indeksRef.current !== i) return;
      setPriprema(false);
      if (!url) {
        setGreska(true);
        setSvira(false);
        return;
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (indeksRef.current === i) void pusti(i + 1);
      };
      await audio.play().catch(() => setGreska(true));
      setSvira(true);

      // Sljedeća se priprema dok ova svira — zato se ne čeka na njezin zvuk.
      void dohvati(i + 1);
    },
    [dohvati, recenice.length, zaustavi],
  );

  function prebaci() {
    if (svira) {
      audioRef.current?.pause();
      setSvira(false);
      return;
    }
    if (indeks >= 0 && audioRef.current) {
      void audioRef.current.play();
      setSvira(true);
      return;
    }
    void pusti(indeks >= 0 ? indeks : 0);
  }

  /**
   * Prva se rečenica priprema čim se tekst pojavi, dok ga student čita očima.
   * Time klik na „Pročitaj" svira odmah, umjesto da se čeka ~3 s na sintezu.
   */
  useEffect(() => {
    if (recenice.length > 0) void dohvati(0);
  }, [dohvati, recenice.length]);

  // Zvuk se ne smije nastaviti nakon zatvaranja prozora ni curiti u memoriji.
  useEffect(() => {
    const kes = kesRef.current;
    return () => {
      audioRef.current?.pause();
      kes.forEach((u) => URL.revokeObjectURL(u));
      kes.clear();
    };
  }, []);

  const zauzet = priprema && !svira;

  return (
    <div className="citac">
      <div className="citac-traka">
        <button
          type="button"
          className="citac-gumb citac-gumb-glavni"
          onClick={prebaci}
          disabled={zauzet}
          title={svira ? 'Zaustavi' : oznaka}
        >
          {zauzet ? '⏳' : svira ? '❚❚' : '🔊'}
          <span className="citac-oznaka">
            {svira ? 'Pauza' : zauzet ? 'Pripremam…' : indeks >= 0 ? 'Nastavi' : oznaka}
          </span>
        </button>

        {indeks >= 0 && (
          <>
            <button
              type="button"
              className="citac-gumb"
              onClick={() => void pusti(Math.max(0, indeks - 1))}
              disabled={indeks === 0}
              title="Prethodna rečenica"
            >
              ‹
            </button>
            <span className="citac-brojac">
              {indeks + 1} / {recenice.length}
            </span>
            <button
              type="button"
              className="citac-gumb"
              onClick={() => void pusti(indeks + 1)}
              disabled={indeks >= recenice.length - 1}
              title="Sljedeća rečenica"
            >
              ›
            </button>
            <button type="button" className="citac-gumb" onClick={zaustavi} title="Prekini čitanje">
              ✕
            </button>
          </>
        )}

        {greska && <span className="citac-greska">Čitanje trenutačno nije dostupno.</span>}
      </div>

      {/* Klik na rečenicu čita od nje — student bira dio koji želi čuti. */}
      <p className={`citac-tekst ${klasa}`}>
        {recenice.map((r, i) => (
          <span
            key={i}
            role="button"
            tabIndex={0}
            className={`citac-recenica ${i === indeks ? 'aktivna' : ''}`}
            onClick={() => void pusti(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void pusti(i);
              }
            }}
            title="Pročitaj od ove rečenice"
          >
            {r}{' '}
          </span>
        ))}
      </p>
    </div>
  );
}
