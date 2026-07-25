'use client';

import { useRef, useState } from 'react';

/**
 * Čitanje teksta naglas (TTS). Zvuk se dohvaća kao blob, pušta i odmah otpušta —
 * ništa se ne pohranjuje ni na poslužitelju ni u pregledniku.
 */
export default function TtsGumb({ tekst, oznaka = 'Pročitaj naglas' }: { tekst: string; oznaka?: string }) {
  const [stanje, setStanje] = useState<'mirno' | 'ucitava' | 'svira'>('mirno');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function pusti() {
    if (stanje === 'svira') {
      audioRef.current?.pause();
      setStanje('mirno');
      return;
    }
    setStanje('ucitava');
    try {
      const res = await fetch('/api/govor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tekst }),
      });
      if (!res.ok) {
        setStanje('mirno');
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setStanje('mirno');
      };
      await audio.play();
      setStanje('svira');
    } catch {
      setStanje('mirno');
    }
  }

  return (
    <button type="button" className="gumb-tts" onClick={pusti} disabled={stanje === 'ucitava'}>
      {stanje === 'svira' ? '⏸ Zaustavi' : stanje === 'ucitava' ? '⏳ Pripremam…' : `🔊 ${oznaka}`}
    </button>
  );
}
