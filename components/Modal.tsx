'use client';

import { useEffect } from 'react';

/**
 * Jedinstveni modal za cijelu aplikaciju (mediji, sažetak, vodič).
 * Uvijek lako zatvoriv: tipkom Esc, klikom na pozadinu i gumbom ✕.
 */
export default function Modal({
  naslov,
  podnaslov,
  onClose,
  children,
  klasa = '',
}: {
  naslov: string;
  podnaslov?: string;
  onClose: () => void;
  children: React.ReactNode;
  klasa?: string;
}) {
  useEffect(() => {
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
  }, [onClose]);

  return (
    <div className="modal-pozadina" onClick={onClose} role="presentation">
      <div
        className={`modal-sadrzaj ${klasa}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={naslov}
      >
        <button className="modal-zatvori" onClick={onClose} aria-label="Zatvori">
          ✕
        </button>
        <h3 className="modal-naslov">{naslov}</h3>
        {podnaslov && <p className="modal-podnaslov">{podnaslov}</p>}
        <div className="modal-tijelo">{children}</div>
      </div>
    </div>
  );
}
