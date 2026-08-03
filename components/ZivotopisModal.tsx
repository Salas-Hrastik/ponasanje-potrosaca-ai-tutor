'use client';

import { useState } from 'react';
import Modal from './Modal';

/**
 * Životopis autora priručnika, u skočnom prozoru s naslovnice.
 *
 * Zašto prozor, a ne zasebna stranica: ime stoji uz naslov priručnika i čita
 * se usput — odlazak na drugu stranicu prekida dolazak na gradivo, a povratak
 * traži novi klik.
 */

const CINJENICE: { broj: string; opis: string }[] = [
  { broj: '90+', opis: 'znanstvenih i stručnih radova' },
  { broj: '9', opis: 'knjiga u uporabi kao udžbenici' },
  { broj: '2011.', opis: 'redoviti profesor u trajnom zvanju' },
];

const ODJELJCI: { naslov: string; odlomci: string[] }[] = [
  {
    naslov: 'Obrazovanje',
    odlomci: [
      'Obrazovni put započeo je u ugostiteljstvu: srednju Ugostiteljsku školu u Osijeku završio je 1973. godine kao KV kuhar, a 1975. stekao je zvanje VKV kuhara. Školovanje je nastavio na Višoj ekonomskoj školi „Dr. Mijo Mirković" u Puli, gdje je 1978. stekao zvanje ekonomista u turizmu i ugostiteljstvu.',
      'Akademski put nastavio je na Ekonomskom fakultetu u Osijeku, gdje je 1986. diplomirao i stekao zvanje diplomiranog ekonomista. Magistrirao je 1990. na poslijediplomskom znanstvenom studiju „Marketing u privrednoj organizaciji", a 1996. obranio je doktorsku disertaciju „Upravljanje marketingom u ugostiteljstvu".',
    ],
  },
  {
    naslov: 'Profesionalno iskustvo',
    odlomci: [
      'Karijeru je započeo 1973. godine, kada se zaposlio kao kuhar u Ugostiteljskoj školi u Osijeku. Od 1979. do 1993. radio je u istoj školi kao nastavnik stručnih predmeta, profesor ekonomske skupine predmeta i programer — iskustvo iz kojega je izrastao njegov način prenošenja znanja iz ugostiteljstva i gastronomije.',
      'Od 1993. do 1995. bio je član Županijskog poglavarstva i vijećnik Županijske skupštine, predsjednik Turističkog vijeća Osječko-baranjske županije te član Sabora Hrvatske turističke zajednice. Volonterski rad obuhvaćao je i članstvo u nadzornim odborima i upravnim vijećima.',
      'Od 1995. rad usmjerava na akademsku karijeru na Ekonomskom fakultetu u Osijeku, napredujući od asistenta do redovitog profesora u trajnom zvanju, koje je stekao 2011. godine. Predavao je niz predmeta iz marketinga, turizma i ugostiteljstva — među njima Marketing u turizmu i ugostiteljstvu te Poduzetništvo u turizmu — a kolegij E-marketing sam je utemeljio i razvio: najprije knjigom „Marketinške mogućnosti interneta", a poslije trima izdanjima knjige „E-marketing".',
    ],
  },
  {
    naslov: 'Znanstveni i stručni rad',
    odlomci: [
      'Autor je više od 90 znanstvenih i stručnih radova, znatnim dijelom posvećenih ugostiteljstvu te turizmu i marketingu u tim područjima. Napisao je devet knjiga koje se koriste kao udžbenici na više hrvatskih fakulteta. Znanstveni interes obuhvaća marketing u ugostiteljstvu i turizmu, e-marketing i primjenu suvremenih tehnologija u tim područjima.',
    ],
  },
  {
    naslov: 'Stručne aktivnosti i priznanja',
    odlomci: [
      'Uz akademski rad aktivno sudjeluje u razvoju turizma i ugostiteljstva u Hrvatskoj. Bio je član Turističkog vijeća Hrvatske turističke zajednice u dvama mandatima i predsjednik Turističkog vijeća Osječko-baranjske županije. Više od trideset godina član je najprije Sabora, a potom Skupštine Hrvatske turističke zajednice. Za svoj doprinos odlikovan je Spomenicom domovinske zahvalnosti.',
      'Danas svoje iskustvo unosi u razvoj veleučilišnoga preddiplomskog studija Menadžment u turizmu i ugostiteljstvu na Veleučilištu Baltazar Zaprešić, a član je i Znanstvenog vijeća za turizam i prostor Hrvatske akademije znanosti i umjetnosti.',
    ],
  },
];

export default function ZivotopisModal({ ime }: { ime: string }) {
  const [otvoren, setOtvoren] = useState(false);

  return (
    <>
      <button className="hero-autor-gumb" onClick={() => setOtvoren(true)}>
        {ime}
      </button>

      {otvoren && (
        <Modal
          naslov={ime}
          podnaslov="Autor priručnika · životopis"
          onClose={() => setOtvoren(false)}
          klasa="zivotopis-modal"
        >
          <p className="zivotopis-uvod">Drago Ružić rođen je 17. rujna 1955. godine u Valpovu.</p>

          <ul className="zivotopis-cinjenice">
            {CINJENICE.map((c) => (
              <li key={c.opis}>
                <strong>{c.broj}</strong>
                <span>{c.opis}</span>
              </li>
            ))}
          </ul>

          {ODJELJCI.map((o) => (
            <section key={o.naslov} className="zivotopis-odjeljak">
              <h4>{o.naslov}</h4>
              {o.odlomci.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </section>
          ))}
        </Modal>
      )}
    </>
  );
}
