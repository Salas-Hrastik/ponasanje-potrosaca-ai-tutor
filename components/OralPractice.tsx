'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TtsGumb from './TtsGumb';
import Modal from './Modal';

interface Citat {
  poglavlje: string;
  stranice: string;
}

interface Pitanje {
  tip?: string;
  pitanje?: string;
  kljucne_tocke?: string[];
  citati?: Citat[];
  opseg?: string;
  poruka?: string;
}

interface Povratna {
  tip: string;
  procjena?: string;
  tocno?: string[];
  nedostaje?: string[];
  pogresno?: string[];
  savjeti?: string[];
  idealni_odgovor?: string;
  citati?: Citat[];
  rubrika?: { tocnost: number; pokrivenost: number; terminologija: number; jasnoca: number };
  poruka?: string;
}

type Faza = 'pocetak' | 'ucitavanje' | 'odgovaranje' | 'povratna';

const PROCJENA_KLASA: Record<string, string> = {
  'uglavnom točno': 'procjena-dobro',
  djelomično: 'procjena-djelomicno',
  netočno: 'procjena-lose',
};

export default function OralPractice({
  poglavljeBroj,
  naslovOpsega,
}: {
  poglavljeBroj: number;
  naslovOpsega?: string;
}) {
  const [faza, setFaza] = useState<Faza>('pocetak');
  const [pitanje, setPitanje] = useState<Pitanje | null>(null);
  const [transkript, setTranskript] = useState('');
  const [potvrdjen, setPotvrdjen] = useState(false);
  const [povratna, setPovratna] = useState<Povratna | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [snima, setSnima] = useState(false);
  const [transkribira, setTranskribira] = useState(false);
  const [ocjenjuje, setOcjenjuje] = useState(false);
  // Sama provjera odvija se u skočnom prozoru; u stupcu ostaje uvodna kartica.
  // Prozor se pri zatvaranju samo skriva, pa se pitanje i povratna informacija
  // ne gube — student nastavlja gdje je stao.
  const [otvoren, setOtvoren] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const dijeloviRef = useRef<Blob[]>([]);

  // Mikrofon se otpušta i kad korisnik napusti stranicu usred snimanja.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const pokreni = useCallback(async () => {
    setOtvoren(true);
    setGreska(null);
    setPovratna(null);
    setTranskript('');
    setPotvrdjen(false);
    setFaza('ucitavanje');
    try {
      const res = await fetch(`/api/usmena-vjezba/pitanje?poglavljeBroj=${poglavljeBroj}`);
      const data: Pitanje = await res.json();
      setPitanje(data);
      setFaza(data.pitanje ? 'odgovaranje' : 'pocetak');
      if (!data.pitanje) setGreska(data.poruka ?? 'Pitanje nije moguće pripremiti.');
    } catch {
      setGreska('Nije moguće dohvatiti pitanje. Pokušajte ponovno.');
      setFaza('pocetak');
    }
  }, [poglavljeBroj]);

  async function pocniSnimanje() {
    setGreska(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      dijeloviRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) dijeloviRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(dijeloviRef.current, { type: rec.mimeType || 'audio/webm' });
        await transkribiraj(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setSnima(true);
    } catch {
      setGreska(
        'Pristup mikrofonu nije odobren. Odgovor možete i upisati — postupak provjere je isti.',
      );
    }
  }

  function zaustaviSnimanje() {
    recorderRef.current?.stop();
    setSnima(false);
  }

  /** Snimka putuje izravno na transkripciju i nigdje se ne pohranjuje. */
  async function transkribiraj(blob: Blob) {
    setTranskribira(true);
    try {
      const forma = new FormData();
      forma.append('audio', blob, 'odgovor.webm');
      const res = await fetch('/api/transkript', { method: 'POST', body: forma });
      const data = await res.json();
      if (data.transkript) {
        setTranskript(data.transkript);
        setPotvrdjen(false);
      } else {
        setGreska(data.greska ?? 'Transkripcija nije uspjela.');
      }
    } catch {
      setGreska('Transkripcija nije uspjela. Odgovor možete upisati ručno.');
    } finally {
      setTranskribira(false);
    }
  }

  async function posaljiNaProvjeru() {
    if (!pitanje?.pitanje) return;
    setOcjenjuje(true);
    setGreska(null);
    try {
      const res = await fetch('/api/usmena-vjezba/ocijeni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poglavljeBroj, pitanje: pitanje.pitanje, transkript }),
      });
      const data: Povratna = await res.json();
      setPovratna(data);
      setFaza('povratna');
    } catch {
      setGreska('Povratnu informaciju nije bilo moguće dohvatiti. Pokušajte ponovno.');
    } finally {
      setOcjenjuje(false);
    }
  }

  const uTijeku = faza !== 'pocetak';

  const tijek = (
    <>
      {greska && <p className="usmena-greska">{greska}</p>}

      {faza === 'ucitavanje' && <p className="usmena-cekanje">Pripremam pitanje iz priručnika…</p>}

      {(faza === 'odgovaranje' || faza === 'povratna') && pitanje?.pitanje && (
        <div className="usmena-pitanje-blok">
          <p className="usmena-pitanje">{pitanje.pitanje}</p>
          <TtsGumb tekst={pitanje.pitanje} oznaka="Pročitaj pitanje naglas" />
          {!!pitanje.citati?.length && (
            <ul className="chat-citati">
              {pitanje.citati.map((c, i) => (
                <li key={i}>
                  {c.poglavlje}, str. {c.stranice}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {faza === 'odgovaranje' && (
        <div className="usmena-odgovor">
          <div className="usmena-snimanje">
            {!snima ? (
              <button className="gumb-snimi" onClick={pocniSnimanje} disabled={transkribira}>
                🎤 Snimi odgovor
              </button>
            ) : (
              <button className="gumb-snimi gumb-snima" onClick={zaustaviSnimanje}>
                ⏹ Zaustavi snimanje
              </button>
            )}
            {transkribira && <span className="usmena-cekanje">Transkribiram…</span>}
            <span className="usmena-privatnost-mala">Snimka se ne pohranjuje.</span>
          </div>

          <label className="usmena-label">
            Transkript (provjerite i po potrebi ispravite prije slanja)
            <textarea
              value={transkript}
              onChange={(e) => {
                setTranskript(e.target.value);
                setPotvrdjen(false);
              }}
              rows={6}
              placeholder="Odgovorite glasom ili upišite odgovor ovdje…"
            />
          </label>

          {!potvrdjen ? (
            <button
              className="gumb-sekundarni"
              disabled={!transkript.trim()}
              onClick={() => setPotvrdjen(true)}
            >
              Potvrdi transkript
            </button>
          ) : (
            <button className="gumb-primarni" disabled={ocjenjuje} onClick={posaljiNaProvjeru}>
              {ocjenjuje ? 'Pripremam povratnu informaciju…' : 'Pošalji na povratnu informaciju'}
            </button>
          )}

          {!!pitanje?.kljucne_tocke?.length && (
            <details className="usmena-natuknice">
              <summary>Prikaži što bi odgovor trebao pokriti (pogledajte tek nakon pokušaja)</summary>
              <ul>
                {pitanje.kljucne_tocke.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {faza === 'povratna' && povratna && (
        <div className="usmena-povratna">
          {povratna.tip === 'nedovoljno_konteksta' ? (
            <p>{povratna.poruka}</p>
          ) : (
            <>
              <p className={`usmena-procjena ${PROCJENA_KLASA[povratna.procjena ?? ''] ?? ''}`}>
                Procjena: <strong>{povratna.procjena}</strong>
              </p>

              {povratna.rubrika && (
                <ul className="usmena-rubrika">
                  <li>
                    Točnost pojmova <span>{povratna.rubrika.tocnost}/2</span>
                  </li>
                  <li>
                    Pokrivenost <span>{povratna.rubrika.pokrivenost}/2</span>
                  </li>
                  <li>
                    Terminologija <span>{povratna.rubrika.terminologija}/2</span>
                  </li>
                  <li>
                    Jasnoća izlaganja <span>{povratna.rubrika.jasnoca}/2</span>
                  </li>
                </ul>
              )}

              {!!povratna.tocno?.length && (
                <Blok naslov="✓ Dobro ste naveli" stavke={povratna.tocno} klasa="blok-tocno" />
              )}
              {!!povratna.nedostaje?.length && (
                <Blok naslov="◻ Nedostaje" stavke={povratna.nedostaje} klasa="blok-nedostaje" />
              )}
              {!!povratna.pogresno?.length && (
                <Blok naslov="✗ Netočno" stavke={povratna.pogresno} klasa="blok-pogresno" />
              )}
              {!!povratna.savjeti?.length && (
                <Blok naslov="💡 Savjeti" stavke={povratna.savjeti} klasa="blok-savjeti" />
              )}

              {povratna.idealni_odgovor && (
                <div className="usmena-idealni">
                  <h4>Idealan sažeti odgovor</h4>
                  <p>{povratna.idealni_odgovor}</p>
                  <TtsGumb tekst={povratna.idealni_odgovor} oznaka="Pročitaj naglas" />
                </div>
              )}

              {!!povratna.citati?.length && (
                <ul className="chat-citati">
                  {povratna.citati.map((c, i) => (
                    <li key={i}>
                      {c.poglavlje}, str. {c.stranice}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button className="gumb-sekundarni" onClick={pokreni}>
            Novo pitanje
          </button>
        </div>
      )}
    </>
  );

  return (
    <section className="usmena-vjezba kartica">
      <div className="usmena-zaglavlje">
        <h3>🎙️ Usmena vježba</h3>
      </div>
      {naslovOpsega && <p className="usmena-opseg">Opseg: {naslovOpsega}</p>}

      <div className="aktivnost-pocetak">
        <span className="aktivnost-znak" aria-hidden="true">
          🎙️
        </span>
        <h4 className="aktivnost-naslov">Razgovaraj o sadržaju poglavlja</h4>
        <p className="aktivnost-stanje">
          {uTijeku ? 'Provjera je u tijeku' : 'Glasovni razgovor nije pokrenut'}
        </p>
        <p className="aktivnost-opis">
          Asistent postavlja pitanje iz priručnika. Odgovorite glasom ili upišite odgovor — snimka
          se nigdje ne pohranjuje.
        </p>
        <button className="gumb-pilula" onClick={uTijeku ? () => setOtvoren(true) : pokreni}>
          {uTijeku ? 'Nastavi provjeru' : 'Pokreni glasovni razgovor'}
        </button>
        {!uTijeku && greska && <p className="usmena-greska">{greska}</p>}
      </div>

      {uTijeku && (
        <Modal
          naslov="Usmena provjera"
          podnaslov="Vježba bez službenog ocjenjivanja — snimka se ne pohranjuje"
          onClose={() => setOtvoren(false)}
          klasa="modal-usmena"
          skriven={!otvoren}
        >
          {tijek}
        </Modal>
      )}
    </section>
  );
}

function Blok({ naslov, stavke, klasa }: { naslov: string; stavke: string[]; klasa: string }) {
  return (
    <div className={`usmena-blok ${klasa}`}>
      <h4>{naslov}</h4>
      <ul>
        {stavke.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
