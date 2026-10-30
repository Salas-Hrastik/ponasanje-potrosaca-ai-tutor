/**
 * Isječci odjeljka uz praćenje stranica — zajedničko za ingest priručnika
 * (DOCX) i ingest samostalne cjeline zapisane u Markdownu (data/cjeline/).
 */
import { config } from './config';
import { normalizeText, splitBySentences } from './chunking';
import { blokoviZaChunking, type SegLekcija } from './prirucnik';

export interface IsjecakMeta {
  oznaka: string;
  naslov: string;
  stranica_od: number;
  stranica_do: number;
}

export interface Isjecak {
  chunk_index: number;
  text: string;
  tokens_est: number;
  stranica_od: number;
  stranica_do: number;
  naslov_odjeljka: string;
}

/**
 * Chunking uz praćenje stranica: blokovi se pakiraju do MAX_CHUNK_TOKENS, a
 * svakom isječku se pamti najmanja i najveća stranica blokova koje sadrži —
 * odatle dolazi raspon stranica u citatu.
 */
export function izradiIsjecke(lek: SegLekcija, meta: IsjecakMeta): Isjecak[] {
  const maxChars = config.maxChunkTokens * 4;
  const overlapChars = config.chunkOverlapTokens * 4;
  const oznakaOdjeljka = meta.oznaka ? `${meta.oznaka} ${meta.naslov}` : meta.naslov;

  const blokovi = blokoviZaChunking(lek).flatMap((b) => {
    const tekst = normalizeText(b.tekst);
    if (tekst.length <= maxChars) return [{ ...b, tekst }];
    return splitBySentences(tekst, maxChars).map((dio) => ({ ...b, tekst: dio }));
  });

  const isjecci: Isjecak[] = [];
  let buffer = '';
  let odjeljak = oznakaOdjeljka;
  let pMin = Infinity;
  let pMax = -Infinity;

  const flush = () => {
    const t = buffer.trim();
    if (!t) return;
    isjecci.push({
      chunk_index: isjecci.length,
      text: t,
      tokens_est: Math.ceil(t.length / 4),
      stranica_od: Number.isFinite(pMin) ? pMin : meta.stranica_od,
      stranica_do: Number.isFinite(pMax) ? pMax : meta.stranica_do,
      naslov_odjeljka: odjeljak,
    });
  };

  for (const b of blokovi) {
    if (buffer.length + b.tekst.length + 2 > maxChars && buffer.length > 0) {
      flush();
      buffer = buffer.slice(Math.max(0, buffer.length - overlapChars));
      pMin = b.stranica;
      pMax = b.stranica;
    }
    buffer += (buffer ? '\n\n' : '') + b.tekst;
    odjeljak = b.pododjeljak ? `${oznakaOdjeljka} — ${b.pododjeljak}` : oznakaOdjeljka;
    pMin = Math.min(pMin, b.stranica);
    pMax = Math.max(pMax, b.stranica);
  }
  flush();

  return isjecci;
}
