'use client';

import { useState } from 'react';
import Modal from './Modal';

interface Medij {
  id: string;
  tip: 'video' | 'audio' | 'prezentacija';
  naslov: string;
  url: string;
  trajanje_s?: number | null;
}

function mmss(sekunde: number): string {
  const m = Math.floor(sekunde / 60);
  const s = sekunde % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const OZNAKE: Record<Medij['tip'], { ikona: string; naslov: string }> = {
  video: { ikona: '🎬', naslov: 'Video' },
  audio: { ikona: '🎧', naslov: 'Audio klip' },
  prezentacija: { ikona: '📊', naslov: 'Prezentacija' },
};

export default function MediaModal({ mediji }: { mediji: Medij[] }) {
  const [otvoren, setOtvoren] = useState<Medij | null>(null);

  if (mediji.length === 0) return null;

  const av = mediji.filter((m) => m.tip !== 'prezentacija');
  const prezentacije = mediji.filter((m) => m.tip === 'prezentacija');

  const kartica = (m: Medij) => (
    <button key={m.id} className="medij-kartica" onClick={() => setOtvoren(m)}>
      <span className="medij-ikona">{OZNAKE[m.tip].ikona}</span>
      <span className="medij-tekst">
        <span className="medij-naslov">{m.naslov || OZNAKE[m.tip].naslov}</span>
        <span className="medij-podnaslov">
          {m.tip === 'prezentacija' ? 'Otvori prezentaciju' : m.trajanje_s ? mmss(m.trajanje_s) : ''}
        </span>
      </span>
      <span className="medij-strelica">→</span>
    </button>
  );

  return (
    <div className="mediji-blok">
      {av.length > 0 && <div className="mediji-mreza">{av.map(kartica)}</div>}
      {prezentacije.map(kartica)}

      {otvoren && (
        <Modal
          naslov={otvoren.naslov || OZNAKE[otvoren.tip].naslov}
          onClose={() => setOtvoren(null)}
          klasa="modal-medij"
        >
          {otvoren.tip === 'video' && <video src={otvoren.url} controls autoPlay className="medij-player" />}
          {otvoren.tip === 'audio' && <audio src={otvoren.url} controls autoPlay className="medij-player" />}
          {otvoren.tip === 'prezentacija' && (
            <>
              <iframe
                className="prezentacija-okvir"
                // PDF se prikazuje izravno u pregledniku; PPTX preko Office Online
                // preglednika, jer preglednici PPTX ne prikazuju nativno.
                src={
                  otvoren.url.endsWith('.pdf')
                    ? otvoren.url
                    : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(otvoren.url)}`
                }
                title={otvoren.naslov || 'Prezentacija'}
                allowFullScreen
              />
              <a className="prezentacija-fallback" href={otvoren.url} target="_blank" rel="noreferrer">
                Otvori u novoj kartici →
              </a>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
