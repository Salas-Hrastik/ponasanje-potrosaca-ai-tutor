'use client';

import { useState } from 'react';
import Modal from './Modal';

/**
 * Aktivnost koja se ne nameće nego se pokreće: u stupcu stoji uvodna kartica s
 * gumbom, a sam rad (kviz, provjera) odvija se u skočnom prozoru, gdje ima
 * mjesta za pitanje, odgovore i obrazloženje.
 *
 * Prozor se nakon pokretanja NE odspaja iz stabla, samo skriva — zatvaranje
 * usred kviza time ne poništava odgovore, nego se rad nastavlja gdje je stao.
 */
export default function ProzorAktivnosti({
  znak,
  naslov,
  opis,
  gumbPokreni,
  gumbNastavi,
  stanjeMirno = 'Provjera nije pokrenuta',
  stanjeUTijeku = 'Provjera je u tijeku',
  naslovProzora,
  podnaslovProzora,
  klasaProzora,
  children,
}: {
  znak: string;
  naslov: string;
  opis: string;
  gumbPokreni: string;
  gumbNastavi: string;
  stanjeMirno?: string;
  stanjeUTijeku?: string;
  naslovProzora: string;
  podnaslovProzora?: string;
  klasaProzora?: string;
  children: React.ReactNode;
}) {
  const [pokrenuto, setPokrenuto] = useState(false);
  const [otvoren, setOtvoren] = useState(false);

  return (
    <div className="aktivnost-pocetak">
      <span className="aktivnost-znak" aria-hidden="true">
        {znak}
      </span>
      <h4 className="aktivnost-naslov">{naslov}</h4>
      <p className="aktivnost-stanje">{pokrenuto ? stanjeUTijeku : stanjeMirno}</p>
      <p className="aktivnost-opis">{opis}</p>
      <button
        className="gumb-pilula"
        onClick={() => {
          setPokrenuto(true);
          setOtvoren(true);
        }}
      >
        {pokrenuto ? gumbNastavi : gumbPokreni}
      </button>

      {pokrenuto && (
        <Modal
          naslov={naslovProzora}
          podnaslov={podnaslovProzora}
          onClose={() => setOtvoren(false)}
          klasa={klasaProzora}
          skriven={!otvoren}
        >
          {children}
        </Modal>
      )}
    </div>
  );
}
