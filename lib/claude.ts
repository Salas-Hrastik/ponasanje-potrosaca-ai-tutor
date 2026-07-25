/** Poziv Claudeu s očekivanim STROGO JSON izlazom (vidi lib/prompt.ts sheme). */
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';

export interface NedovoljnoKonteksta {
  tip: 'nedovoljno_konteksta';
  poruka: string;
  predlozene_lekcije: string[];
  trazeni_metapodaci: string[];
}

export function nedovoljnoKonteksta(
  poruka: string,
  predlozeneLekcije: string[] = [],
): NedovoljnoKonteksta {
  return {
    tip: 'nedovoljno_konteksta',
    poruka,
    predlozene_lekcije: predlozeneLekcije,
    trazeni_metapodaci: ['poglavlje', 'stranica'],
  };
}

export async function askClaudeJson<T = unknown>(
  system: string,
  userMessage: string,
  maxTokens: number = config.claudeMaxTokens,
): Promise<T> {
  const anthropic = new Anthropic();
  const msg = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();

  try {
    return JSON.parse(text) as T;
  } catch {
    // Model ponekad doda markdown ogradu unatoč uputi — pokušaj izvući JSON blok.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        // padni na sigurnu vrijednost niže
      }
    }
    console.error('[claude] neparsabilan odgovor:', text.slice(0, 500));
    return nedovoljnoKonteksta(
      'Odgovor modela nije bilo moguće protumačiti. Pokušajte ponovno ili preciznije postavite pitanje (npr. navedite poglavlje ili lekciju).',
    ) as T;
  }
}
