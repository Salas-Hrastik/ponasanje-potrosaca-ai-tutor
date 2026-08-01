'use client';

import { useEffect, useRef } from 'react';

/**
 * Skočni prikaz videa i prezentacije.
 *
 * Ugrađeni prikaz unutar stupca bio je pretijesan za čitanje slajdova, pa se
 * medij otvara preko gotovo cijelog zaslona. Uz prezentaciju ide i tumačenje
 * slajdova: Office preglednik radi u iframeu i ne javlja koji je slajd otvoren,
 * pa se tumačenja prikazuju kao numerirani popis uz prikaz, a ne sinkronizirano.
 */

interface Slajd {
  broj: number;
  naslov: string;
  tumacenje: string;
}

export default function MedijModal({
  tip,
  naslov,
  url,
  slajdovi = [],
  onZatvori,
}: {
  tip: 'video' | 'audio' | 'prezentacija';
  naslov: string;
  url: string;
  slajdovi?: Slajd[];
  onZatvori: () => void;
}) {
  const okvirRef = useRef<HTMLDivElement | null>(null);

  // Escape zatvara, a pozadina se ne smije pomicati dok je prozor otvoren.
  useEffect(() => {
    const naTipku = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onZatvori();
    };
    document.addEventListener('keydown', naTipku);
    const prijasnji = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    okvirRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', naTipku);
      document.body.style.overflow = prijasnji;
    };
  }, [onZatvori]);

  const imaTumacenja = tip === 'prezentacija' && slajdovi.length > 0;

  return (
    <div className="medij-preklop" onClick={onZatvori} role="presentation">
      <div
        className={`medij-modal ${imaTumacenja ? 'medij-modal-sa-tumacenjima' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={naslov}
        tabIndex={-1}
        ref={okvirRef}
      >
        <div className="medij-modal-traka">
          <h3>{naslov}</h3>
          <div className="medij-modal-akcije">
            <a href={url} target="_blank" rel="noreferrer" className="medij-modal-veza">
              Otvori u novoj kartici ↗
            </a>
            <button className="medij-modal-zatvori" onClick={onZatvori} aria-label="Zatvori">
              ✕
            </button>
          </div>
        </div>

        <div className="medij-modal-tijelo">
          <div className="medij-modal-prikaz">
            {tip === 'video' && <video src={url} controls autoPlay className="medij-modal-video" />}
            {tip === 'audio' && <audio src={url} controls autoPlay className="medij-modal-audio" />}
            {tip === 'prezentacija' && (
              <iframe
                className="medij-modal-iframe"
                src={
                  url.endsWith('.pdf')
                    ? url
                    : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
                }
                title={naslov}
                allowFullScreen
              />
            )}
          </div>

          {imaTumacenja && (
            <aside className="medij-tumacenja">
              <p className="medij-tumacenja-naslov">Tumačenje slajdova</p>
              <p className="medij-tumacenja-napomena">
                Popis prati redoslijed slajdova u prezentaciji.
              </p>
              <ol className="medij-tumacenja-popis">
                {slajdovi.map((s) => (
                  <li key={s.broj}>
                    <span className="slajd-broj">Slajd {s.broj}</span>
                    <span className="slajd-naslov">{s.naslov}</span>
                    <span className="slajd-tumacenje">{s.tumacenje}</span>
                  </li>
                ))}
              </ol>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
