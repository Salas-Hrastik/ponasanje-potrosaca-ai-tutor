/**
 * Mjeri postojeću knjigu i ispisuje njezine norme u `data/mjere-knjige.json`.
 *
 * Zašto skripta, a ne popis napisan po sjećanju: predložak za novu knjigu vrijedi
 * onoliko koliko su mu brojke točne. Ovako se mjere mogu ponoviti nakon svake
 * izmjene sadržaja, pa predložak ne zastari.
 *
 * Mjeri se troje:
 *  1. anatomija — koliko dijelova, poglavlja, odjeljaka, stranica;
 *  2. norme izvedenih elemenata — koliko ciljeva, kartica, kviz pitanja i medija
 *     po cjelini te koliko su dugi;
 *  3. konvencije pisanja — koji se okviri („SAŽETAK POGLAVLJA", „PRIMJER IZ
 *     PRAKSE"…) ponavljaju kroz poglavlja i u koliko njih.
 *
 * Pokretanje:
 *   npm run knjiga:mjere
 */
import { writeFileSync } from 'fs';
import { supabaseAdmin } from '../lib/supabase';

const IZLAZ = 'data/mjere-knjige.json';

/** Okvir je redak velikim slovima nakon kojega slijedi „ · " — tako su pisani u priručniku. */
const OKVIR = /^([A-ZČĆŠĐŽ][A-ZČĆŠĐŽ0-9 ,()\/-]{7,70}) · /gm;

interface Raspon {
  n: number;
  min: number;
  med: number;
  max: number;
  prosjek: number;
}

function raspon(v: number[]): Raspon | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  return {
    n: v.length,
    min: s[0],
    med: s[Math.floor(s.length / 2)],
    max: s[s.length - 1],
    prosjek: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10,
  };
}

