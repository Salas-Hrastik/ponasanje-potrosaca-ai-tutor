import { supabaseAdmin } from './supabase';

export interface Odjeljak {
  id: string;
  poglavlje_id: string;
  broj: number;
  oznaka: string;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
  redoslijed: number;
}

export interface PoglavljeSaOdjeljcima {
  id: string;
  broj: number;
  naslov: string;
  dio: string;
  stranica_od: number;
  stranica_do: number;
  odjeljci: Odjeljak[];
}

export interface NapredakStanje {
  posjeceno: boolean;
  zavrseno: boolean;
}

/** Cijela karta kolegija: poglavlja (nastavne cjeline) s pripadajućim odjeljcima. */
export async function getPoglavlja(): Promise<PoglavljeSaOdjeljcima[]> {
  const admin = supabaseAdmin();
  const [{ data: poglavlja, error: e1 }, { data: odjeljci, error: e2 }] = await Promise.all([
    admin.from('poglavlja').select('id, broj, naslov, dio, stranica_od, stranica_do').order('broj'),
    admin
      .from('odjeljci')
      .select('id, poglavlje_id, broj, oznaka, naslov, stranica_od, stranica_do, redoslijed')
      .order('redoslijed'),
  ]);
  if (e1 || !poglavlja) return [];
  if (e2) return poglavlja.map((p) => ({ ...p, odjeljci: [] }));

  return poglavlja.map((p) => ({
    ...p,
    odjeljci: (odjeljci ?? []).filter((o) => o.poglavlje_id === p.id),
  }));
}

/**
 * Sve što stranica cjeline treba. Studentima se prikazuju samo ODOBRENI ciljevi
 * i kartice — nacrti pripremljeni iz teksta priručnika čekaju nastavnika.
 */
export async function getCjelina(broj: number) {
  const admin = supabaseAdmin();
  const { data: poglavlje, error } = await admin
    .from('poglavlja')
    .select('id, broj, naslov, dio, opis, stranica_od, stranica_do, sazetak_md')
    .eq('broj', broj)
    .single();
  if (error || !poglavlje) return null;

  // Paralelno — baza je udaljena, pa sekvencijalni upiti množe mrežnu latenciju.
  const [{ data: odjeljci }, { data: ciljevi }, { data: kartice }, { data: mediji }, { count }] =
    await Promise.all([
      admin
        .from('odjeljci')
        .select('id, broj, oznaka, naslov, stranica_od, stranica_do')
        .eq('poglavlje_id', poglavlje.id)
        .order('redoslijed'),
      admin
        .from('ciljevi_ucenja')
        .select('id, tekst, kognitivna_razina, stranica')
        .eq('poglavlje_id', poglavlje.id)
        .eq('odobreno', true)
        .order('redoslijed'),
      admin
        .from('kartice')
        .select('id, pojam, definicija, stranica_ref')
        .eq('poglavlje_id', poglavlje.id)
        .eq('odobreno', true)
        .order('redoslijed'),
      admin
        .from('mediji')
        .select('id, tip, naslov, url, trajanje_s')
        .eq('poglavlje_id', poglavlje.id)
        .order('redoslijed'),
      admin
        .from('kviz_pitanja')
        .select('*', { count: 'exact', head: true })
        .eq('poglavlje_id', poglavlje.id)
        .eq('odobreno', true),
    ]);

  return {
    poglavlje,
    odjeljci: odjeljci ?? [],
    ciljevi: ciljevi ?? [],
    kartice: kartice ?? [],
    mediji: mediji ?? [],
    brojPitanja: count ?? 0,
  };
}

export async function getNapredakMap(userId: string): Promise<Map<string, NapredakStanje>> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('napredak')
    .select('poglavlje_id, posjeceno, zavrseno')
    .eq('user_id', userId);
  const map = new Map<string, NapredakStanje>();
  for (const row of data ?? []) {
    map.set(row.poglavlje_id, { posjeceno: row.posjeceno, zavrseno: row.zavrseno });
  }
  return map;
}

/** Popis dopunskih izvora (izvora koje priručnik sam navodi). */
export async function getDopunskiIzvori() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('izvori')
    .select('id, naslov, autor, godina, napomena, url, ukupno_stranica')
    .eq('vrsta', 'dopunski')
    .order('naslov');
  return data ?? [];
}
