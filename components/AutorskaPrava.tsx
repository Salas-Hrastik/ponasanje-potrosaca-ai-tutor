'use client';

/**
 * Gumb i skočni prozor s autorskopravnom obaviješću — fiksni gumb vidljiv na
 * svim stranicama (ugrađeno u app/layout.tsx), neovisno o proširenom prikazu
 * (ProsireniPrikaz sakriva zaglavlje, ali ne i ovaj gumb). Po uzoru na
 * CopyrightNotice komponentu na platformi marketing-ai-tutor-rijeka,
 * prilagođeno ovdje priručniku i autoru kolegija Ponašanje potrošača u
 * turizmu.
 */
import { useState } from 'react';
import { config } from '@/lib/config';
import Modal from './Modal';

export default function AutorskaPrava() {
  const [otvoren, setOtvoren] = useState(false);

  return (
    <>
      <button
        type="button"
        className="autorska-prava-gumb"
        onClick={() => setOtvoren(true)}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">©</span>
        <span className="autorska-prava-gumb-tekst">Nositelji prava</span>
      </button>

      {otvoren && (
        <Modal
          naslov="Nositelji prava"
          podnaslov="Autorska prava i uvjeti korištenja"
          onClose={() => setOtvoren(false)}
          klasa="autorska-prava-modal"
        >
          <p>Sadržaj i programsko rješenje ove platforme dva su odvojena autorska djela:</p>

          <ul>
            <li>
              <strong>Kanonski tekst</strong> — veleučilišni priručnik <em>{config.kolegij}</em>
              {config.autorPrirucnika && <>, autor {config.autorPrirucnika}</>}. Koristi se na
              platformi uz suglasnost nositelja prava.
            </li>
            <li>
              <strong>Programsko rješenje platforme</strong> — AI Eduka.
            </li>
          </ul>

          <h4>Osnova i opseg zaštite</h4>
          <p>
            Zaštita proizlazi iz Zakona o autorskom pravu i srodnim pravima (NN 111/21) i nastaje
            automatski, u trenutku stvaranja djela:
          </p>
          <ul>
            <li>kanonski tekst zaštićen je kao izvorno autorsko djelo (čl. 14. st. 1.);</li>
            <li>
              odabir i raspored građe — podjela na cjeline, odjeljke i kvizove te njihova veza s
              poglavljima i stranicama izvornika — zaštićeni su kao autorska zbirka, neovisno o
              pravima na pojedinim dijelovima (čl. 16.);
            </li>
            <li>programsko rješenje zaštićeno je kao računalni program (čl. 14. st. 2.).</li>
          </ul>
          <p>
            Moralna prava autora — pravo na priznanje autorstva i pravo na poštivanje cjelovitosti
            djela (čl. 28. i 29.) — neprenosiva su i pripadaju autoru trajno.
          </p>

          <h4>Što je dopušteno</h4>
          <p>
            Studentima i nastavnicima ustanove koja ima pristup platformi dopušta se čitanje, ispis
            i pohrana primjeraka za osobnu uporabu u učenju i nastavi, uz navođenje izvora.
            Citiranje u seminarskim, završnim i znanstvenim radovima dopušteno je uz uredno
            navođenje kanonskog izvora, njegova poglavlja i stranica.
          </p>

          <h4>Što nije dopušteno</h4>
          <p>Bez prethodnog pisanog odobrenja nositelja prava nije dopušteno:</p>
          <ul>
            <li>objavljivanje ili činjenje dostupnim javnosti cjeline ili znatnog dijela sadržaja;</li>
            <li>
              komercijalno korištenje, uključujući uvrštavanje u druge nastavne materijale, tečajeve
              ili proizvode;
            </li>
            <li>sustavno preuzimanje sadržaja automatiziranim sredstvima;</li>
            <li>
              korištenje sadržaja za treniranje, dotreniravanje ili evaluaciju sustava umjetne
              inteligencije;
            </li>
            <li>uklanjanje ili izmjena oznaka autorstva i autorskopravnih napomena.</li>
          </ul>

          <h4>Pridržaj prava na rudarenje teksta i podataka</h4>
          <p>
            <strong>
              Nositelji prava izričito pridržavaju pravo na umnožavanje sadržaja ove platforme u
              svrhu rudarenja teksta i podataka
            </strong>
            , u smislu članka 188. Zakona o autorskom pravu i srodnim pravima te članka 4. stavka 3.
            Direktive (EU) 2019/790.
          </p>
          <p>
            Pridržaj obuhvaća sav sadržaj platforme i izražen je strojno čitljivim sredstvima —
            datotekom <code>/.well-known/tdmrep.json</code>, HTTP zaglavljima, HTML metapodacima i
            datotekom <code>robots.txt</code>. Iznimka iz članka 187. ZASP-a, koja se odnosi na
            rudarenje za znanstveno istraživanje što ga provode znanstvene organizacije i ustanove
            kulturne baštine, ostaje netaknuta.
          </p>
          <p>
            Od 2. kolovoza 2025. članak 53. Uredbe (EU) 2024/1689 obvezuje davatelje modela umjetne
            inteligencije opće namjene da uspostave politiku poštivanja autorskog prava i da
            prepoznaju ovako izražene pridržaje.
          </p>

          <h4>Korištenje umjetne inteligencije</h4>
          <p>
            Platforma sadrži asistenta utemeljenog na umjetnoj inteligenciji koji odgovara
            isključivo na temelju sadržaja priručnika. Odgovori se generiraju automatski i mogu
            sadržavati pogreške; za ocjenjivanje i ispite mjerodavan je priručnik, a ne odgovor
            asistenta. Ova je obavijest dana sukladno članku 50. Uredbe (EU) 2024/1689.
          </p>

          <h4>Licenciranje i kontakt</h4>
          <p>
            Zahtjevi za korištenje izvan navedenih okvira, uključujući institucionalne licencije i
            prijevode, upućuju se na adresu navedenu u impresumu platforme.
          </p>

          <p className="autorska-prava-verzija">
            Verzija 1.0 · listopad 2026. · Mjerodavno je pravo Republike Hrvatske.
          </p>
        </Modal>
      )}
    </>
  );
}
