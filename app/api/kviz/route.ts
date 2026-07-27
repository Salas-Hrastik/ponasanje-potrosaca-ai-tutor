import { NextRequest, NextResponse } from 'next/server';
import { zahtijevajKorisnika } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { nedovoljnoKonteksta } from '@/lib/claude';

const ZAVRSNA_PO_POGLAVLJU = 3;

function preporuka(postotak: number): string {
  if (postotak >= 85) return 'Izvrsno';
  if (postotak >= 60) return 'Dobro';
  return 'Potrebno ponoviti gradivo';
}

/**
 * GET /api/kviz?poglavljeBroj=4 — kviz nastavne cjeline (pitanja iz svih njezinih odjeljaka)
 * GET /api/kviz?zavrsna=1       — završna provjera: reprezentativna pitanja iz SVAKE cjeline
 *
 * Vraćaju se ISKLJUČIVO odobrena pitanja (odobreno = true). Nacrti koje je
 * pripremila skripta ne dolaze pred studenta dok ih nastavnik ne potvrdi.
 */
export async function GET(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const admin = supabaseAdmin();

  if (request.nextUrl.searchParams.get('zavrsna')) {
    const { data: sva, error } = await admin
      .from('kviz_pitanja')
      .select('id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref, poglavlje_id')
      .eq('odobreno', true);
    if (error) return NextResponse.json({ greska: error.message }, { status: 500 });
    if (!sva || sva.length === 0) {
      return NextResponse.json(
        nedovoljnoKonteksta('Za završnu provjeru znanja još nema odobrenih pitanja. Nastavnik ih unosi ili odobrava prije objave.'),
      );
    }

    // Reprezentativan izbor: do ZAVRSNA_PO_POGLAVLJU pitanja iz svake cjeline, da
    // završna provjera pokrije cijeli kolegij, a ne samo cjeline s najviše pitanja.
    const poPoglavlju = new Map<string, typeof sva>();
    for (const p of promijesaj(sva)) {
      const lista = poPoglavlju.get(p.poglavlje_id) ?? [];
      if (lista.length < ZAVRSNA_PO_POGLAVLJU) {
        lista.push(p);
        poPoglavlju.set(p.poglavlje_id, lista);
      }
    }
    const odabir = promijesaj([...poPoglavlju.values()].flat());
    return NextResponse.json({ naslov: 'Završna provjera znanja', pitanja: odabir });
  }

  const poglavljeBroj = Number(request.nextUrl.searchParams.get('poglavljeBroj'));
  if (!poglavljeBroj) return NextResponse.json({ greska: 'Nedostaje poglavljeBroj.' }, { status: 400 });

  const { data: pog, error: pogErr } = await admin
    .from('poglavlja')
    .select('id, naslov')
    .eq('broj', poglavljeBroj)
    .single();
  if (pogErr || !pog) return NextResponse.json({ greska: 'Cjelina nije pronađena.' }, { status: 404 });

  // Ovo je NEFORMALNI kviz za samoprovjeru (bez nadzora), pa se točan odgovor
  // šalje uz pitanja radi trenutačnog ✓/✗ na klijentu.
  const { data: pitanja, error } = await admin
    .from('kviz_pitanja')
    .select('id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref')
    .eq('poglavlje_id', pog.id)
    .eq('odobreno', true);
  if (error) return NextResponse.json({ greska: error.message }, { status: 500 });

  if (!pitanja || pitanja.length === 0) {
    return NextResponse.json(
      nedovoljnoKonteksta(`Za cjelinu „${pog.naslov}" nastavnik još nije odobrio pitanja za kviz.`),
    );
  }

  return NextResponse.json({ naslov: pog.naslov, pitanja: promijesaj(pitanja) });
}

/** POST /api/kviz — { poglavljeBroj?, zavrsna?, odgovori: [{pitanjeId, odabraniIndex}] } */
export async function POST(request: NextRequest) {
  const auth = await zahtijevajKorisnika();
  if (!auth.ok) return NextResponse.json({ greska: auth.poruka }, { status: 401 });

  const body = await request.json();
  const odgovori: { pitanjeId: string; odabraniIndex: number }[] = body?.odgovori || [];
  const zavrsna: boolean = body?.zavrsna === true;
  const poglavljeBroj: number | undefined = body?.poglavljeBroj;
  if (odgovori.length === 0) return NextResponse.json({ greska: 'Nedostaju odgovori.' }, { status: 400 });

  const admin = supabaseAdmin();
  let poglavljeId: string | null = null;
  if (!zavrsna) {
    if (!poglavljeBroj) return NextResponse.json({ greska: 'Nedostaje poglavljeBroj.' }, { status: 400 });
    const { data: pog } = await admin.from('poglavlja').select('id').eq('broj', poglavljeBroj).single();
    if (!pog) return NextResponse.json({ greska: 'Cjelina nije pronađena.' }, { status: 404 });
    poglavljeId = pog.id;
  }

  const { data: pitanja, error } = await admin
    .from('kviz_pitanja')
    .select('id, tocan_index, objasnjenje, stranica_ref')
    .in('id', odgovori.map((o) => o.pitanjeId));
  if (error || !pitanja) {
    return NextResponse.json({ greska: error?.message || 'Greška pri dohvatu pitanja.' }, { status: 500 });
  }

  const poId = new Map(pitanja.map((p) => [p.id, p]));
  let tocno = 0;
  const detalji = odgovori.map((o) => {
    const p = poId.get(o.pitanjeId);
    const jeTocno = !!p && p.tocan_index === o.odabraniIndex;
    if (jeTocno) tocno++;
    return {
      pitanjeId: o.pitanjeId,
      odabraniIndex: o.odabraniIndex,
      tocanIndex: p?.tocan_index ?? null,
      tocno: jeTocno,
      objasnjenje: p?.objasnjenje ?? '',
      stranicaRef: p?.stranica_ref ?? '',
    };
  });

  const ukupno = odgovori.length;
  const postotak = Math.round((tocno / ukupno) * 100);

  await admin.from('kviz_pokusaji').insert({
    user_id: auth.korisnik.id,
    poglavlje_id: poglavljeId,
    zavrsna,
    tocno,
    ukupno,
    odgovori: detalji,
    zavrseno_at: new Date().toISOString(),
  });

  return NextResponse.json({ tocno, ukupno, postotak, preporuka: preporuka(postotak), detalji });
}

function promijesaj<T>(niz: T[]): T[] {
  const kopija = [...niz];
  for (let i = kopija.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopija[i], kopija[j]] = [kopija[j], kopija[i]];
  }
  return kopija;
}
