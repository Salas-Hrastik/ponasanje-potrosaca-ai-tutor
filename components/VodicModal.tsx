'use client';

import { useState } from 'react';
import Modal from './Modal';

interface Smjernica {
  naslov: string;
  tekst: string;
}

const SMJERNICE: Smjernica[] = [
  {
    naslov: 'Slijedite redoslijed lekcija',
    tekst:
      'Gradivo je razloženo pedagoški promišljeno — preskakanje lekcija često znači propuštanje pojmova bez kojih kasnije gradivo nije razumljivo.',
  },
  {
    naslov: 'Prvo pročitajte sažetak, tek onda pitajte',
    tekst:
      'AI asistent najbolje pomaže kao alat za produbljivanje razumijevanja, a ne kao zamjena za prvu obradu gradiva.',
  },
  {
    naslov: 'Postavljajte otvorena pitanja',
    tekst:
      'Umjesto „daj mi odgovor na pitanje X", pitajte „objasni zašto je tako", „daj primjer iz prakse", „poveži pojam Y s pojmom Z". Time se uči, a ne samo prepisuje.',
  },
  {
    naslov: 'Uvijek provjerite citat',
    tekst:
      'Asistent uz odgovor navodi poglavlje i stranicu priručnika. Vratite se na tu stranicu i pročitajte izvorni kontekst — to je najsigurniji način da odgovor zaista usvojite.',
  },
  {
    naslov: 'Koristite usmenu vježbu prije usmenog ispita',
    tekst:
      'Vježba je trening bez ocjenjivanja: postavlja pitanje, sluša vaš odgovor i pokazuje što nedostaje. Najviše koristi ako odgovarate naglas, a ne tipkanjem.',
  },
  {
    naslov: 'Sustav je dopuna, ne zamjena za nastavu',
    tekst:
      'Najbolje rezultate ostvaruju studenti koji asistenta koriste prije predavanja (kao pripremu) i poslije predavanja (kao ponavljanje), a ne umjesto predavanja.',
  },
  {
    naslov: 'Akademsko poštenje',
    tekst:
      'Koristite asistenta za razumijevanje i učenje. Ako pišete seminar ili završni rad, navedite da ste koristili AI alat (u skladu s pravilima Veleučilišta) i citirajte izvorni priručnik, ne AI odgovor.',
  },
  {
    naslov: 'Vodite računa o privatnosti',
    tekst:
      'Ne unosite u razgovor s asistentom osjetljive osobne podatke (svoje ni tuđe). Snimke usmene vježbe se ne pohranjuju — čuva se samo transkript.',
  },
  {
    naslov: 'Ako asistent ne odgovori dobro — pitajte nastavnika',
    tekst:
      'Asistent odgovara samo ono za što ima podlogu u priručniku i to će otvoreno reći. Složena pitanja i pitanja procjene rješavaju se u nastavi i na konzultacijama.',
  },
];

export default function VodicModal() {
  const [otvoren, setOtvoren] = useState(false);

  return (
    <>
      <button className="hero-gumb hero-gumb-obrub" onClick={() => setOtvoren(true)}>
        📘 Vodič za korisnike
      </button>

      {otvoren && (
        <Modal
          naslov="Vodič za korisnike"
          podnaslov="Kako iz asistenta izvući najviše — i gdje su njegove granice"
          onClose={() => setOtvoren(false)}
          klasa="vodic-modal"
        >
          <ol className="vodic-lista">
            {SMJERNICE.map((s, i) => (
              <li key={i}>
                <strong>{s.naslov}</strong>
                <p>{s.tekst}</p>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </>
  );
}
