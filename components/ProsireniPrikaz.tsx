'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Prošireni prikaz: sadržaj se razvuče preko cijelog zaslona, a alatna traka
 * (zaglavlje i podnožje) se skloni. Tipka Esc vraća traku, a prikaz ostaje
 * proširen.
 *
 * ZAŠTO ESC VRAĆA SAMO TRAKU, A NE IZLAZI SASVIM
 * Preglednik na Esc sam izlazi iz punog zaslona i taj se događaj ne može
 * presresti. Umjesto da se protiv toga borimo, izlazak iz punog zaslona
 * tumači se kao „vrati traku": stranica ostaje široka, a traka se pojavi.
 * Iz proširenog prikaza izlazi se gumbom u traci, koja je tada opet vidljiva.
 *
 * TKO IMA PREDNOST NA ESC
 * Modali (Modal.tsx, MedijModal.tsx) već slušaju Esc. Dok je modal otvoren,
 * Esc pripada njemu — ovaj ga rukovatelj ignorira, inače bi jedan pritisak
 * zatvorio modal i usput vratio traku.
 */

const KLJUC_POHRANE = 'prikaz-siroko';
const KLASA_SIROKO = 'prikaz-siroko';
const KLASA_BEZ_TRAKE = 'prikaz-bez-trake';

/** Je li otvoren modal koji već koristi Esc? */
function modalOtvoren() {
  return !!document.querySelector('.modal-pozadina:not(.modal-skriven)');
}

export default function ProsireniPrikaz() {
  const [montiran, setMontiran] = useState(false);
  const [siroko, setSiroko] = useState(false);
  const [trakaSkrivena, setTrakaSkrivena] = useState(false);

  /* Pri učitavanju se vraća samo širina, nikad skrivena traka. Korisnik koji
     je zatvorio karticu u proširenom prikazu inače bi se vratio na stranicu
     bez ijednog vidljivog gumba i bez naznake što se dogodilo. */
  useEffect(() => {
    setMontiran(true);
    try {
      if (localStorage.getItem(KLJUC_POHRANE) === 'da') setSiroko(true);
    } catch {
      /* privatni način rada ili blokirana pohrana — prikaz i dalje radi */
    }
  }, []);

  useEffect(() => {
    if (!montiran) return;
    const k = document.documentElement.classList;
    k.toggle(KLASA_SIROKO, siroko);
    k.toggle(KLASA_BEZ_TRAKE, siroko && trakaSkrivena);
    try {
      localStorage.setItem(KLJUC_POHRANE, siroko ? 'da' : 'ne');
    } catch {
      /* isto kao gore */
    }
  }, [montiran, siroko, trakaSkrivena]);

  const vratiTraku = useCallback(() => {
    setTrakaSkrivena(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const ukljuci = useCallback(async () => {
    setSiroko(true);
    setTrakaSkrivena(true);
    /* Puni zaslon je dodatak, ne uvjet: ako ga preglednik odbije (bez geste
       korisnika, iframe bez dopuštenja), prikaz i dalje zauzme cijeli prozor. */
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* nema punog zaslona — ostaje široki prikaz */
    }
  }, []);

  const iskljuci = useCallback(() => {
    setSiroko(false);
    setTrakaSkrivena(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  // Esc vraća traku; prikaz ostaje širok.
  useEffect(() => {
    if (!trakaSkrivena) return;
    const naTipku = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || modalOtvoren()) return;
      e.preventDefault();
      vratiTraku();
    };
    window.addEventListener('keydown', naTipku);
    return () => window.removeEventListener('keydown', naTipku);
  }, [trakaSkrivena, vratiTraku]);

  /* Izlazak iz punog zaslona (najčešće Esc, koji preglednik pojede prije nas)
     znači isto što i gornji rukovatelj: vrati traku, zadrži širinu. */
  useEffect(() => {
    const naPromjenu = () => {
      if (!document.fullscreenElement) setTrakaSkrivena(false);
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
        onClick={siroko ? iskljuci : ukljuci}
        aria-pressed={siroko}
        title={
          siroko
            ? 'Vrati uobičajenu širinu'
            : 'Proširi preko cijelog zaslona (Esc vraća alatnu traku)'
        }
      >
        <span aria-hidden="true">{siroko ? '⤡' : '⤢'}</span>
        <span className="gumb-prikaz-tekst">{siroko ? 'Uobičajeno' : 'Cijeli zaslon'}</span>
      </button>

      {/* Jedini vidljivi izlaz dok je traka skrivena. Bez njega bi miš ostao
          bez ijednog gumba, a i Esc treba negdje najaviti. */}
      {trakaSkrivena &&
        createPortal(
          <button type="button" className="prikaz-povratak" onClick={vratiTraku}>
            <kbd>Esc</kbd>
            <span>alatna traka</span>
          </button>,
          document.body,
        )}

      <span className="sr-samo" role="status" aria-live="polite">
        {siroko
          ? trakaSkrivena
            ? 'Prošireni prikaz, alatna traka skrivena. Esc vraća traku.'
            : 'Prošireni prikaz, alatna traka vidljiva.'
          : ''}
      </span>
    </>
  );
}
