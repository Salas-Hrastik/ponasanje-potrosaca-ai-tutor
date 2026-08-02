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
 */

interface Replika {
  autor: 'student' | 'asistent';
  tekst: string;
}

type Stanje = 'mirno' | 'spajanje' | 'spojeno' | 'greska';

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
  const [replike, setReplike] = useState<Replika[]>([]);
  const [izvori, setIzvori] = useState<string[]>([]);
  const [utisan, setUtisan] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mikRef = useRef<MediaStream | null>(null);
  const zvukRef = useRef<HTMLAudioElement | null>(null);
  const tijekRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = tijekRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replike]);

  const posalji = useCallback((poruka: unknown) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') dc.send(JSON.stringify(poruka));
  }, []);

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

      // Prijepisi — razgovor ostaje čitljiv i bez slušanja.
      if (tip === 'conversation.item.input_audio_transcription.completed') {
        const t = String(d.transcript ?? '').trim();
        if (t) setReplike((p) => [...p, { autor: 'student', tekst: t }]);
        return;
      }
      if (tip === 'response.output_audio_transcript.done' || tip === 'response.audio_transcript.done') {
        const t = String(d.transcript ?? '').trim();
        if (t) setReplike((p) => [...p, { autor: 'asistent', tekst: t }]);
        return;
      }
      if (tip === 'error') {
        console.error('[realtime]', d);
      }
    },
    [obradiAlat],
  );

  const prekini = useCallback(() => {
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
              ? 'Asistent postavlja pitanja iz priručnika i odmah komentira vaš odgovor. Govorite prirodno — možete ga i prekinuti. Vježba je bez ocjenjivanja, a snimka se nigdje ne pohranjuje.'
              : 'Govorite prirodno i pitajte što vas zanima; možete i prekinuti asistenta usred rečenice. Zatražite li zamjenu uloga, on ispituje vas. Snimka se nigdje ne pohranjuje.'}
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
            {replike.length === 0 && (
              <p className="glasovni-cekanje">Slušam… recite nešto kad budete spremni.</p>
            )}
            {replike.map((r, i) => (
              <div key={i} className={`glasovni-replika glasovni-${r.autor}`}>
                <span className="glasovni-autor">{r.autor === 'student' ? 'Vi' : 'Asistent'}</span>
                <p>{r.tekst}</p>
              </div>
            ))}
          </div>

          {izvori.length > 0 && (
            <ul className="chat-citati glasovni-izvori">
              {izvori.slice(-4).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}

          <p className="glasovni-napomena">
            Snimka se ne pohranjuje — na zaslonu ostaje samo prepoznati tekst.
          </p>
        </>
      )}
    </div>
  );
}
