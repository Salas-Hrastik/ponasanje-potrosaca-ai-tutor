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

interface Citat {
  poglavlje: string;
  stranice: string;
}

interface Poruka {
  autor: 'student' | 'asistent';
  tekst: string;
  citati?: Citat[];
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

  /**
   * Red za izgovaranje: rečenice se sintetiziraju i puštaju redom, dok odgovor
   * još pristiže. Sljedeća se dohvaća dok tekuća svira, pa nema tišine između.
   */
  const redRef = useRef<string[]>([]);
  const sviraRef = useRef(false);
  const prekinutoRef = useRef(false);

  const dohvatiZvuk = useCallback(async (tekst: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/govor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tekst: ocistiZaGovor(tekst) }),
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  }, []);

  const pustiRed = useCallback(async () => {
    if (sviraRef.current) return;
    sviraRef.current = true;
    setObradjuje('govorim');

    // Sinteza sljedeće rečenice teče usporedo s reprodukcijom tekuće.
    let sljedeci: Promise<string | null> | null = null;
    while (redRef.current.length > 0 && !prekinutoRef.current) {
      const tekst = redRef.current.shift()!;
      const url = sljedeci ? await sljedeci : await dohvatiZvuk(tekst);
      sljedeci = redRef.current.length > 0 ? dohvatiZvuk(redRef.current[0]) : null;
      if (!url) continue;

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
    }

    sviraRef.current = false;
    if (redRef.current.length === 0) setObradjuje('');
  }, [dohvatiZvuk]);

  /** Dodaje rečenicu u red i pokreće reprodukciju ako već ne svira. */
  const izgovoriRecenicu = useCallback(
    (recenica: string) => {
      const t = recenica.trim();
      if (!t) return;
      redRef.current.push(t);
      void pustiRed();
    },
    [pustiRed],
  );

  /**
   * Šalje poruku i ČITA TOK odgovora: tekst se ispisuje dok pristiže, a svaka
   * dovršena rečenica odmah ide na izgovaranje — ne čeka se cijeli odgovor.
   */
  const posalji = useCallback(
    async (tekst: string, ulogaZaPoziv: Uloga, skriveno = false) => {
      const povijest = poruke.slice(-6).map(({ autor, tekst: t }) => ({ autor, tekst: t }));
      prekinutoRef.current = false;
      redRef.current = [];
      setPoruke((p) => [...p, { autor: 'student', tekst, skriveno }]);
      setObradjuje('razmisljam');

      try {
        const res = await fetch('/api/usmeni', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pitanje: tekst,
            poglavljeBroj,
            naslovPoglavlja,
            uloga: ulogaZaPoziv,
            povijest,
          }),
        });
        if (!res.body) throw new Error('nema toka');

        // Prazna replika asistenta u koju se tekst dopisuje kako pristiže.
        setPoruke((p) => [...p, { autor: 'asistent', tekst: '' }]);

        const citac = res.body.getReader();
        const dekoder = new TextDecoder();
        let ostatak = '';
        let zaIzgovor = '';
        let prvaStigla = false;

        while (true) {
          const { done, value } = await citac.read();
          if (done) break;
          ostatak += dekoder.decode(value, { stream: true });

          const redci = ostatak.split('\n');
          ostatak = redci.pop() ?? '';

          for (const r of redci) {
            if (!r.trim()) continue;
            let dog: { t: string; v?: unknown };
            try {
              dog = JSON.parse(r);
            } catch {
              continue;
            }

            if (dog.t === 'tekst' && typeof dog.v === 'string') {
              if (!prvaStigla) {
                prvaStigla = true;
                setObradjuje('govorim');
              }
              const komad = dog.v;
              setPoruke((p) => {
                const kopija = [...p];
                const zadnja = kopija[kopija.length - 1];
                if (zadnja?.autor === 'asistent') {
                  kopija[kopija.length - 1] = { ...zadnja, tekst: zadnja.tekst + komad };
                }
                return kopija;
              });

              // Rečenica je gotova kad dođe .!? — tada odmah ide na izgovaranje.
              zaIzgovor += komad;
              const granica = /[.!?…]["»)\]]?\s/;
              let m: RegExpMatchArray | null;
              while ((m = zaIzgovor.match(granica)) && m.index !== undefined) {
                const kraj = m.index + m[0].length;
                izgovoriRecenicu(zaIzgovor.slice(0, kraj));
                zaIzgovor = zaIzgovor.slice(kraj);
              }
            } else if (dog.t === 'citati') {
              const citati = dog.v as Citat[];
              setPoruke((p) => {
                const kopija = [...p];
                const zadnja = kopija[kopija.length - 1];
                if (zadnja?.autor === 'asistent') {
                  kopija[kopija.length - 1] = { ...zadnja, citati };
                }
                return kopija;
              });
            }
          }
        }

        // Zadnja rečenica često nema završni razmak.
        if (zaIzgovor.trim()) izgovoriRecenicu(zaIzgovor);
        if (redRef.current.length === 0 && !sviraRef.current) setObradjuje('');
      } catch {
        setGreska('Odgovor nije stigao. Pokušajte ponovno.');
        setObradjuje('');
      }
    },
    [poruke, poglavljeBroj, naslovPoglavlja, izgovoriRecenicu],
  );

  async function pocniSnimanje() {
    setGreska(null);
    // Student je počeo govoriti — prekini izgovaranje i isprazni red.
    prekinutoRef.current = true;
    redRef.current = [];
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
                <>
                  <div className="usmeni-tekst">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.tekst}</ReactMarkdown>
                  </div>
                  {!!p.citati?.length && (
                    <ul className="usmeni-citati">
                      {p.citati.map((c, j) => (
                        <li key={j}>
                          {c.poglavlje}, str. {c.stranice}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
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
