'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Prošireni prikaz: sadržaj se razvuče preko cijelog zaslona, alatna traka
 * (zaglavlje i podnožje) se skloni, a preglednik se zamoli za puni zaslon.
 *
 * Esc vraća SVE na uobičajeno — širinu, traku i puni zaslon odjednom.
 * Zato postoji samo jedno stanje: prikaz je ili uobičajen ili proširen.
 *
 * ZAŠTO SE TO DOBRO SLAŽE S PREGLEDNIKOM
 * Preglednik na Esc sam izlazi iz punog zaslona i taj se događaj ne može
 * presresti. Budući da Esc ionako znači „vrati sve", izlazak iz punog zaslona
 * i naš izlazak iz proširenog prikaza sada su ista stvar — nema stanja u
 * kojem se njih dvoje razilaze.
 *
 * TKO IMA PREDNOST NA ESC
 * Modali (Modal.tsx, MedijModal.tsx) već slušaju Esc. Dok je modal otvoren,
 * Esc pripada njemu — inače bi jedan pritisak zatvorio modal i usput izašao
 * iz proširenog prikaza.
 */

const KLASA = 'prikaz-prosiren';

/** Je li otvoren modal koji već koristi Esc? */
function modalOtvoren() {
  return !!document.querySelector('.modal-pozadina:not(.modal-skriven)');
}

export default function ProsireniPrikaz() {
  const [montiran, setMontiran] = useState(false);
  const [prosireno, setProsireno] = useState(false);

  /* Stanje se NAMJERNO ne pamti između učitavanja: svako učitavanje počinje
     uobičajeno, pa natpis na gumbu uvijek odgovara onome što se vidi. */
  useEffect(() => setMontiran(true), []);

  useEffect(() => {
    if (!montiran) return;
    document.documentElement.classList.toggle(KLASA, prosireno);
  }, [montiran, prosireno]);

  const ukljuci = useCallback(async () => {
    setProsireno(true);
    /* Puni zaslon je dodatak, ne uvjet: ako ga preglednik odbije (bez geste
       korisnika, iframe bez dopuštenja), prikaz i dalje zauzme cijeli prozor. */
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* nema punog zaslona — ostaje široki prikaz bez trake */
    }
  }, []);

  const vrati = useCallback(() => {
    setProsireno(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Esc vraća sve na uobičajeno.
  useEffect(() => {
    if (!prosireno) return;
    const naTipku = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || modalOtvoren()) return;
      e.preventDefault();
      vrati();
    };
    window.addEventListener('keydown', naTipku);
    return () => window.removeEventListener('keydown', naTipku);
  }, [prosireno, vrati]);

  /* Izlazak iz punog zaslona (najčešće Esc, koji preglednik pojede prije nas,
     ali i F11 ili gumb u sučelju) znači isto: vrati sve na uobičajeno. */
  useEffect(() => {
    const naPromjenu = () => {
      if (!document.fullscreenElement) setProsireno(false);
    };
    document.addEventListener('fullscreenchange', naPromjenu);
    return () => document.removeEventListener('fullscreenchange', naPromjenu);
  }, []);

  if (!montiran) return null;

  return (
    <>
      <button
        type="button"
        className="gumb-prikaz"
        onClick={prosireno ? vrati : ukljuci}
        aria-pressed={prosireno}
        title={
          prosireno
            ? 'Smanji na uobičajeni prikaz'
            : 'Proširi preko cijelog zaslona (Esc vraća uobičajeni prikaz)'
        }
      >
        {/* Natpis imenuje RADNJU koju klik izvodi, ne stanje u kojem jesmo. */}
        <span aria-hidden="true">{prosireno ? '⤡' : '⤢'}</span>
        <span className="gumb-prikaz-tekst">{prosireno ? 'Smanji zaslon' : 'Cijeli zaslon'}</span>
      </button>

      {/* Dok je prikaz proširen, zaglavlje je skriveno pa gumb iznad nije
          vidljiv. Ova pilula preuzima njegovu ulogu: ona je jedini vidljivi
          izlaz za miša i mjesto gdje se najavljuje Esc. */}
      {prosireno &&
        createPortal(
          <button
            type="button"
            className="prikaz-povratak"
            onClick={vrati}
            title="Smanji na uobičajeni prikaz"
          >
            <kbd>Esc</kbd>
            <span>Smanji zaslon</span>
          </button>,
          document.body,
        )}

      <span className="sr-samo" role="status" aria-live="polite">
        {prosireno ? 'Prošireni prikaz preko cijelog zaslona. Esc vraća uobičajeni prikaz.' : ''}
      </span>
    </>
  );
}
