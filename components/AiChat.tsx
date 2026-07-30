'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TtsGumb from './TtsGumb';

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

const VIDLJIVIH_PRIJEDLOGA = 3;

/** Uklanja Markdown oznake da TTS ne čita zvjezdice i crtice naglas. */
function zaCitanje(md: string): string {
  return md
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  const [dopunski, setDopunski] = useState(false);
  const [iskoristena, setIskoristena] = useState<Set<number>>(new Set());
  const [snima, setSnima] = useState(false);
  const [transkribira, setTranskribira] = useState(false);
  const [glasovnaGreska, setGlasovnaGreska] = useState<string | null>(null);

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
  }, [poruke, ucitava]);

  // Red čekanja: iskorišteni prijedlog nestaje, a sljedeći neiskorišteni ulazi na njegovo mjesto.
  const vidljiviPrijedlozi = predlozenaPitanja
    .map((tekst, i) => ({ tekst, i }))
    .filter((p) => !iskoristena.has(p.i))
    .slice(0, VIDLJIVIH_PRIJEDLOGA);

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
    setPoruke((p) => [...p, { autor: 'student', tekst: pitanje }]);
    setUcitava(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitanje, poglavljeBroj, naslovPoglavlja, ukljuciDopunske: dopunski }),
      });
      const data = await res.json();

      if (data.tip === 'nedovoljno_konteksta') {
        const prijedlozi = data.predlozene_cjeline?.length
          ? `\n\n**Možda tražite u:** ${data.predlozene_cjeline.join(' · ')}`
          : '';
        setPoruke((p) => [...p, { autor: 'asistent', tekst: `${data.poruka}${prijedlozi}` }]);
      } else if (data.greska) {
        setPoruke((p) => [...p, { autor: 'asistent', tekst: data.greska }]);
      } else {
        setPoruke((p) => [
          ...p,
          {
            autor: 'asistent',
            tekst: data.odgovor + (data.kratko_objasnjenje ? `\n\n_${data.kratko_objasnjenje}_` : ''),
            citati: data.citati,
            sigurnost: data.sigurnost_konteksta,
          },
        ]);
      }
    } catch {
      setPoruke((p) => [
        ...p,
        { autor: 'asistent', tekst: 'Došlo je do pogreške pri dohvatu odgovora. Pokušajte ponovno.' },
      ]);
    } finally {
      setUcitava(false);
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

  return (
    <div className="ai-chat">
      <div className="chat-zaglavlje">
        <h3>🤖 AI asistent</h3>
        {poglavljeBroj && <span className="chat-poglavlje">{poglavljeBroj}. cjelina</span>}
      </div>

      {/* Opći chat (izvan nastavne cjeline) uvijek nosi kratak disclaimer. */}
      {!poglavljeBroj && <p className="chat-disclaimer">Odgovaram samo prema udžbeniku.</p>}

      <div className="chat-poruke" ref={porukeRef}>
        {poruke.length === 0 && (
          <div className="chat-dobrodoslica">
            <p>
              Tema: <strong>{naslovPoglavlja ?? 'cijeli priručnik'}</strong>. Pitajte me bilo što —
              odgovaram isključivo prema priručniku i uz svaki odgovor navodim stranicu.
            </p>
          </div>
        )}
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
            {p.autor === 'asistent' && (
              <TtsGumb tekst={zaCitanje(p.tekst).slice(0, 1800)} oznaka="Preslušaj odgovor" />
            )}
          </div>
        ))}
        {ucitava && <div className="chat-poruka chat-asistent chat-ucitava">…</div>}
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

      <label className="chat-dopunski">
        <input type="checkbox" checked={dopunski} onChange={(e) => setDopunski(e.target.checked)} />
        Uključi dopunske izvore (uz priručnik)
      </label>

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
      <p className="chat-glasovna-napomena">Snimka glasa se ne pohranjuje — čuva se samo prepoznati tekst.</p>
    </div>
  );
}
