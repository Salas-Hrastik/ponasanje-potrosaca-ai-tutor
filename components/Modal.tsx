'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Jedinstveni modal za cijelu aplikaciju (mediji, sažetak, vodič).
 * Uvijek lako zatvoriv: tipkom Esc, klikom na pozadinu i gumbom ✕.
 *
 * Prikazuje se kroz portal u <body>: sažetak se otvara iz podzaglavlja cjeline,
 * koje je ljepljivo i time tvori vlastiti kontekst slaganja — bez portala bi
 * modal ostao ispod ljepljivog izbornika načina rada, koji bi presretao klikove
 * na gumb za zatvaranje.
 */
export default function Modal({
  naslov,
  podnaslov,
  onClose,
  children,
  klasa = '',
  skriven = false,
}: {
  naslov: string;
  podnaslov?: string;
  onClose: () => void;
  children: React.ReactNode;
  klasa?: string;
  /**
   * Sakriva prozor, ali ga ostavlja u stablu — sadržaj (npr. tijek kviza ili
   * usmene provjere) time preživi zatvaranje i nastavlja se gdje je stao.
   */
  skriven?: boolean;
}) {
  // Portal traži DOM, kojega pri poslužiteljskom iscrtavanju nema.
  const [montiran, setMontiran] = useState(false);
  useEffect(() => setMontiran(true), []);

  useEffect(() => {
    if (skriven) return;
    const naTipku = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', naTipku);
    // Pozadina se ne smije pomicati dok je modal otvoren.
    const prethodni = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', naTipku);
      document.body.style.overflow = prethodni;
    };
  }, [onClose, skriven]);

  if (!montiran) return null;

  return createPortal(
    <div
      className={`modal-pozadina ${skriven ? 'modal-skriven' : ''}`}
      onClick={onClose}
      role="presentation"
      aria-hidden={skriven}
    >
      <div
        className={`modal-sadrzaj ${klasa}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={naslov}
      >
        {/* Zaglavlje stoji na mjestu, pomiče se samo tijelo — inače bi kod
            dužeg sadržaja gumb za zatvaranje otišao izvan vidnog polja. */}
        <div className="modal-zaglavlje">
          <div className="modal-zaglavlje-tekst">
            <h3 className="modal-naslov">{naslov}</h3>
            {podnaslov && <p className="modal-podnaslov">{podnaslov}</p>}
          </div>
          <button className="modal-zatvori" onClick={onClose} aria-label="Zatvori">
            ✕
          </button>
        </div>
        <div className="modal-tijelo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
