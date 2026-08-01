'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Skočni prikaz videa i prezentacije.
 *
 * Ugrađeni prikaz unutar stupca bio je pretijesan, pa se medij otvara preko
 * gotovo cijelog zaslona.
 *
 * Prezentacija se NE prikazuje Office preglednikom nego kao vlastiti preglednik
 * slajdova: slajdovi su slike izvučene iz .pptx datoteke, pa se svaki prikazuje
 * zajedno sa svojim tumačenjem. Office preglednik u iframeu ne javlja koji je
 * slajd otvoren, pa se uz njega tumačenje nije moglo vezati uz pravi slajd.
 */

interface Slajd {
  broj: number;
  naslov: string;
  tumacenje: string;
  slika?: string;
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
  const [indeks, setIndeks] = useState(0);

  const slike = slajdovi.filter((s) => s.slika);
  const kaoSlajdovi = tip === 'prezentacija' && slike.length > 0;
  const tekuci = slike[indeks];

  const idi = useCallback(
    (smjer: 1 | -1) => setIndeks((i) => Math.min(slike.length - 1, Math.max(0, i + smjer))),
    [slike.length],
  );

  // Escape zatvara, strelice listaju, a pozadina se ne pomiče dok je otvoreno.
  useEffect(() => {
    const naTipku = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onZatvori();
      if (!kaoSlajdovi) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') idi(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') idi(-1);
    };
    document.addEventListener('keydown', naTipku);
    const prijasnji = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    okvirRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', naTipku);
      document.body.style.overflow = prijasnji;
    };
  }, [onZatvori, idi, kaoSlajdovi]);

  return (
    <div className="medij-preklop" onClick={onZatvori} role="presentation">
      <div
        className={`medij-modal ${kaoSlajdovi ? 'medij-modal-slajdovi' : ''}`}
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
            {kaoSlajdovi && (
              <span className="medij-modal-brojac">
                Slajd {tekuci.broj} / {slike.length}
              </span>
            )}
            <a href={url} target="_blank" rel="noreferrer" className="medij-modal-veza">
              Preuzmi izvornik ↗
            </a>
            <button className="medij-modal-zatvori" onClick={onZatvori} aria-label="Zatvori">
              ✕
            </button>
          </div>
        </div>

        {kaoSlajdovi ? (
          <div className="slajd-prikaz">
            <div className="slajd-slika-okvir">
              <button
                className="slajd-strelica slajd-strelica-lijevo"
                onClick={() => idi(-1)}
                disabled={indeks === 0}
                aria-label="Prethodni slajd"
              >
                ‹
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tekuci.slika} alt={`Slajd ${tekuci.broj}: ${tekuci.naslov}`} className="slajd-slika" />
              <button
                className="slajd-strelica slajd-strelica-desno"
                onClick={() => idi(1)}
                disabled={indeks === slike.length - 1}
                aria-label="Sljedeći slajd"
              >
                ›
              </button>
            </div>

            <div className="slajd-tumacenje-okvir">
              <p className="slajd-tumacenje-oznaka">Tumačenje slajda {tekuci.broj}</p>
              <h4>{tekuci.naslov}</h4>
              <p className="slajd-tumacenje-tekst">{tekuci.tumacenje}</p>

              <div className="slajd-trake">
                {slike.map((s, i) => (
                  <button
                    key={s.broj}
                    className={`slajd-tracka ${i === indeks ? 'aktivna' : ''}`}
                    onClick={() => setIndeks(i)}
                    aria-label={`Slajd ${s.broj}`}
                    title={`${s.broj}. ${s.naslov}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
