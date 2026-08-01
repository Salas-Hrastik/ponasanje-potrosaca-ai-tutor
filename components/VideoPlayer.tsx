'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Video s UVIJEK VIDLJIVOM upravljačkom trakom.
 *
 * Ugrađene kontrole preglednika same se skrivaju tijekom reprodukcije, pa
 * student nije vidio dokle je stigao ni kako preskočiti dio. Ova traka stalno
 * stoji ispod slike: zaustavljanje i nastavak, proteklo i ukupno vrijeme te
 * klizna skala za preskakanje.
 */
export default function VideoPlayer({ url, naslov }: { url: string; naslov?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [svira, setSvira] = useState(false);
  const [vrijeme, setVrijeme] = useState(0);
  const [trajanje, setTrajanje] = useState(0);
  const [glasnoca, setGlasnoca] = useState(1);

  const prebaci = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  // Razmaknica i strelice rade i kad fokus nije na samom videu.
  useEffect(() => {
    const naTipku = (e: KeyboardEvent) => {
      const meta = (e.target as HTMLElement)?.tagName;
      if (meta === 'INPUT' || meta === 'TEXTAREA') return;
      const v = videoRef.current;
      if (!v) return;
      if (e.code === 'Space') {
        e.preventDefault();
        prebaci();
      }
      if (e.key === 'ArrowRight') v.currentTime = Math.min(v.duration, v.currentTime + 10);
      if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 10);
    };
    document.addEventListener('keydown', naTipku);
    return () => document.removeEventListener('keydown', naTipku);
  }, [prebaci]);

  function preskoci(na: number) {
    const v = videoRef.current;
    if (v) v.currentTime = na;
    setVrijeme(na);
  }

  // Dok trajanje nije poznato, klizna skala nema smisla — ne nudi se.
  const poznato = Number.isFinite(trajanje) && trajanje > 0;
  const napredak = poznato ? (vrijeme / trajanje) * 100 : 0;

  return (
    <div className="video-player">
      <div className="video-okvir">
        <video
          ref={videoRef}
          src={url}
          className="video-slika"
          title={naslov}
          onClick={prebaci}
          onPlay={() => setSvira(true)}
          onPause={() => setSvira(false)}
          onTimeUpdate={(e) => setVrijeme(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setTrajanje(e.currentTarget.duration)}
          /* Kod nekih zapisa trajanje stigne tek nakon metapodataka. */
          onDurationChange={(e) => setTrajanje(e.currentTarget.duration)}
          onEnded={() => setSvira(false)}
        />
      </div>

      <div className="video-traka">
        <button
          className="video-gumb video-gumb-glavni"
          onClick={prebaci}
          aria-label={svira ? 'Zaustavi' : 'Pokreni'}
          title={svira ? 'Zaustavi (razmaknica)' : 'Pokreni (razmaknica)'}
        >
          {svira ? '❚❚' : '▶'}
        </button>

        <button
          className="video-gumb video-gumb-skok"
          onClick={() => preskoci(Math.max(0, vrijeme - 10))}
          aria-label="Natrag 10 sekundi"
          title="Natrag 10 s (strelica lijevo)"
        >
          −10 s
        </button>
        <button
          className="video-gumb video-gumb-skok"
          onClick={() => preskoci(Math.min(trajanje, vrijeme + 10))}
          aria-label="Naprijed 10 sekundi"
          title="Naprijed 10 s (strelica desno)"
        >
          +10 s
        </button>

        <span className="video-vrijeme">{mmss(vrijeme)}</span>

        <input
          type="range"
          className="video-skala"
          min={0}
          max={poznato ? trajanje : 1}
          step={0.1}
          value={vrijeme}
          disabled={!poznato}
          onChange={(e) => preskoci(Number(e.target.value))}
          style={{ ['--napredak' as string]: `${napredak}%` }}
          aria-label="Položaj u videu"
        />

        <span className="video-vrijeme video-vrijeme-ukupno">{poznato ? mmss(trajanje) : '—:—'}</span>

        <input
          type="range"
          className="video-glasnoca"
          min={0}
          max={1}
          step={0.05}
          value={glasnoca}
          onChange={(e) => {
            const g = Number(e.target.value);
            setGlasnoca(g);
            if (videoRef.current) videoRef.current.volume = g;
          }}
          aria-label="Glasnoća"
          title="Glasnoća"
        />
      </div>
    </div>
  );
}

function mmss(s: number): string {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sek = Math.floor(s % 60);
  return `${m}:${String(sek).padStart(2, '0')}`;
}
