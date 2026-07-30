'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AiChat from './AiChat';
import QuizRunner from './QuizRunner';
import SazetakModal from './SazetakModal';
import OralPractice from './OralPractice';
import UsmeniRazgovor from './UsmeniRazgovor';

interface Odjeljak {
  id: string;
  broj: number;
  oznaka: string;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
}
interface Cilj {
  id: string;
  tekst: string;
  kognitivna_razina: string;
  stranica: number | null;
}
interface KarticaT {
  id: string;
  pojam: string;
  definicija: string;
  stranica_ref: string;
}
interface Medij {
  id: string;
  tip: 'video' | 'audio' | 'prezentacija';
  naslov: string;
  url: string;
  trajanje_s: number | null;
}

type Nacin = 'razgovaraj' | 'prouci' | 'gledaj' | 'vjezbaj' | 'provjeri';

const NACINI: { id: Nacin; naslov: string; opis: string }[] = [
  { id: 'razgovaraj', naslov: 'Razgovaraj', opis: 'Vježba bez ocjenjivanja — pitajte ili zamijenite uloge' },
  { id: 'prouci', naslov: 'Prouči', opis: 'Ciljevi i sadržaj cjeline, korak po korak' },
  { id: 'gledaj', naslov: 'Gledaj i slušaj', opis: 'Video, audio i prezentacija' },
  { id: 'vjezbaj', naslov: 'Vježbaj', opis: 'Kartice za aktivno prisjećanje pojmova' },
  { id: 'provjeri', naslov: 'Provjeri', opis: 'Usmena provjera i kviz cjeline' },
];

/** Pretvara cilj učenja („objasniti X") u pitanje za AI asistenta. */
function ciljKaoPitanje(tekst: string): string {
  const t = tekst.trim().replace(/[.;]+$/, '');
  return `Možeš li ${t.charAt(0).toLowerCase()}${t.slice(1)}?`;
}

