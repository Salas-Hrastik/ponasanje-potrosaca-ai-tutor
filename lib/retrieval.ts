/**
 * Retrieval — hibridni RAG dohvat (pgvector + full-text) uz rerank manjim modelom.
 *
 * Opseg dohvata (scope) ovisi o načinu rada:
 *   - poglavljeId zadan → dohvat iz cijele cjeline (chat u cjelini, kviz, usmena vježba)
 *   - odjeljakId zadan  → suženje na jedan odjeljak (npr. ciljano pitanje o 4.4)
 *   - ništa zadano      → dohvat iz cijelog priručnika (opći chat)
 *
 * Dopunski izvori (npr. industrijska izvješća navedena u priručniku) NISU u
 * zadanom opsegu: uključuju se samo eksplicitno (`ukljuciDopunske`), i uvijek
 * se u citatima označavaju kao dopunski, da priručnik ostane izvor istine.
 */
import { config } from './config';
import { embedText } from './embeddings';
import { rerankChunks } from './rerank';
import { supabaseAdmin } from './supabase';

export interface RetrievedChunk {
  chunkId: string;
  text: string;
  izvorVrsta: 'prirucnik' | 'dopunski';
  izvorNaslov: string;
  odjeljakId: string | null;
  odjeljakNaslov: string;
  naslovOdjeljka: string;
  stranicaOd: number;
  stranicaDo: number;
  poglavljeBroj: number | null;
  poglavljeNaslov: string;
  score: number;
}

export interface RetrieveOptions {
  poglavljeId?: string;
  odjeljakId?: string;
  topK?: number;
  ukljuciDopunske?: boolean;
}

type RpcRow = {
  chunk_id: string;
  text: string;
  izvor_vrsta: 'prirucnik' | 'dopunski';
  izvor_naslov: string;
  odjeljak_id: string | null;
  odjeljak_naslov: string | null;
  naslov_odjeljka: string | null;
  stranica_od: number;
  stranica_do: number;
  poglavlje_broj: number | null;
  poglavlje_naslov: string | null;
  score: number;
};

function fromRow(r: RpcRow): RetrievedChunk {
  return {
    chunkId: r.chunk_id,
    text: r.text,
    izvorVrsta: r.izvor_vrsta,
    izvorNaslov: r.izvor_naslov,
    odjeljakId: r.odjeljak_id,
    odjeljakNaslov: r.odjeljak_naslov ?? '',
    naslovOdjeljka: r.naslov_odjeljka ?? '',
    stranicaOd: r.stranica_od,
    stranicaDo: r.stranica_do,
    poglavljeBroj: r.poglavlje_broj,
    poglavljeNaslov: r.poglavlje_naslov ?? '',
    score: r.score,
  };
}

export async function retrieve(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? config.ragTopK;
  const sb = supabaseAdmin();
  const poolSize = config.ragRerank ? Math.max(topK * 3, 24) : topK;

  const params = {
    match_count: poolSize,
    p_odjeljak_id: options.odjeljakId ?? null,
    p_poglavlje_id: options.poglavljeId ?? null,
    p_ukljuci_dopunske: options.ukljuciDopunske ?? false,
  };

  const queryEmbedding = await embedText(query);
  const [{ data: vecRows, error: vecErr }, { data: ftsRows, error: ftsErr }] = await Promise.all([
    sb.rpc('match_chunks', { ...params, query_embedding: JSON.stringify(queryEmbedding) }),
    sb.rpc('search_chunks_fts', { ...params, query_text: lexicalQuery(query) }),
  ]);
  if (vecErr) throw new Error(`match_chunks: ${vecErr.message}`);

  const vec: RetrievedChunk[] = ((vecRows ?? []) as RpcRow[]).map(fromRow);
  const vecIds = new Set(vec.map((r) => r.chunkId));
  const fts: RetrievedChunk[] = ftsErr
    ? []
    : ((ftsRows ?? []) as RpcRow[]).map(fromRow).filter((r) => !vecIds.has(r.chunkId));

  // Ispreplitanje vektorskih i FTS kandidata — svaki treći iz FTS-a, tako da
  // leksički pogodci (npr. rijetki termini poput "eVisitor") nikad ne ispadnu.
  const candidates: RetrievedChunk[] = [];
  let vi = 0;
  let fi = 0;
  let k = 0;
  while ((vi < vec.length || fi < fts.length) && candidates.length < poolSize) {
    const uzmiFts = (k % 3 === 2 && fi < fts.length) || vi >= vec.length;
    const r = uzmiFts ? fts[fi++] : vec[vi++];
    if (r) candidates.push(r);
    k++;
  }

  const ordered = await rerankChunks(query, candidates, Math.min(candidates.length, config.ragRerankTopN + 2));

  // Deduplikacija: najviše 2 isječka po odjeljku, ograničeno proračunom znakova.
  const poOdjeljku = new Map<string, number>();
  const final: RetrievedChunk[] = [];
  let budget = config.ragContextCharBudget;
  for (const r of ordered) {
    const kljuc = r.odjeljakId ?? `dopunski:${r.izvorNaslov}`;
    const n = poOdjeljku.get(kljuc) ?? 0;
    if (n >= 2) continue;
    if (r.text.length > budget) continue;
    poOdjeljku.set(kljuc, n + 1);
    budget -= r.text.length;
    final.push(r);
    if (final.length >= topK) break;
  }
  return final;
}

/**
 * Ima li dohvat dovoljno pokrića da se uopće smije odgovarati?
 * Koristi se za brzo, deterministično odbijanje prije poziva modelu — jeftinije
 * je i pouzdanije nego se osloniti samo na to da model sam prizna neznanje.
 */
export function dovoljnoKonteksta(chunks: RetrievedChunk[]): boolean {
  if (chunks.length === 0) return false;
  const najbolji = Math.max(...chunks.map((c) => c.score));
  return najbolji >= config.ragMinScore;
}

function lexicalQuery(query: string): string {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 4);
  return words.length > 0 ? words.join(' ') : query;
}

export interface Citat {
  poglavlje: string;
  stranice: string;
  isjecak?: string;
  izvor?: string;
}

/** Format citata za JSON izlaz: {poglavlje, stranice, isjecak}. */
export function toCitations(chunks: RetrievedChunk[]): Citat[] {
  const byKey = new Map<string, Citat>();
  for (const c of chunks) {
    const kljuc = `${c.izvorVrsta}-${c.poglavljeBroj}-${c.stranicaOd}-${c.stranicaDo}`;
    if (byKey.has(kljuc)) continue;
    const poglavlje =
      c.izvorVrsta === 'prirucnik'
        ? `Pogl. ${c.poglavljeBroj}. ${c.poglavljeNaslov}${c.naslovOdjeljka ? ` — ${c.naslovOdjeljka}` : ''}`
        : `Dopunski izvor: ${c.izvorNaslov}`;
    byKey.set(kljuc, {
      poglavlje,
      stranice: c.stranicaOd === c.stranicaDo ? `${c.stranicaOd}` : `${c.stranicaOd}–${c.stranicaDo}`,
      isjecak: c.text.slice(0, 220).trim() + (c.text.length > 220 ? '…' : ''),
      izvor: c.izvorVrsta,
    });
  }
  return [...byKey.values()];
}
