'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Citat {
  poglavlje: string;
  stranice: string;
  isjecak?: string;
  izvor?: string;
}

interface Poruka {
  autor: 'student' | 'asistent';
  tekst: string;
  citati?: Citat[];
  sigurnost?: string;
}

const VIDLJIVIH_PRIJEDLOGA = 2;
/** Kad razgovor krene, prostor pripada odgovoru — prijedlozi se povlače. */
const VIDLJIVIH_PRIJEDLOGA_U_RAZGOVORU = 1;

const SIGURNOST_OZNAKA: Record<string, string> = {
  visoka: 'Pokriće u priručniku: visoko',
  srednja: 'Pokriće u priručniku: srednje',
  niska: 'Pokriće u priručniku: nisko — provjerite navedene stranice',
};

export default function AiChat({
  poglavljeBroj,
  naslovPoglavlja,
  predlozenaPitanja = [],
}: {
  poglavljeBroj?: number;
  naslovPoglavlja?: string;
  predlozenaPitanja?: string[];
}) {
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const [upit, setUpit] = useState('');
  const [ucitava, setUcitava] = useState(false);
  // Mjehurići stoje samo dok se čeka PRVI komad odgovora; nakon toga odgovor
  // se ispisuje sam od sebe i indikator bi mu smetao.
  const [cekaPrvi, setCekaPrvi] = useState(false);
  const [dopunski, setDopunski] = useState(false);
  const [iskoristena, setIskoristena] = useState<Set<number>>(new Set());
  const [snima, setSnima] = useState(false);
  const [transkribira, setTranskribira] = useState(false);
  const [glasovnaGreska, setGlasovnaGreska] = useState<string | null>(null);
  // Nakon prvog pitanja razgovor se seli u veliki prozor: u uskom stupcu se
  // duži odgovor jedva čita. Zatvaranjem se vraća ugrađeni prikaz, sa
  // sačuvanim razgovorom — mijenja se samo okvir oko istog sučelja.
  const [prosireno, setProsireno] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const dijeloviRef = useRef<Blob[]>([]);
  const porukeRef = useRef<HTMLDivElement | null>(null);

  // Mikrofon se otpušta i kad korisnik napusti stranicu usred snimanja.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // Novi odgovor bi inače ostao izvan vidljivog dijela prozora poruka.
  useEffect(() => {
    const el = porukeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [poruke, ucitava, prosireno]);

  // Escape zatvara prozor, a pozadina se ne pomiče dok je otvoren.
  useEffect(() => {
    if (!prosireno) return;
    const naTipku = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProsireno(false);
    };
    document.addEventListener('keydown', naTipku);
    const prijasnji = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', naTipku);
      document.body.style.overflow = prijasnji;
    };
  }, [prosireno]);

  // Red čekanja: iskorišteni prijedlog nestaje, a sljedeći neiskorišteni ulazi na njegovo mjesto.
  const vidljiviPrijedlozi = predlozenaPitanja
    .map((tekst, i) => ({ tekst, i }))
    .filter((p) => !iskoristena.has(p.i))
    .slice(0, poruke.length === 0 ? VIDLJIVIH_PRIJEDLOGA : VIDLJIVIH_PRIJEDLOGA_U_RAZGOVORU);

  async function pocniSnimanje() {
    setGlasovnaGreska(null);
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
      setGlasovnaGreska('Pristup mikrofonu nije odobren. Pitanje možete i utipkati.');
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
      forma.append('audio', blob, 'pitanje.webm');
      const res = await fetch('/api/transkript', { method: 'POST', body: forma });
      const data = await res.json();
      if (data.transkript) {
        setUpit(data.transkript);
      } else {
        setGlasovnaGreska(data.greska ?? 'Transkripcija nije uspjela.');
      }
    } catch {
      setGlasovnaGreska('Transkripcija nije uspjela. Pitanje možete i utipkati.');
    } finally {
      setTranskribira(false);
    }
  }

  async function posaljiPitanje(pitanje: string) {
    if (!pitanje || ucitava) return;
    // Povijest se uzima PRIJE dodavanja nove poruke — model treba ono što je
    // rečeno dosad, a tekuću poruku dobiva zasebno.
    const povijest = poruke.slice(-6).map((p) => ({ autor: p.autor, tekst: p.tekst }));
    // Prvo pitanje otvara veliki prozor; poslije se prikaz ne nameće, nego ga
    // student otvara i zatvara sam.
    if (poruke.length === 0) setProsireno(true);
    setPoruke((p) => [...p, { autor: 'student', tekst: pitanje }]);
    setUcitava(true);
    setCekaPrvi(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pitanje,
          poglavljeBroj,
          naslovPoglavlja,
          ukljuciDopunske: dopunski,
          povijest,
        }),
      });
      // Greška prije početka strujanja (npr. istekla prijava) stiže kao JSON.
      if (!res.body || !res.headers.get('content-type')?.includes('ndjson')) {
        const data = await res.json().catch(() => ({}));
        setPoruke((p) => [
          ...p,
          { autor: 'asistent', tekst: data.greska ?? 'Odgovor nije stigao. Pokušajte ponovno.' },
        ]);
        return;
      }

      const citac = res.body.getReader();
      const dekoder = new TextDecoder();
      let ostatak = '';
      let zapoceta = false;

      /** Otvara asistentovu repliku pri prvom sadržaju, potom je dopunjuje. */
      const dopuni = (izmjena: (zadnja: Poruka) => Poruka) => {
        if (!zapoceta) {
          zapoceta = true;
          setCekaPrvi(false);
          setPoruke((p) => [...p, izmjena({ autor: 'asistent', tekst: '' })]);
          return;
        }
        setPoruke((p) => {
          const kopija = [...p];
          const zadnja = kopija[kopija.length - 1];
          if (zadnja?.autor === 'asistent') kopija[kopija.length - 1] = izmjena(zadnja);
          return kopija;
        });
      };

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
            const komad = dog.v;
            dopuni((z) => ({ ...z, tekst: z.tekst + komad }));
          } else if (dog.t === 'citati') {
            dopuni((z) => ({ ...z, citati: dog.v as Citat[] }));
          } else if (dog.t === 'sigurnost' && typeof dog.v === 'string') {
            dopuni((z) => ({ ...z, sigurnost: dog.v as string }));
          } else if (dog.t === 'nedovoljno') {
            const v = dog.v as { poruka: string; predlozene_cjeline?: string[] };
            const prijedlozi = v.predlozene_cjeline?.length
              ? `\n\n**Možda tražite u:** ${v.predlozene_cjeline.join(' · ')}`
              : '';
            dopuni((z) => ({ ...z, tekst: `${v.poruka}${prijedlozi}` }));
          }
        }
      }
    } catch {
      setPoruke((p) => [
        ...p,
        { autor: 'asistent', tekst: 'Došlo je do pogreške pri dohvatu odgovora. Pokušajte ponovno.' },
      ]);
    } finally {
      setUcitava(false);
      setCekaPrvi(false);
    }
  }

  function posalji(e: React.FormEvent) {
    e.preventDefault();
    const pitanje = upit.trim();
    if (!pitanje) return;
    setUpit('');
    void posaljiPitanje(pitanje);
  }

  function klikNaPrijedlog(indeks: number, tekst: string) {
    setIskoristena((s) => new Set(s).add(indeks));
    void posaljiPitanje(tekst);
  }


  const jezgra = (
    <div className="ai-chat">
      <div className="chat-zaglavlje">
        <h3>🤖 AI asistent</h3>
        {poglavljeBroj && <span className="chat-poglavlje">{poglavljeBroj}. cjelina</span>}
      </div>

      {/* Opći chat (izvan nastavne cjeline) uvijek nosi kratak disclaimer. */}
      {!poglavljeBroj && <p className="chat-disclaimer">Odgovaram samo prema udžbeniku.</p>}

      {/* Bez pozdravnog bloka: temu nosi zaglavlje cjeline, a napomenu o
          priručniku podnožje stranice — ovdje bi ih samo ponovio i oduzeo
          prostor polju za upit. */}
      <div className="chat-poruke" ref={porukeRef}>
        {poruke.map((p, i) => (
          <div key={i} className={`chat-poruka chat-${p.autor}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.tekst}</ReactMarkdown>
            {p.citati && p.citati.length > 0 && (
              <ul className="chat-citati">
                {p.citati.map((c, j) => (
                  <li key={j} className={c.izvor === 'dopunski' ? 'citat-dopunski' : undefined}>
                    {c.poglavlje}, str. {c.stranice}
                  </li>
                ))}
              </ul>
            )}
            {p.sigurnost && SIGURNOST_OZNAKA[p.sigurnost] && (
              <p className={`chat-sigurnost sigurnost-${p.sigurnost}`}>{SIGURNOST_OZNAKA[p.sigurnost]}</p>
            )}
          </div>
        ))}
        {cekaPrvi && (
          <div className="chat-poruka chat-asistent chat-ucitava" aria-label="Asistent priprema odgovor">
            <span className="chat-mjehuric" />
            <span className="chat-mjehuric" />
            <span className="chat-mjehuric" />
          </div>
        )}
      </div>

      {vidljiviPrijedlozi.length > 0 && (
        <div className="chat-prijedlozi">
          {vidljiviPrijedlozi.map((p) => (
            <button
              key={p.i}
              type="button"
              className="chat-prijedlog"
              onClick={() => klikNaPrijedlog(p.i, p.tekst)}
              disabled={ucitava}
            >
              {p.tekst}
            </button>
          ))}
        </div>
      )}

      {glasovnaGreska && <p className="chat-glasovna-greska">{glasovnaGreska}</p>}

      <form className="chat-forma" onSubmit={posalji}>
        <button
          type="button"
          className={`chat-mikrofon ${snima ? 'snima' : ''}`}
          onClick={snima ? zaustaviSnimanje : pocniSnimanje}
          disabled={ucitava || transkribira}
          aria-label={snima ? 'Zaustavi snimanje' : 'Postavi pitanje glasom'}
          title={snima ? 'Zaustavi snimanje' : 'Postavi pitanje glasom'}
        >
          {snima ? '⏹' : '🎤'}
        </button>
        <input
          value={upit}
          onChange={(e) => setUpit(e.target.value)}
          placeholder={
            transkribira
              ? 'Prepoznajem govor…'
              : poglavljeBroj
                ? 'Postavite pitanje o ovoj cjelini…'
                : 'Postavite pitanje o gradivu…'
          }
          disabled={ucitava || transkribira}
        />
        <button type="submit" className="chat-posalji" aria-label="Pošalji" disabled={ucitava || !upit.trim()}>
          ➤
        </button>
      </form>

      <label className="chat-dopunski">
        <input type="checkbox" checked={dopunski} onChange={(e) => setDopunski(e.target.checked)} />
        Uključi dopunske izvore (uz priručnik)
      </label>
    </div>
  );

  if (prosireno) {
    return (
      <div className="chat-preklop" onClick={() => setProsireno(false)} role="presentation">
        <div
          className="chat-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Pismeni razgovor"
        >
          <div className="chat-modal-traka">
            <h3>⌨️ Pismeni razgovor{naslovPoglavlja ? ` — ${naslovPoglavlja}` : ''}</h3>
            <button
              className="chat-modal-zatvori"
              onClick={() => setProsireno(false)}
              aria-label="Zatvori prošireni prikaz"
              title="Zatvori (Esc)"
            >
              ✕
            </button>
          </div>
          {jezgra}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Nakon zatvaranja prozora razgovor se nastavlja u stupcu; gumb ga vraća
          u veliki prikaz kad god zatreba. */}
      {poruke.length > 0 && (
        <div className="chat-alati">
          <button type="button" className="chat-prosiri" onClick={() => setProsireno(true)}>
            ⛶ Prošireni prikaz
          </button>
        </div>
      )}
      {jezgra}
    </>
  );
}
