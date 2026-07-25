/**
 * Apstrakcija pružatelja embeddinga (Anthropic ne nudi embedding API).
 *   - "openai" → text-embedding-3-small (1536 dim; zadano)
 *   - "voyage" → voyage-3 (1024 dim)
 * Dimenzija mora odgovarati EMBEDDING_DIM i vector(DIM) u supabase/schema.sql.
 */
import { config, requireEnv } from './config';

const BATCH_SIZE = 64;

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const vectors =
      config.embeddingProvider === 'voyage' ? await embedVoyage(batch) : await embedOpenAI(batch);
    for (const v of vectors) {
      if (v.length !== config.embeddingDim) {
        throw new Error(
          `Dimenzija embeddinga (${v.length}) ne odgovara EMBEDDING_DIM (${config.embeddingDim}). ` +
            'Uskladite ENV i stupac vector(DIM) u supabase/schema.sql.',
        );
      }
      out.push(v);
    }
  }
  return out;
}

export function l2norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: texts,
      dimensions: config.embeddingDim,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings: HTTP ${res.status} — ${await res.text()}`);
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function embedVoyage(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('VOYAGE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.embeddingModel, input: texts }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings: HTTP ${res.status} — ${await res.text()}`);
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
