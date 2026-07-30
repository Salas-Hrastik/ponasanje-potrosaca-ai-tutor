import { NextResponse } from 'next/server';

/**
 * Nedostajuća ENV varijabla (npr. OPENAI_API_KEY u produkciji) inače pukne
 * duboko u pozivu i Next vrati prazan 500 — u sučelju se to vidi samo kao
 * „Došlo je do pogreške", bez ikakve naznake što treba popraviti. Zato se
 * takve greške prepoznaju i vraćaju s jasnom porukom, dok se sve ostalo
 * i dalje javlja općenito (bez curenja internih detalja).
 */
export function odgovorNaGresku(e: unknown, opcenitaPoruka: string): NextResponse {
  // Next.js interno koristi iznimke za upravljanje tokom (npr. prepoznavanje da
  // je ruta dinamička, redirect, notFound). Njih se NE smije progutati — inače
  // bi se dinamička ruta pogrešno smatrala statičnom i keširala.
  const digest = (e as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && (digest.startsWith('NEXT_') || digest.startsWith('DYNAMIC_SERVER_USAGE'))) {
    throw e;
  }

  const poruka = e instanceof Error ? e.message : String(e);
  const konfiguracijska =
    poruka.startsWith('Nedostaje') || poruka.startsWith('Vrijednost varijable');

  console.error('[api] greška:', e);

  return NextResponse.json(
    {
      greska: konfiguracijska
        ? `Poslužitelj nije potpuno konfiguriran: ${poruka} Postavite varijablu u Vercel → Settings → Environment Variables i ponovno deployajte.`
        : opcenitaPoruka,
      // Tehnički trag ne ide studentima u ruke; uključuje se samo kad se
      // dijagnosticira kvar (ENV DIAGNOSTIKA=1 u Vercelu), i to redigiran.
      ...(process.env.DIAGNOSTIKA === '1'
        ? { detalj: redigiraj(`${e instanceof Error ? e.name : 'Greška'}: ${poruka}`) }
        : {}),
    },
    { status: 500 },
  );
}

/** Uklanja sve što izgleda kao API ključ ili token iz teksta greške. */
function redigiraj(tekst: string): string {
  return tekst
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '$1-***')
    .replace(/\beyJ[A-Za-z0-9_.-]{20,}/g, 'eyJ***')
    .slice(0, 300);
}
