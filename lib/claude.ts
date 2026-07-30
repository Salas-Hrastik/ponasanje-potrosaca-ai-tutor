/** Poziv Claudeu s očekivanim STROGO JSON izlazom (vidi lib/prompt.ts sheme). */
import Anthropic from '@anthropic-ai/sdk';
import { config, requireEnv } from './config';

export interface NedovoljnoKonteksta {
  tip: 'nedovoljno_konteksta';
  poruka: string;
  predlozene_cjeline: string[];
  trazeni_metapodaci: string[];
}

export function nedovoljnoKonteksta(
  poruka: string,
  predlozeneCjeline: string[] = [],
): NedovoljnoKonteksta {
  return {
    tip: 'nedovoljno_konteksta',
    poruka,
    predlozene_cjeline: predlozeneCjeline,
    trazeni_metapodaci: ['poglavlje', 'stranica'],
  };
}

export async function askClaudeJson<T = unknown>(
  system: string,
  userMessage: string,
  maxTokens: number = config.claudeMaxTokens,
): Promise<T> {
  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const msg = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
    /**
     * JSON se traži kroz alat, a ne kao običan tekst. Kad je model pisao JSON
     * slobodno, citati iz priručnika koji sadrže navodnike znali su ubaciti
     * neescapiran " usred stringa i razbiti cijeli odgovor. Preko alata JSON
     * gradi SDK, pa je valjanost zajamčena bez obzira na sadržaj citata.
     * Shema ostaje opisana u sistemskom promptu (razlikuje se po vrsti upita).
     */
    tools: [
      {
        name: 'odgovori',
        description:
          'Vrati odgovor točno prema JSON shemi navedenoj u sistemskom promptu. Uvijek koristi ovaj alat.',
        input_schema: { type: 'object' as const, additionalProperties: true },
      },
    ],
    tool_choice: { type: 'tool', name: 'odgovori' },
  });

  const alat = msg.content.find((b) => b.type === 'tool_use');
  if (alat && alat.type === 'tool_use') return alat.input as T;

  // Rezervni put: model je ipak odgovorio tekstom (npr. starija verzija modela).
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
    console.error(
      `[claude] neparsabilan odgovor (stop_reason=${msg.stop_reason}, znakova=${text.length}):`,
      text.slice(-400),
    );
    return nedovoljnoKonteksta(
      'Odgovor modela nije bilo moguće protumačiti. Pokušajte ponovno ili preciznije postavite pitanje (npr. navedite poglavlje ili lekciju).',
    ) as T;
  }
}
