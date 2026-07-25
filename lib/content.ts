import { supabaseAdmin } from './supabase';

export interface LekcijaSazetak {
  id: string;
  poglavlje_id: string;
  broj: number;
  oznaka: string;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
  redoslijed: number;
}

export interface PoglavljeSaLekcijama {
  id: string;
  broj: number;
  naslov: string;
  dio: string;
  stranica_od: number;
  stranica_do: number;
  lekcije: LekcijaSazetak[];
}

export interface NapredakStanje {
  posjeceno: boolean;
  zavrseno: boolean;
}

export async function getPoglavljaSaLekcijama(): Promise<PoglavljeSaLekcijama[]> {
  const admin = supabaseAdmin();
  const [{ data: poglavlja, error: e1 }, { data: lekcije, error: e2 }] = await Promise.all([
    admin.from('poglavlja').select('id, broj, naslov, dio, stranica_od, stranica_do').order('broj'),
    admin
      .from('lekcije')
      .select('id, poglavlje_id, broj, oznaka, naslov, stranica_od, stranica_do, redoslijed')
      .order('redoslijed'),
  ]);
  if (e1 || !poglavlja) return [];
  if (e2) return poglavlja.map((p) => ({ ...p, lekcije: [] }));

  return poglavlja.map((p) => ({
    ...p,
    lekcije: (lekcije ?? []).filter((l) => l.poglavlje_id === p.id),
  }));
}

export async function getLekcijaDetalji(lekcijaId: string) {
  const admin = supabaseAdmin();
  const { data: lekcija, error } = await admin
    .from('lekcije')
    .select(
      'id, broj, oznaka, naslov, stranica_od, stranica_do, sazetak_md, poglavlje_id, poglavlja(broj, naslov)',
    )
    .eq('id', lekcijaId)
    .single();
  if (error || !lekcija) return null;

  // Paralelno — svaka sekvencijalna tura do baze košta ~duljinu mrežnog puta.
  const [{ data: ciljevi }, { data: mediji }] = await Promise.all([
    admin
      .from('ciljevi_ucenja')
      .select('id, tekst, kognitivna_razina, stranica, odobreno')
      .eq('lekcija_id', lekcijaId)
      .order('redoslijed'),
    admin
      .from('mediji')
      .select('id, tip, naslov, url, trajanje_s')
      .eq('lekcija_id', lekcijaId)
      .order('redoslijed'),
  ]);

  return { lekcija, ciljevi: ciljevi ?? [], mediji: mediji ?? [] };
}

/** Broj odobrenih kviz pitanja za poglavlje (za prikaz na gumbu kviza). */
export async function getBrojOdobrenihPitanja(poglavljeId: string): Promise<number> {
  const admin = supabaseAdmin();
  const { count } = await admin
    .from('kviz_pitanja')
    .select('*', { count: 'exact', head: true })
    .eq('poglavlje_id', poglavljeId)
    .eq('odobreno', true);
  return count ?? 0;
}

export async function getNapredakMap(userId: string): Promise<Map<string, NapredakStanje>> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('napredak')
    .select('lekcija_id, posjeceno, zavrseno')
    .eq('user_id', userId);
  const map = new Map<string, NapredakStanje>();
  for (const row of data ?? []) {
    map.set(row.lekcija_id, { posjeceno: row.posjeceno, zavrseno: row.zavrseno });
  }
  return map;
}

/** Popis dopunskih izvora (npr. industrijska izvješća navedena u priručniku). */
export async function getDopunskiIzvori() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('izvori')
    .select('id, naslov, autor, godina, napomena, url, ukupno_stranica')
    .eq('vrsta', 'dopunski')
    .order('naslov');
  return data ?? [];
}
