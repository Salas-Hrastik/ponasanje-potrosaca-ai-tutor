/**
 * Upis samostalne cjeline (data/cjeline/*.md) u bazu: izvor, poglavlje sa
 * sažetkom, odjeljci, isječci i ugradnje. Koristi je `npm run ingest:cjelina`.
 */
import { parsirajCjelinu } from './cjelina-md';
import { sazetakMarkdown, sazetakPoglavlja } from './prirucnik';
import { extractKeywords } from './chunking';
import { izradiIsjecke } from './isjecci';
import { embedTexts, l2norm } from './embeddings';
import { supabaseAdmin } from './supabase';

export async function ucitajCjelinu(
  md: string,
  { suho = false, log = console.log }: { suho?: boolean; log?: (poruka: string) => void } = {},
): Promise<{ broj: number; isjecaka: number }> {
  const { meta, poglavlje } = parsirajCjelinu(md);
  log(
    `[cjelina] ${meta.broj}. ${meta.naslov} — ${poglavlje.lekcije.length} odjeljaka, str. ${poglavlje.stranicaOd}–${poglavlje.stranicaDo}`,
  );

  const sb = suho ? null : supabaseAdmin();

  let izvorId = 'SUHO';
  let poglavljeId: string | null = null;
  if (sb) {
    const { data: izvor, error: e1 } = await sb
      .from('izvori')
      .upsert(
        {
          oznaka: meta.izvor_oznaka,
          vrsta: 'prirucnik',
          naslov: meta.izvor_naslov,
          autor: meta.izvor_autor,
          godina: meta.izvor_godina,
          jezik: 'hr',
          napomena: meta.izvor_napomena,
          ukupno_stranica: meta.ukupno_stranica,
        },
        { onConflict: 'oznaka' },
      )
      .select('id')
      .single();
    if (e1) throw new Error(`upsert izvora: ${e1.message}`);
    izvorId = izvor.id;

    const { data: pog, error: e2 } = await sb
      .from('poglavlja')
      .upsert(
        {
          broj: meta.broj,
          naslov: meta.naslov,
          dio: meta.dio,
          stranica_od: poglavlje.stranicaOd,
          stranica_do: poglavlje.stranicaDo,
          sazetak_md: sazetakPoglavlja(poglavlje),
        },
        { onConflict: 'broj' },
      )
      .select('id')
      .single();
    if (e2) throw new Error(`upsert poglavlja (${meta.broj}): ${e2.message}`);
    poglavljeId = pog.id;
  }

  let ukupnoIsjecaka = 0;
  for (const [i, lek] of poglavlje.lekcije.entries()) {
    const odjBroj = meta.odjeljak_od + i;
    const odjMeta = {
      oznaka: lek.oznaka,
      naslov: lek.naslov,
      stranica_od: lek.stranicaOd,
      stranica_do: lek.stranicaDo,
    };
    const isjecci = izradiIsjecke(lek, odjMeta);
    ukupnoIsjecaka += isjecci.length;
    log(
      `[cjelina] ${lek.oznaka} „${lek.naslov}" (str. ${lek.stranicaOd}–${lek.stranicaDo}): ${isjecci.length} isječaka`,
    );
    if (!sb) continue;

    const { data: odj, error: e3 } = await sb
      .from('odjeljci')
      .upsert(
        {
          poglavlje_id: poglavljeId,
          broj: odjBroj,
          oznaka: lek.oznaka,
          naslov: lek.naslov,
          stranica_od: lek.stranicaOd,
          stranica_do: lek.stranicaDo,
          redoslijed: odjBroj,
          sazetak_md: sazetakMarkdown(lek),
        },
        { onConflict: 'poglavlje_id,broj' },
      )
      .select('id')
      .single();
    if (e3) throw new Error(`upsert odjeljka (${lek.oznaka}): ${e3.message}`);

    if (isjecci.length === 0) continue;
    const ugradnje = await embedTexts(isjecci.map((c) => c.text));
    const { error: e4 } = await sb.rpc('upsert_chunkovi', {
      p_izvor_id: izvorId,
      p_odjeljak_id: odj.id,
      p_chunks: isjecci.map((c, j) => ({
        ...c,
        kljucne_rijeci: extractKeywords(c.text),
        embedding: ugradnje[j],
        norm: l2norm(ugradnje[j]),
      })),
    });
    if (e4) throw new Error(`upsert_chunkovi (${lek.oznaka}): ${e4.message}`);
  }

  return { broj: meta.broj, isjecaka: ukupnoIsjecaka };
}
