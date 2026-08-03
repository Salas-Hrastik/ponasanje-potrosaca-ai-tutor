'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Govor-na-govor s modelom (OpenAI Realtime), preko WebRTC-a.
 *
 * Zašto izravna veza preglednik ↔ OpenAI: dosadašnji put je bio snimka →
 * prijepis → odgovor → sinteza, gdje se svaki korak čeka do kraja. Ovdje zvuk
 * teče u oba smjera bez tih zastoja, pa se može i upasti u riječ.
 *
 * VJERNOST IZVORU: model nema pravo odgovarati iz vlastitog znanja. Upute i
 * alat postavljeni su na poslužitelju (/api/realtime/sesija), a jedini put do
 * gradiva je alat „dohvati_gradivo" (/api/realtime/gradivo), koji vrti isti
 * dohvat i istu branu pokrića kao pismeni razgovor.
 *
 * NA ZASLONU NEMA PRIJEPISA. Razgovor je razgovor: ispisivanje svake replike
 * odvlači pogled s govora i pretvara vježbu u čitanje. U načinu „ispit" ostaje
 * jedino PISANA povratna informacija — svaki studentov odgovor u pozadini
 * prolazi kroz /api/usmena-vjezba/ocijeni i pojavljuje se kartica s procjenom,
 * razradom i idealnim odgovorom. Izgovorena pohvala nestane čim je izrečena;
 * napisani idealan odgovor ostaje za učenje.
 *
 * Prepoznavanje govora zato se traži samo u ispitu (ondje je odgovor podloga
 * za ocjenu); u razgovoru se uopće ne uključuje.
 */

interface Citat {
  poglavlje: string;
  stranice: string;
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

/** Jedna kartica pisane povratne informacije, po jedna na svako pitanje. */
type Ocjena = { kljuc: number; stanje: 'ceka' | 'gotovo' | 'greska'; podaci?: Povratna };

type Stanje = 'mirno' | 'spajanje' | 'spojeno' | 'greska';

const PROCJENA_KLASA: Record<string, string> = {
  'uglavnom točno': 'procjena-dobro',
  djelomično: 'procjena-djelomicno',
  netočno: 'procjena-lose',
};

/**
 * Detekcija govora reže studentov odgovor na odsječke već pri kraćoj stanci,
 * pa se odsječci prvo skupljaju i tek se onda šalju na ocjenu — inače bi se
 * ocjenjivala prva polovica rečenice.
 */
const SASTAVI_ODGOVOR_MS = 1500;

/**
 * Ispitivač u jednoj replici prvo komentira prethodni odgovor pa tek onda pita
 * novo. Na ocjenu smije ići samo pitanje — komentar bi odvukao dohvat na
 * prethodnu temu. Uzima se zadnja rečenica koja završava upitnikom.
 */
function izvuciPitanje(tekst: string): string {
  const kraj = tekst.lastIndexOf('?');
  if (kraj < 0) return '';
  const dio = tekst.slice(0, kraj + 1);
  const pocetak = Math.max(
    dio.lastIndexOf('.', kraj - 1),
    dio.lastIndexOf('!', kraj - 1),
    dio.lastIndexOf('?', kraj - 1),
  );
  return dio.slice(pocetak + 1).trim();
}

export default function GlasovniRazgovor({
  poglavljeBroj,
  nacin = 'razgovor',
  naslovIzvora = 'Razgovor',
}: {
  poglavljeBroj: number;
  nacin?: 'razgovor' | 'ispit';
  naslovIzvora?: string;
}) {
  const [stanje, setStanje] = useState<Stanje>('mirno');
  const [greska, setGreska] = useState<string | null>(null);
  const [ocjene, setOcjene] = useState<Ocjena[]>([]);
  const [izvori, setIzvori] = useState<string[]>([]);
  const [utisan, setUtisan] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mikRef = useRef<MediaStream | null>(null);
  const zvukRef = useRef<HTMLAudioElement | null>(null);
  const tijekRef = useRef<HTMLDivElement | null>(null);

  // Pisana ocjena: zadnje pitanje asistenta, odsječci odgovora i njihov tajmer.
  const pitanjeRef = useRef('');
  const odgovorRef = useRef('');
  const tajmerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brojacRef = useRef(0);

  // Nova kartica se poravnava VRHOM, ne dnom: skrol na dno odsiječe naslov i
  // procjenu, a čita se odozgo.
  useEffect(() => {
    const el = tijekRef.current;
    if (!el) return;
    const zadnja = el.lastElementChild as HTMLElement | null;
    el.scrollTop = zadnja ? zadnja.offsetTop - el.offsetTop : el.scrollHeight;
  }, [ocjene]);

  const posalji = useCallback((poruka: unknown) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') dc.send(JSON.stringify(poruka));
  }, []);

