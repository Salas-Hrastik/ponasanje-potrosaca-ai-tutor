/**
 * Reranking dohvaćenih isječaka — brzi, manji model (Claude Haiku) presloži
 * kandidate po stvarnoj relevantnosti za pitanje. Otporno na greške: ako rerank
 * zakaže, vraća se izvorni poredak — dohvat nikad ne pada zbog reranka.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import type { RetrievedChunk } from './retrieval';

const SNIPPET_CHARS = 450;
const RERANK_TIMEOUT_MS = 8000;

export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  topN: number,
): Promise<RetrievedChunk[]> {
  if (!config.ragRerank || chunks.length <= topN) return chunks.slice(0, topN);

  try {
    const lista = chunks
      .map(
        (c, i) =>
          `[${i}] (${c.naslovOdjeljka || c.odjeljakNaslov || c.izvorNaslov}, str. ${c.stranicaOd}-${c.stranicaDo})\n${c.text.slice(0, SNIPPET_CHARS)}`,
      )
      .join('\n\n');

    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create(
      {
        model: config.rerankModel,
        max_tokens: 80,
        system:
          'Ti odabireš izvore (isječke priručnika o ponašanju potrošača u turizmu) za odgovor studentu. ' +
          `Na temelju pitanja vrati indekse isječaka koji NAJBOLJE sadrže odgovor, najrelevantniji prvi, najviše ${topN}. ` +
          'Odgovori ISKLJUČIVO zarezom odvojenim indeksima (npr. "3,0,7"). Bez objašnjenja.',
        messages: [{ role: 'user', content: `Pitanje: ${query}\n\nIsječci:\n${lista}` }],
      },
      { timeout: RERANK_TIMEOUT_MS, maxRetries: 0 },
    );

    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const ids = [...text.matchAll(/\d+/g)]
      .map((m) => parseInt(m[0], 10))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < chunks.length);
    if (ids.length === 0) return chunks.slice(0, topN);

    const vidjeni = new Set<number>();
    const ranked: RetrievedChunk[] = [];
    for (const i of ids) {
      if (!vidjeni.has(i)) {
        vidjeni.add(i);
        ranked.push(chunks[i]);
      }
    }
    for (let i = 0; i < chunks.length; i++) {
      if (!vidjeni.has(i)) ranked.push(chunks[i]);
    }
    return ranked.slice(0, topN);
  } catch (e) {
    console.error('[rerank] greška — koristim izvorni poredak:', e);
    return chunks.slice(0, topN);
  }
}
