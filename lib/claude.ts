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
  model: string = config.claudeModel,
): Promise<T> {
  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const msg = await anthropic.messages.create({
    model,
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
  if (alat && alat.type === 'tool_use') return normalizirajPrijelome(alat.input) as T;

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

/**
 * Model povremeno dvostruko escapira prijelome, pa u tekstu odgovora završi
 * doslovni niz „\n" umjesto novog retka — u chatu se to vidi kao smeće usred
 * rečenice. Hrvatski tekst priručnika nikad ne sadrži obrnutu kosu crtu ispred
 * n/t, pa je zamjena sigurna. Prolazi se kroz cijelu strukturu jer prijelomi
 * mogu biti i u citatima, savjetima i idealnom odgovoru.
 */
function normalizirajPrijelome(vrijednost: unknown): unknown {
  if (typeof vrijednost === 'string') {
    return vrijednost.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }
  if (Array.isArray(vrijednost)) return vrijednost.map(normalizirajPrijelome);
  if (vrijednost && typeof vrijednost === 'object') {
    return Object.fromEntries(
      Object.entries(vrijednost as Record<string, unknown>).map(([k, v]) => [
        k,
        normalizirajPrijelome(v),
      ]),
    );
  }
  return vrijednost;
}

/**
 * Strujanje odgovora u čistom tekstu — za usmeni razgovor.
 *
 * Vraća asinkroni niz komadića teksta kako nastaju, da se prve rečenice mogu
 * odmah izgovoriti umjesto da se čeka cijeli odgovor.
 */
export async function* streamClaudeText(
  system: string,
  userMessage: string,
  maxTokens: number = config.usmeniMaxTokens,
  model: string = config.usmeniModel,
): AsyncGenerator<string> {
  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const tok = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const dogadjaj of tok) {
    if (
      dogadjaj.type === 'content_block_delta' &&
      dogadjaj.delta.type === 'text_delta' &&
      dogadjaj.delta.text
    ) {
      yield dogadjaj.delta.text;
    }
  }
}
