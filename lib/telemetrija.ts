/**
 * Telemetrija — ključne metrike kvalitete asistenta, bez osobnih podataka.
 *
 * Bilježi se: vrsta događaja, opseg (lekcija/poglavlje), je li dohvat imao
 * kontekst, broj isječaka, najbolji rezultat sličnosti i trajanje odgovora.
 * NE bilježe se pitanja studenata, transkripti ni bilo kakav sadržaj razgovora —
 * ta tablica postoji da bi se mjerilo (a) koliko često dohvat ostane bez
 * konteksta, (b) prosječno vrijeme odgovora i (c) pokrivenost rubrikom u
 * usmenim vježbama.
 *
 * Upis nikad ne smije srušiti zahtjev: greške se samo logiraju.
 */
import { supabaseAdmin } from './supabase';

export type DogadjajVrsta = 'chat' | 'usmena_pitanje' | 'usmena_ocjena' | 'kviz' | 'asr' | 'tts';

export interface TelemetrijaZapis {
  vrsta: DogadjajVrsta;
  lekcijaId?: string | null;
  poglavljeId?: string | null;
  imaKontekst: boolean;
  brojIsjecaka?: number;
  najboljiScore?: number | null;
  trajanjeMs: number;
  /** Zbroj rubrike (0–8) za usmenu vježbu, ako je primjenjivo. */
  rubrikaZbroj?: number | null;
}

export async function zabiljezi(zapis: TelemetrijaZapis): Promise<void> {
  try {
    await supabaseAdmin().from('telemetrija').insert({
      vrsta: zapis.vrsta,
      lekcija_id: zapis.lekcijaId ?? null,
      poglavlje_id: zapis.poglavljeId ?? null,
      ima_kontekst: zapis.imaKontekst,
      broj_isjecaka: zapis.brojIsjecaka ?? 0,
      najbolji_score: zapis.najboljiScore ?? null,
      trajanje_ms: Math.round(zapis.trajanjeMs),
      rubrika_zbroj: zapis.rubrikaZbroj ?? null,
    });
  } catch (e) {
    console.error('[telemetrija] upis nije uspio:', e);
  }
}

/** Mjerač trajanja: `const t = mjeri(); … t()` vraća proteklo vrijeme u ms. */
export function mjeri(): () => number {
  const pocetak = Date.now();
  return () => Date.now() - pocetak;
}