function mmss(sekunde: number): string {
  const m = Math.floor(sekunde / 60);
  const s = sekunde % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const MEDIJ_OZNAKE: Record<Medij['tip'], string> = {
  video: '🎬 Video',
  audio: '🎧 Audio',
  prezentacija: '📊 Prezentacija',
};

/**
 * Sažetak cjeline (## oznaka naslov po odjeljku) dijeli se natrag na odjeljke,
 * istim redoslijedom kojim su odjeljci ingestirani — tako „Prouči" prikazuje
 * doslovni tekst priručnika korak po korak, bez ikakvog novog sadržaja.
 */
function koraciPoOdjeljcima(sazetakMd: string, odjeljci: Odjeljak[]) {
  const dijelovi: string[] = [];
  let tekuci: string[] = [];
  for (const redak of sazetakMd.split('\n')) {
    if (redak.startsWith('## ')) {
      if (tekuci.length) dijelovi.push(tekuci.join('\n').trim());
      tekuci = [];
    } else {
      tekuci.push(redak);
    }
  }
  if (tekuci.length) dijelovi.push(tekuci.join('\n').trim());
  return odjeljci.map((o, i) => ({ odjeljak: o, sadrzaj: dijelovi[i] ?? '' }));
}

export default function CjelinaRadniProstor({
  broj,
  naslov,
  dio,
  stranicaOd,
  stranicaDo,
  sazetakMd,
  odjeljci,
  ciljevi,
  kartice,
  mediji,
  brojPitanja,
}: {
  broj: number;
  naslov: string;
  dio: string;
  stranicaOd: number;
  stranicaDo: number;
  sazetakMd: string;
  odjeljci: Odjeljak[];
  ciljevi: Cilj[];
  kartice: KarticaT[];
  mediji: Medij[];
  brojPitanja: number;
}) {
  const [nacin, setNacin] = useState<Nacin | null>(null);
  const koraci = useMemo(() => koraciPoOdjeljcima(sazetakMd, odjeljci), [sazetakMd, odjeljci]);
  const predlozenaPitanja = useMemo(() => ciljevi.map((c) => ciljKaoPitanje(c.tekst)), [ciljevi]);
  const stranice = `${stranicaOd}–${stranicaDo}`;

  if (nacin === null) {
    return (
      <div className="radni-prostor">
        <div className="cjelina-hero">
          <div className="cjelina-hero-tekst">
            <p className="cjelina-hero-oznaka">{dio}</p>
            <p className="cjelina-hero-podnaslov">
              Odaberite način rada u nastavku. U svakom se trenutku možete vratiti na početak
              cjeline.
            </p>
          </div>
          <div className="cjelina-hero-znacka">
            <span className="cjelina-hero-broj">{broj}</span>
            <span className="cjelina-hero-oznaka-mala">cjelina</span>
          </div>
        </div>

        {ciljevi.length > 0 && (
          <section className="kartica ciljevi-kartica ciljevi-kartica-kompaktna">
            <h3>🎯 Što ćete naučiti?</h3>
            <ul className="ciljevi-lista ciljevi-lista-kompaktna">
              {ciljevi.map((c) => (
                <li key={c.id}>
                  <span className="cilj-krug" aria-hidden="true" />
                  <span className="cilj-sadrzaj">
                    {c.tekst}
                    {c.kognitivna_razina && (
                      <span className="cilj-razina-chip">
                        {c.kognitivna_razina.charAt(0).toUpperCase() + c.kognitivna_razina.slice(1)}
                      </span>
                    )}
                    <span className="cilj-stranica">str. {c.stranica ?? stranice}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="nacin-odabir">
          <p className="nacin-odabir-naslov">Odaberite način rada</p>
          <div className="nacin-mreza">
            {NACINI.map((n) => (
              <button
                key={n.id}
                className={`nacin-gumb nacin-gumb-${n.id}`}
                onClick={() => setNacin(n.id)}
              >
                <span className="nacin-gumb-naslov">{n.naslov}</span>
                <span className="nacin-gumb-opis">{n.opis}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const aktivni = NACINI.find((n) => n.id === nacin)!;

  return (
    <div className="radni-prostor">
      <nav className="nacin-traka" aria-label="Način rada">
        {NACINI.map((n) => (
          <button
            key={n.id}
            className={`nacin-traka-gumb nacin-traka-gumb-${n.id} ${n.id === nacin ? 'aktivan' : ''}`}
            onClick={() => setNacin(n.id)}
          >
            {n.naslov}
          </button>
        ))}
      </nav>

      <div className="nacin-podzaglavlje">
        <button className="gumb-pocetak-cjeline" onClick={() => setNacin(null)}>
          ← Početak cjeline
        </button>
        <div className="nacin-podzaglavlje-tekst">
          <p className="nacin-oznaka">
            CJELINA {broj} · {aktivni.naslov.toUpperCase()}
          </p>
          <h2>{naslov}</h2>
          <p className="nacin-opis">{aktivni.opis}</p>
        </div>
        {sazetakMd && (
          <SazetakModal naslov={`${broj}. ${naslov}`} sazetakMd={sazetakMd} stranice={stranice} kompaktno />
        )}
      </div>

      {nacin === 'razgovaraj' && (
        <div className="nacin-panel nacin-panel-razgovaraj">
          <div className="razgovaraj-stupac razgovaraj-stupac-usmeni">
            <p className="razgovaraj-stupac-naslov">
              🎙️ Usmeni razgovor — govorite i zamijenite uloge
            </p>
            <UsmeniRazgovor poglavljeBroj={broj} naslovPoglavlja={naslov} />
          </div>
          <div className="razgovaraj-stupac razgovaraj-stupac-pismeni">
            <p className="razgovaraj-stupac-naslov">⌨️ Pismeni razgovor — pitajte i čitajte odgovor</p>
            <AiChat poglavljeBroj={broj} naslovPoglavlja={naslov} predlozenaPitanja={predlozenaPitanja} />
          </div>
        </div>
      )}

      {nacin === 'prouci' && (
        <div className="nacin-panel nacin-panel-prouci">
          {koraci.length === 0 && <p className="prazno-stanje">Sadržaj ove cjeline još nije učitan.</p>}
          {koraci.map(({ odjeljak, sadrzaj }, i) => (
            <section key={odjeljak.id} className="korak-kartica">
              <p className="korak-oznaka">
                KORAK {i + 1} · STR. {odjeljak.stranica_od}
                {odjeljak.stranica_do !== odjeljak.stranica_od ? `–${odjeljak.stranica_do}` : ''}
              </p>
              <h3>
                {odjeljak.oznaka ? `${odjeljak.oznaka} ` : ''}
                {odjeljak.naslov}
              </h3>
              {sadrzaj ? (
                <div className="korak-sadrzaj">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sadrzaj}</ReactMarkdown>
                </div>
              ) : (
                <p className="prazno-stanje">Tekst ovog odjeljka učitava se iz priručnika.</p>
              )}
            </section>
          ))}
        </div>
      )}

      {nacin === 'gledaj' && <GledajISlusaj mediji={mediji} />}

      {nacin === 'vjezbaj' && <Vjezbaj kartice={kartice} />}

      {nacin === 'provjeri' && (
        <div className="nacin-panel nacin-panel-provjeri">
          <div className="provjeri-stupac provjeri-stupac-usmena">
            <p className="provjeri-stupac-naslov">🎙️ Usmena provjera — pitanje i povratna informacija</p>
            <OralPractice poglavljeBroj={broj} naslovOpsega={naslov} />
          </div>
          <div className="provjeri-stupac provjeri-stupac-kviz">
            <p className="provjeri-stupac-naslov">📝 Kviz cjeline — jedno pitanje po ekranu</p>
            {brojPitanja > 0 ? (
              <QuizRunner poglavljeBroj={broj} />
            ) : (
              <p className="prazno-stanje">Kviz za ovu cjelinu još nije pripremljen.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GledajISlusaj({ mediji }: { mediji: Medij[] }) {
  const [odabraniId, setOdabraniId] = useState(mediji[0]?.id ?? null);
  const odabrani = mediji.find((m) => m.id === odabraniId) ?? null;

  if (mediji.length === 0) {
    return (
      <div className="nacin-panel">
        <p className="prazno-stanje">Mediji za ovu cjelinu još nisu učitani.</p>
      </div>
    );
  }

  return (
    <div className="nacin-panel nacin-panel-gledaj">
      <div className="gledaj-popis">
        {mediji.map((m, i) => (
          <button
            key={m.id}
            className={`gledaj-stavka ${m.id === odabraniId ? 'aktivna' : ''}`}
            onClick={() => setOdabraniId(m.id)}
          >
            <span className="gledaj-broj">{String(i + 1).padStart(2, '0')}</span>
            <span className="gledaj-stavka-tekst">
              <span className="gledaj-stavka-naslov">{MEDIJ_OZNAKE[m.tip]}</span>
              <span className="gledaj-stavka-meta">
                {m.naslov || (m.tip === 'prezentacija' ? 'Otvori prezentaciju' : '')}
                {m.trajanje_s ? ` · ${mmss(m.trajanje_s)}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="gledaj-detalj">
        {odabrani && (
          <>
            <p className="gledaj-detalj-oznaka">{MEDIJ_OZNAKE[odabrani.tip]}</p>
            <h3>{odabrani.naslov || MEDIJ_OZNAKE[odabrani.tip]}</h3>
            {odabrani.tip === 'video' && (
              <video src={odabrani.url} controls className="medij-player" />
            )}
            {odabrani.tip === 'audio' && (
              <audio src={odabrani.url} controls className="medij-player" />
            )}
            {odabrani.tip === 'prezentacija' && (
              <>
                <iframe
                  className="prezentacija-okvir"
                  src={
                    odabrani.url.endsWith('.pdf')
                      ? odabrani.url
                      : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(odabrani.url)}`
                  }
                  title={odabrani.naslov || 'Prezentacija'}
                  allowFullScreen
                />
                <a className="prezentacija-fallback" href={odabrani.url} target="_blank" rel="noreferrer">
                  Otvori u novoj kartici →
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Vjezbaj({ kartice }: { kartice: KarticaT[] }) {
  const [indeks, setIndeks] = useState(0);
  const [otvorena, setOtvorena] = useState(false);

  if (kartice.length === 0) {
    return (
      <div className="nacin-panel">
        <p className="prazno-stanje">Kartice za ovu cjelinu još nisu pripremljene.</p>
      </div>
    );
  }

  const trenutna = kartice[indeks];

  function idi(smjer: 1 | -1) {
    setIndeks((i) => Math.min(kartice.length - 1, Math.max(0, i + smjer)));
    setOtvorena(false);
  }

  return (
    <div className="nacin-panel nacin-panel-vjezbaj">
      <button
        className={`vjezbaj-kartica ${otvorena ? 'otvorena' : ''}`}
        onClick={() => setOtvorena((o) => !o)}
      >
        <span className="vjezbaj-pozicija">
          KARTICA {indeks + 1} / {kartice.length}
          {trenutna.stranica_ref ? ` · ${trenutna.stranica_ref.toUpperCase()}` : ''}
        </span>
        <span className="vjezbaj-pojam">{trenutna.pojam}</span>
        {otvorena ? (
          <span className="vjezbaj-definicija">{trenutna.definicija}</span>
        ) : (
          <span className="vjezbaj-nagovjestaj">Kliknite za definiciju</span>
        )}
      </button>

      <div className="vjezbaj-navigacija">
        <button className="gumb-sekundarni" disabled={indeks === 0} onClick={() => idi(-1)}>
          ← Prethodna
        </button>
        <button className="gumb-sekundarni" disabled={indeks === kartice.length - 1} onClick={() => idi(1)}>
          Sljedeća →
        </button>
      </div>
    </div>
  );
}