  /**
   * Pisana ocjena ide kroz istu rutu kao i nekadašnja usmena vježba: dohvat s
   * branom pokrića pa ocjena u JSON-u. Namjerno se NE traži od glasovnog
   * modela — ono što je izgovorio nitko ne provjerava, a ovdje ocjena nastaje
   * iz isječaka priručnika.
   */
  const ocijeni = useCallback(async () => {
    const pitanje = pitanjeRef.current.trim();
    const odgovor = odgovorRef.current.trim();
    odgovorRef.current = '';
    if (nacin !== 'ispit' || !pitanje || !odgovor) return;
    // Jedno pitanje — jedna ocjena; nastavak razgovora čeka novo pitanje.
    pitanjeRef.current = '';

    const kljuc = ++brojacRef.current;
    setOcjene((p) => [...p, { kljuc, stanje: 'ceka' }]);
    const zamijeni = (stanje: Ocjena['stanje'], podaci?: Povratna) =>
      setOcjene((p) => p.map((o) => (o.kljuc === kljuc ? { kljuc, stanje, podaci } : o)));

    try {
      const res = await fetch('/api/usmena-vjezba/ocijeni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poglavljeBroj, pitanje, transkript: odgovor }),
      });
      const podaci = (await res.json()) as Povratna;
      if (!res.ok || !podaci?.tip) zamijeni('greska');
      else zamijeni('gotovo', podaci);
    } catch {
      zamijeni('greska');
    }
  }, [nacin, poglavljeBroj]);

  /** Model traži gradivo — jedini put kojim sadržaj priručnika ulazi u razgovor. */
  const obradiAlat = useCallback(
    async (callId: string, argumenti: string) => {
      let upit = '';
      try {
        upit = (JSON.parse(argumenti) as { upit?: string }).upit ?? '';
      } catch {
        upit = '';
      }

      let rezultat: unknown = { nadjeno: false, uputa: 'Dohvat nije uspio. Reci da trenutačno ne možeš provjeriti priručnik.' };
      try {
        const res = await fetch('/api/realtime/gradivo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upit, poglavljeBroj }),
        });
        if (res.ok) {
          const podaci = (await res.json()) as {
            citati?: { poglavlje: string; stranice: string }[];
          };
          rezultat = podaci;
          if (podaci.citati?.length) {
            setIzvori((p) => {
              const novi = podaci.citati!.map((c) => `${c.poglavlje}, str. ${c.stranice}`);
              return [...new Set([...p, ...novi])];
            });
          }
        }
      } catch {
        /* ostaje zadani rezultat */
      }

      posalji({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(rezultat) },
      });
      posalji({ type: 'response.create' });
    },
    [poglavljeBroj, posalji],
  );

  const naDogadjaj = useCallback(
    (e: MessageEvent) => {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(e.data as string);
      } catch {
        return;
      }
      const tip = String(d.type ?? '');

      // Poziv alata stiže pod nekoliko imena, ovisno o inačici sučelja.
      if (tip === 'response.function_call_arguments.done') {
        void obradiAlat(String(d.call_id), String(d.arguments ?? '{}'));
        return;
      }
      if (tip === 'response.done') {
        const izlaz = (d.response as { output?: { type: string; call_id?: string; name?: string; arguments?: string }[] })?.output ?? [];
        for (const stavka of izlaz) {
          if (stavka.type === 'function_call' && stavka.call_id) {
            void obradiAlat(stavka.call_id, stavka.arguments ?? '{}');
          }
        }
        return;
      }

      // Prijepisi se NE prikazuju; služe samo kao podloga za pisanu ocjenu,
      // pa se u razgovoru ni ne obrađuju.
      if (nacin === 'ispit' && tip === 'conversation.item.input_audio_transcription.completed') {
        const t = String(d.transcript ?? '').trim();
        if (!t || !pitanjeRef.current) return;
        odgovorRef.current = `${odgovorRef.current} ${t}`.trim();
        if (tajmerRef.current) clearTimeout(tajmerRef.current);
        tajmerRef.current = setTimeout(() => void ocijeni(), SASTAVI_ODGOVOR_MS);
        return;
      }
      if (
        nacin === 'ispit' &&
        (tip === 'response.output_audio_transcript.done' || tip === 'response.audio_transcript.done')
      ) {
        // Ocjenjuje se samo odgovor na pitanje; komentar asistenta nije pitanje.
        const p = izvuciPitanje(String(d.transcript ?? '').trim());
        if (p) {
          pitanjeRef.current = p;
          odgovorRef.current = '';
        }
        return;
      }
      if (tip === 'error') {
        console.error('[realtime]', d);
      }
    },
    [nacin, obradiAlat, ocijeni],
  );

  const prekini = useCallback(() => {
    if (tajmerRef.current) clearTimeout(tajmerRef.current);
    tajmerRef.current = null;
    dcRef.current?.close();
    pcRef.current?.close();
    mikRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    mikRef.current = null;
    setStanje('mirno');
    setUtisan(false);
  }, []);

  async function pokreni() {
    setGreska(null);
    setStanje('spajanje');
    try {
      const res = await fetch('/api/realtime/sesija', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poglavljeBroj, nacin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.greska ?? 'Sesija nije dostupna.');
      }
      const { kljuc, model } = (await res.json()) as { kljuc: string; model: string };

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Glas asistenta.
      pc.ontrack = (dog) => {
        if (zvukRef.current) zvukRef.current.srcObject = dog.streams[0];
      };

      const mik = await navigator.mediaDevices.getUserMedia({ audio: true });
      mikRef.current = mik;
      mik.getTracks().forEach((t) => pc.addTrack(t, mik));

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = naDogadjaj;
      dc.onopen = () => {
        setStanje('spojeno');
        // Asistent otvara razgovor, da student ne mora pogađati kako početi.
        posalji({ type: 'response.create' });
      };

      const ponuda = await pc.createOffer();
      await pc.setLocalDescription(ponuda);

      const sdp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kljuc}`, 'Content-Type': 'application/sdp' },
        body: ponuda.sdp,
      });
      if (!sdp.ok) throw new Error('Povezivanje nije uspjelo.');
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
    } catch (e) {
      console.error('[realtime]', e);
      setGreska(
        e instanceof Error && e.message.includes('Permission')
          ? 'Pristup mikrofonu nije odobren.'
          : 'Glasovni razgovor se nije uspio pokrenuti.',
      );
      setStanje('greska');
      prekini();
    }
  }

  function prebaciMikrofon() {
    const novo = !utisan;
    mikRef.current?.getAudioTracks().forEach((t) => (t.enabled = !novo));
    setUtisan(novo);
  }

  // Veza se ne smije nastaviti nakon zatvaranja prozora.
  useEffect(() => prekini, [prekini]);

  return (
    <div className="glasovni">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={zvukRef} autoPlay className="glasovni-zvuk" />

      {stanje !== 'spojeno' ? (
        <div className="aktivnost-pocetak">
          <span className="aktivnost-znak" aria-hidden="true">
            🎙️
          </span>
          <h4 className="aktivnost-naslov">{naslovIzvora}</h4>
          <p className="aktivnost-stanje">
            {stanje === 'spajanje' ? 'Povezujem…' : 'Glasovni razgovor nije pokrenut'}
          </p>
          <p className="aktivnost-opis">
            {nacin === 'ispit'
              ? 'Asistent postavlja pitanja iz priručnika i odmah komentira vaš odgovor. Nakon svakog odgovora pojavi se i pisana procjena s idealnim odgovorom. Vježba je bez ocjenjivanja, a snimka se nigdje ne pohranjuje.'
              : 'Govorite prirodno i pitajte što vas zanima; možete i prekinuti asistenta usred rečenice. Zatražite li zamjenu uloga, on ispituje vas. Razgovor se ne ispisuje ni pohranjuje.'}
          </p>
          <button className="gumb-pilula" onClick={pokreni} disabled={stanje === 'spajanje'}>
            {stanje === 'spajanje' ? 'Povezujem…' : 'Pokreni glasovni razgovor'}
          </button>
          {greska && <p className="usmena-greska">{greska}</p>}
        </div>
      ) : (
        <>
          <div className="glasovni-traka">
            <span className="glasovni-znak" aria-hidden="true">
              ●
            </span>
            <span className="glasovni-stanje">Razgovor teče — govorite slobodno</span>
            <button className="citac-gumb" onClick={prebaciMikrofon}>
              {utisan ? '🔇 Uključi mikrofon' : '🎙️ Utišaj'}
            </button>
            <button className="citac-gumb" onClick={prekini}>
              ✕ Prekini
            </button>
          </div>

          <div className="glasovni-tijek" ref={tijekRef}>
            {nacin === 'razgovor' || ocjene.length === 0 ? (
              <div className="glasovni-slusanje">
                <span className="glasovni-slusanje-znak" aria-hidden="true">
                  🎙️
                </span>
                <p>
                  {utisan
                    ? 'Mikrofon je utišan — asistent vas trenutačno ne čuje.'
                    : 'Slušam… govorite kad budete spremni.'}
                </p>
                {nacin === 'ispit' && !utisan && (
                  <p className="glasovni-slusanje-uputa">
                    Pisana procjena s idealnim odgovorom pojavit će se ovdje nakon vašeg odgovora.
                  </p>
                )}
              </div>
            ) : (
              ocjene.map((o) => <OcjenaKartica key={o.kljuc} stanje={o.stanje} podaci={o.podaci} />)
            )}
          </div>

          {izvori.length > 0 && (
            <ul className="chat-citati glasovni-izvori">
              {izvori.slice(-4).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}

          <p className="glasovni-napomena">
            {nacin === 'ispit'
              ? 'Snimka se ne pohranjuje; za povratnu informaciju sprema se samo prepoznati tekst vašeg odgovora.'
              : 'Snimka se ne pohranjuje niti se razgovor zapisuje.'}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Pisana povratna informacija u tijeku razgovora. Idealan odgovor stoji
 * otvoren jer je on ono zbog čega se provjera i radi; razrada je sklopljena da
 * ne pregazi razgovor iznad nje.
 */
function OcjenaKartica({ stanje, podaci }: { stanje: 'ceka' | 'gotovo' | 'greska'; podaci?: Povratna }) {
  if (stanje === 'ceka') {
    return (
      <div className="glasovni-ocjena">
        <p className="usmena-cekanje">Pripremam pisanu povratnu informaciju…</p>
      </div>
    );
  }
  if (stanje === 'greska' || !podaci) {
    return (
      <div className="glasovni-ocjena">
        <p className="usmena-greska">
          Pisanu povratnu informaciju nije bilo moguće pripremiti. Razgovor teče dalje.
        </p>
      </div>
    );
  }
  if (podaci.tip === 'nedovoljno_konteksta') {
    return (
      <div className="glasovni-ocjena">
        <p>{podaci.poruka}</p>
      </div>
    );
  }

  const imaRazradu =
    !!podaci.rubrika ||
    !!podaci.tocno?.length ||
    !!podaci.nedostaje?.length ||
    !!podaci.pogresno?.length ||
    !!podaci.savjeti?.length;

  return (
    <div className="glasovni-ocjena">
      <span className="glasovni-autor">Pisana povratna informacija</span>

      {podaci.procjena && (
        <p className={`usmena-procjena ${PROCJENA_KLASA[podaci.procjena] ?? ''}`}>
          Procjena: <strong>{podaci.procjena}</strong>
        </p>
      )}

      {podaci.idealni_odgovor && (
        <div className="usmena-idealni">
          <h4>Idealan sažeti odgovor</h4>
          <p>{podaci.idealni_odgovor}</p>
        </div>
      )}

      {imaRazradu && (
        <details className="usmena-natuknice">
          <summary>Prikaži razradu odgovora</summary>

          {podaci.rubrika && (
            <ul className="usmena-rubrika">
              <li>
                Točnost pojmova <span>{podaci.rubrika.tocnost}/2</span>
              </li>
              <li>
                Pokrivenost <span>{podaci.rubrika.pokrivenost}/2</span>
              </li>
              <li>
                Terminologija <span>{podaci.rubrika.terminologija}/2</span>
              </li>
              <li>
                Jasnoća izlaganja <span>{podaci.rubrika.jasnoca}/2</span>
              </li>
            </ul>
          )}

          {!!podaci.tocno?.length && (
            <Blok naslov="✓ Dobro ste naveli" stavke={podaci.tocno} klasa="blok-tocno" />
          )}
          {!!podaci.nedostaje?.length && (
            <Blok naslov="◻ Nedostaje" stavke={podaci.nedostaje} klasa="blok-nedostaje" />
          )}
          {!!podaci.pogresno?.length && (
            <Blok naslov="✗ Netočno" stavke={podaci.pogresno} klasa="blok-pogresno" />
          )}
          {!!podaci.savjeti?.length && (
            <Blok naslov="💡 Savjeti" stavke={podaci.savjeti} klasa="blok-savjeti" />
          )}
        </details>
      )}

      {!!podaci.citati?.length && (
        <ul className="chat-citati">
          {podaci.citati.map((c, i) => (
            <li key={i}>
              {c.poglavlje}, str. {c.stranice}
            </li>
          ))}
        </ul>
      )}
    </div>
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
