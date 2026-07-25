/**
 * Dijeljenje teksta na isječke (chunkove) za RAG.
 *
 * Heuristika: tekst se dijeli po odlomcima (prazni redci), a odlomci se pakiraju
 * u isječke ciljane veličine MAX_CHUNK_TOKENS (~4 znaka po tokenu) s preklapanjem
 * CHUNK_OVERLAP_TOKENS radi očuvanja konteksta na rubovima.
 */
import { config } from './config';

export interface RawChunk {
  chunk_index: number;
  text: string;
  tokens_est: number;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // Rastavljena riječ na kraju retka ("proi-\nzvoda" → "proizvoda"); spaja se
    // samo malo slovo + crtica + novi red + malo slovo, da se ne diraju
    // legitimne polusloženice unutar retka.
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkText(
  rawText: string,
  maxTokens: number = config.maxChunkTokens,
  overlapTokens: number = config.chunkOverlapTokens,
): RawChunk[] {
  const text = normalizeText(rawText);
  if (!text) return [];

  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  const paragraphs = text
    .split(/\n\s*\n/)
    .flatMap((p) => (p.length > maxChars ? splitBySentences(p, maxChars) : [p]))
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: RawChunk[] = [];
  let buffer = '';

  const flush = () => {
    const t = buffer.trim();
    if (t.length > 0) {
      chunks.push({ chunk_index: chunks.length, text: t, tokens_est: estimateTokens(t) });
    }
  };

  for (const para of paragraphs) {
    if (buffer.length + para.length + 2 > maxChars && buffer.length > 0) {
      flush();
      buffer = buffer.slice(Math.max(0, buffer.length - overlapChars));
    }
    buffer += (buffer ? '\n\n' : '') + para;
  }
  flush();

  return chunks;
}

export function splitBySentences(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [paragraph];
  const parts: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf.length + s.length > maxChars && buf) {
      parts.push(buf.trim());
      buf = '';
    }
    buf += s;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/** Gruba ekstrakcija ključnih riječi (najčešće duže riječi, bez uobičajenih veznika). */
const STOPWORDS = new Set([
  'koji', 'koja', 'koje', 'kojih', 'kojim', 'kojima', 'ovaj', 'ova', 'ovo', 'ove', 'ovih',
  'tako', 'kako', 'gdje', 'kada', 'zato', 'jer', 'ali', 'ili', 'nego', 'nije', 'jesu', 'biti',
  'kroz', 'preko', 'prema', 'između', 'unutar', 'izvan', 'radi', 'osim', 'poput', 'odnosno',
  'njihov', 'njihova', 'njihovo', 'svoje', 'svoj', 'svoja', 'ovim', 'ovime', 'takve', 'takva',
  'više', 'manje', 'često', 'uvijek', 'zbog', 'iako', 'dok', 'time', 'samo', 'svaki', 'svaka',
]);

export function extractKeywords(text: string, max = 8): string[] {
  const freq = new Map<string, number>();
  const words = text.toLowerCase().normalize('NFC').match(/\p{L}{4,}/gu) ?? [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}
