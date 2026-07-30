'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Usmeni interaktivni razgovor o gradivu cjeline — VJEŽBA BEZ OCJENJIVANJA.
 *
 * Student govori, asistent odgovara glasom (odgovor se pušta automatski).
 * Uloge se mogu zamijeniti: tada asistent postavlja pitanja, a student
 * odgovara govorom — priprema za usmeni, bez bodova i rubrike.
 *
 * PRIVATNOST: snimka putuje samo do transkripcije i nigdje se ne pohranjuje;
 * u razgovoru ostaje isključivo prepoznati tekst.
 */

interface Poruka {
  autor: 'student' | 'asistent';
  tekst: string;
  /** Interna naredba (npr. preuzimanje uloge) — šalje se modelu, ne prikazuje se. */
  skriveno?: boolean;
}

const NAREDBA_ZAMJENE = 'Preuzmi ulogu ispitivača i postavi mi prvo pitanje o ovoj cjelini.';

type Uloga = 'asistent' | 'ispitivac';
type Faza = 'pocetak' | 'razgovor';

export default function UsmeniRazgovor({
  poglavljeBroj,
  naslovPoglavlja,
}: {
  poglavljeBroj?: number;
  naslovPoglavlja?: string;
}) {
  const [faza, setFaza] = useState<Faza>('pocetak');
  const [uloga, setUloga] = useState<Uloga>('asistent');
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const [snima, setSnima] = useState(false);
  const [obradjuje, setObradjuje] = useState<'' | 'transkribiram' | 'razmisljam' | 'govorim'>('');
  const [greska, setGreska] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const dijeloviRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tijekRef = useRef<HTMLDivElement | null>(null);

  // Mikrofon i reprodukcija se otpuštaju i kad korisnik napusti stranicu.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    [],
  );

  useEffect(() => {
    const el = tijekRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [poruke, obradjuje]);

  /** Pušta odgovor naglas; ako TTS zakaže, razgovor se nastavlja u tekstu. */
  const izgovori = useCallback(async (tekst: string) => {
    try {
      setObradjuje('govorim');
      const res = await fetch('/api/govor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tekst: ocistiZaGovor(tekst) }),
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
    } catch {
      // tišina: tekst odgovora je već vidljiv u tijeku razgovora
    } finally {
      setObradjuje('');
    }
  }, []);

  /** Šalje poruku asistentu i pušta njegov odgovor naglas. */
  const posalji = useCallback(
    async (tekst: string, ulogaZaPoziv: Uloga, skriveno = false) => {
      const povijest = poruke.slice(-6).map(({ autor, tekst: t }) => ({ autor, tekst: t }));
      setPoruke((p) => [...p, { autor: 'student', tekst, skriveno }]);
      setObradjuje('razmisljam');
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pitanje: tekst,
            poglavljeBroj,
            naslovPoglavlja,
            uloga: ulogaZaPoziv,
            povijest,
            usmeni: true,
          }),
        });
        const data = await res.json();
        const odgovor: string =
          data.odgovor || data.poruka || data.greska || 'Odgovor trenutačno nije dostupan.';
        setPoruke((p) => [...p, { autor: 'asistent', tekst: odgovor }]);
        await izgovori(odgovor);
      } catch {
        setGreska('Odgovor nije stigao. Pokušajte ponovno.');
        setObradjuje('');
      }
    },
    [poruke, poglavljeBroj, naslovPoglavlja, izgovori],
  );

  async function pocniSnimanje() {
    setGreska(null);
    audioRef.current?.pause();
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
        setObradjuje('transkribiram');
        try {
          const forma = new FormData();
          forma.append('audio', blob, 'izgovor.webm');
          const res = await fetch('/api/transkript', { method: 'POST', body: forma });
          const data = await res.json();
          if (data.transkript?.trim()) {
            await posalji(data.transkript.trim(), uloga);
          } else {
            setGreska('Nisam prepoznao govor. Pokušajte ponovno, malo bliže mikrofonu.');
            setObradjuje('');
          }
        } catch {
          setGreska('Prepoznavanje govora nije uspjelo. Pokušajte ponovno.');
          setObradjuje('');
        }
      };
      recorderRef.current = rec;
      rec.start();
      setSnima(true);
    } catch {
      setGreska('Pristup mikrofonu nije odobren. Provjerite dopuštenja preglednika.');
    }
  }

  function zaustaviSnimanje() {
    recorderRef.current?.stop();
    setSnima(false);
  }

  function pokreni() {
    setFaza('razgovor');
    setGreska(null);
  }

  /** Zamjena uloga: kad asistent preuzme ispitivanje, odmah postavlja pitanje. */
  function zamijeniUloge() {
    const nova: Uloga = uloga === 'asistent' ? 'ispitivac' : 'asistent';
    setUloga(nova);
    setGreska(null);
    if (nova === 'ispitivac') {
      void posalji(NAREDBA_ZAMJENE, 'ispitivac', true);
    }
  }

  const zauzet = obradjuje !== '';

  if (faza === 'pocetak') {
    return (
      <section className="usmeni-razgovor">
        <div className="usmena-pocetak">
          <span className="usmena-znak" aria-hidden="true">
            🎙️
          </span>
          <h4 className="usmena-pocetak-naslov">Razgovaraj o sadržaju poglavlja</h4>
          <p className="usmena-pocetak-stanje">Glasovni razgovor nije pokrenut</p>
          <p className="usmena-pocetak-opis">
            Govorite prirodno i pričekajte da asistent dovrši odgovor. Možete i zamijeniti uloge —
            tada asistent postavlja pitanja, a vi odgovarate. Vježba je bez ocjenjivanja, a snimka
            se nigdje ne pohranjuje.
          </p>
          <button className="gumb-pilula" onClick={pokreni}>
            Pokreni glasovni razgovor
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="usmeni-razgovor usmeni-razgovor-aktivan">
      <div className="usmeni-traka">
        <span className={`usmeni-uloga ${uloga === 'ispitivac' ? 'ispituje' : ''}`}>
          {uloga === 'asistent' ? '💬 Vi pitate, asistent odgovara' : '🎓 Asistent pita, vi odgovarate'}
        </span>
        <button type="button" className="usmeni-zamjena" onClick={zamijeniUloge} disabled={zauzet || snima}>
          {uloga === 'asistent' ? 'Zamijeni uloge' : 'Vrati uloge'}
        </button>
      </div>

      <div className="usmeni-tijek" ref={tijekRef}>
        {poruke.length === 0 && (
          <p className="usmeni-uputa">
            Pritisnite <strong>Govori</strong> i postavite pitanje o cjelini
            {naslovPoglavlja ? ` „${naslovPoglavlja}"` : ''}. Odgovor ćete čuti naglas.
          </p>
        )}
        {poruke
          .filter((p) => !p.skriveno)
          .map((p, i) => (
            <div key={i} className={`usmeni-replika usmeni-${p.autor}`}>
              <span className="usmeni-autor">{p.autor === 'student' ? 'Vi' : 'Asistent'}</span>
              {p.autor === 'asistent' ? (
                <div className="usmeni-tekst">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.tekst}</ReactMarkdown>
                </div>
              ) : (
                <p>{p.tekst}</p>
              )}
            </div>
          ))}
        {zauzet && (
          <p className="usmeni-stanje">
            {obradjuje === 'transkribiram'
              ? '✍️ Prepoznajem govor…'
              : obradjuje === 'razmisljam'
                ? '💭 Pripremam odgovor iz priručnika…'
                : '🔊 Govorim…'}
          </p>
        )}
      </div>

      {greska && <p className="usmena-greska">{greska}</p>}

      <div className="usmeni-upravljanje">
        {!snima ? (
          <button className="gumb-govori" onClick={pocniSnimanje} disabled={zauzet}>
            🎤 Govori
          </button>
        ) : (
          <button className="gumb-govori gumb-govori-snima" onClick={zaustaviSnimanje}>
            ⏹ Završi i pošalji
          </button>
        )}
        <span className="usmeni-napomena">Snimka se ne pohranjuje — ostaje samo prepoznati tekst.</span>
      </div>
    </section>
  );
}

/** TTS ne treba čitati Markdown oznake ni oznake citata naglas. */
function ocistiZaGovor(md: string): string {
  return md
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}
