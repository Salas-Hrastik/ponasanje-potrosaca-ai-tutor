import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import fs from 'node:fs';
import path from 'node:path';

const EXPORT_SECRET = 'export-moodle-2026-privremeno';

function ucitajSlajdove(broj: number) {
  try {
    const put = path.join(process.cwd(), 'data', 'slajdovi', `poglavlje-${broj}.json`);
    if (!fs.existsSync(put)) return null;
    return JSON.parse(fs.readFileSync(put, 'utf8'));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (request.headers.get('x-export-secret') !== EXPORT_SECRET) {
    return NextResponse.json({ greska: 'Nije ovlašteno.' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const [{ data: poglavlja }, { data: odjeljci }, { data: ciljevi }, { data: kartice }, { data: mediji }, { data: pitanja }] =
    await Promise.all([
      admin.from('poglavlja').select('id, broj, naslov, dio, opis, stranica_od, stranica_do, sazetak_md').order('broj'),
      admin.from('odjeljci').select('id, poglavlje_id, broj, oznaka, naslov, stranica_od, stranica_do, redoslijed').order('redoslijed'),
      admin.from('ciljevi_ucenja').select('id, poglavlje_id, tekst, kognitivna_razina, stranica, odobreno').eq('odobreno', true).order('redoslijed'),
      admin.from('kartice').select('id, poglavlje_id, pojam, definicija, stranica_ref, odobreno').eq('odobreno', true).order('redoslijed'),
      admin.from('mediji').select('id, poglavlje_id, tip, naslov, url, trajanje_s').order('redoslijed'),
      admin.from('kviz_pitanja').select('id, poglavlje_id, pitanje, odgovori, tocan_index, objasnjenje, stranica_ref, odobreno').eq('odobreno', true),
    ]);

  const rezultat = (poglavlja ?? []).map((p) => ({
    ...p,
    odjeljci: (odjeljci ?? []).filter((o) => o.poglavlje_id === p.id),
    ciljevi: (ciljevi ?? []).filter((c) => c.poglavlje_id === p.id),
    kartice: (kartice ?? []).filter((k) => k.poglavlje_id === p.id),
    mediji: (mediji ?? []).filter((m) => m.poglavlje_id === p.id),
    pitanja: (pitanja ?? []).filter((q) => q.poglavlje_id === p.id),
    slajdovi: ucitajSlajdove(p.broj),
  }));

  return NextResponse.json({ poglavlja: rezultat }, { headers: { 'Cache-Control': 'no-store' } });
}
