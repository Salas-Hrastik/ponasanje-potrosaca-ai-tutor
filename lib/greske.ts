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
  const konfiguracijska = poruka.startsWith('Nedostaje');

  console.error('[api] greška:', poruka);

  return NextResponse.json(
    {
      greska: konfiguracijska
        ? `Poslužitelj nije potpuno konfiguriran: ${poruka} Postavite varijablu u Vercel → Settings → Environment Variables i ponovno deployajte.`
        : opcenitaPoruka,
    },
    { status: 500 },
  );
}