const rijeci = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function prebroji<T>(niz: T[], kljuc: (x: T) => string): Record<string, number> {
  return niz.reduce<Record<string, number>>((a, x) => {
    const k = kljuc(x);
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
}

async function main() {
  const db = supabaseAdmin();
  const [pog, odj, cilj, kart, kviz, med, chunk] = await Promise.all([
    db.from('poglavlja').select('*').order('broj').then((r) => r.data ?? []),
    db.from('odjeljci').select('*').order('redoslijed').then((r) => r.data ?? []),
    db.from('ciljevi_ucenja').select('*').then((r) => r.data ?? []),
    db.from('kartice').select('*').then((r) => r.data ?? []),
    db.from('kviz_pitanja').select('*').then((r) => r.data ?? []),
    db.from('mediji').select('*').then((r) => r.data ?? []),
    db.from('chunkovi').select('tokens_est, kljucne_rijeci').then((r) => r.data ?? []),
  ]);

  // Okviri se broje po poglavljima, ne po pojavljivanjima: zanima nas koliko je
  // poglavlja usvojilo koji okvir, jer to je ono što se prenosi kao konvencija.
  const okviri: Record<string, number[]> = {};
  for (const p of pog) {
    for (const naziv of new Set(
      [...((p.sazetak_md as string) || '').matchAll(OKVIR)].map((m) => m[1]),
    )) {
      (okviri[naziv] ??= []).push(p.broj);
    }
  }

  const poPoglavlju = pog.map((p) => {
    const md = (p.sazetak_md as string) || '';
    const odlomci = md.split(/\n{2,}/).filter((x) => x.trim() && !x.startsWith('#'));
    return {
      broj: p.broj,
      naslov: p.naslov,
      dio: p.dio,
      stranice: `${p.stranica_od}–${p.stranica_do}`,
      brojStranica: p.stranica_do - p.stranica_od + 1,
      odjeljaka: odj.filter((x) => x.poglavlje_id === p.id).length,
      rijeciSazetka: rijeci(md),
      odlomaka: odlomci.length,
      ciljeva: cilj.filter((x) => x.poglavlje_id === p.id).length,
      kartica: kart.filter((x) => x.poglavlje_id === p.id).length,
      kvizPitanja: kviz.filter((x) => x.poglavlje_id === p.id).length,
      medija: med.filter((x) => x.poglavlje_id === p.id).map((x) => x.tip),
    };
  });

  const sSadrzajem = poPoglavlju.filter((p) => p.ciljeva > 0);
  const dijelovi = [...new Set(pog.map((p) => p.dio))];

  const mjere = {
    izmjereno: new Date().toISOString().slice(0, 10),
    anatomija: {
      poglavlja: pog.length,
      dijelovi: dijelovi.map((d) => ({
        naslov: d,
        poglavlja: pog.filter((p) => p.dio === d).map((p) => p.broj),
      })),
      odjeljaka: odj.length,
      stranica: Math.max(...pog.map((p) => p.stranica_do)),
    },
    raspodjela: {
      stranicaPoPoglavlju: raspon(sSadrzajem.map((p) => p.brojStranica)),
      odjeljakaPoPoglavlju: raspon(sSadrzajem.map((p) => p.odjeljaka)),
      stranicaPoOdjeljku: raspon(odj.map((o) => o.stranica_do - o.stranica_od + 1)),
      rijeciPoPoglavlju: raspon(sSadrzajem.map((p) => p.rijeciSazetka)),
      odlomakaPoPoglavlju: raspon(sSadrzajem.map((p) => p.odlomaka)),
    },
    okviriPoglavlja: Object.entries(okviri)
      .map(([naziv, u]) => ({ naziv, uPoglavljima: u.length, poglavlja: u }))
      .sort((a, b) => b.uPoglavljima - a.uPoglavljima),
    ciljevi: {
      poCjelini: raspon(sSadrzajem.map((p) => p.ciljeva)),
      rijeciPoCilju: raspon(cilj.map((c) => rijeci(c.tekst))),
      poRazini: prebroji(cilj, (c) => c.kognitivna_razina || '(bez razine)'),
    },
    kartice: {
      poCjelini: raspon(sSadrzajem.map((p) => p.kartica)),
      rijeciPojma: raspon(kart.map((k) => rijeci(k.pojam))),
      rijeciDefinicije: raspon(kart.map((k) => rijeci(k.definicija))),
    },
    kviz: {
      poCjelini: raspon(sSadrzajem.map((p) => p.kvizPitanja)),
      odgovoraPoPitanju: raspon(kviz.map((q) => (Array.isArray(q.odgovori) ? q.odgovori.length : 0))),
      rijeciPitanja: raspon(kviz.map((q) => rijeci(q.pitanje))),
      rijeciObjasnjenja: raspon(kviz.map((q) => rijeci(q.objasnjenje))),
      // Pozicija točnog odgovora: ako je iskošena, studenti pogađaju položaj
      // umjesto gradiva. Vidi napomenu u docs/PREDLOZAK-NOVE-KNJIGE.md.
      poPolozajuTocnog: prebroji(kviz, (q) => String(q.tocan_index)),
    },
    mediji: {
      poTipu: prebroji(med, (m) => m.tip),
      trajanjeMin: raspon(
        med.filter((m) => m.trajanje_s).map((m) => Math.round((m.trajanje_s as number) / 60)),
      ),
    },
    rag: {
      chunkova: chunk.length,
      tokenaPoChunku: raspon(chunk.map((c) => c.tokens_est)),
      kljucnihRijeci: raspon(chunk.map((c) => (c.kljucne_rijeci ?? []).length)),
    },
    poPoglavlju,
  };

  writeFileSync(IZLAZ, `${JSON.stringify(mjere, null, 2)}\n`);
  console.log(`[mjere] ${IZLAZ}`);
  console.log(
    `[mjere] ${mjere.anatomija.poglavlja} poglavlja · ${mjere.anatomija.odjeljaka} odjeljaka · ` +
      `${mjere.anatomija.stranica} stranica`,
  );
  for (const o of mjere.okviriPoglavlja) {
    console.log(`[okvir] ${o.naziv} — u ${o.uPoglavljima} poglavlja (${o.poglavlja.join(', ')})`);
  }
}

main();
