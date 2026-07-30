/** Središnja konfiguracija aplikacije. ENV varijable nadjačavaju zadane vrijednosti. */

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export const config = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'Ponašanje potrošača u turizmu — AI asistent kolegija',
  assistantName: process.env.NEXT_PUBLIC_ASSISTANT_NAME || 'Vita',
  ustanova: process.env.NEXT_PUBLIC_USTANOVA || 'Veleučilište Baltazar Zaprešić',
  /**
   * Autor priručnika. Isporučeni dokument ga ne navodi, pa se postavlja ovdje;
   * prazna vrijednost znači da se potpis nigdje ne prikazuje.
   */
  autorPrirucnika: process.env.NEXT_PUBLIC_AUTOR_PRIRUCNIKA || 'prof. dr. sc. Drago Ružić',
  kolegij: 'Ponašanje potrošača u turizmu',
  studij: 'Management u turizmu i ugostiteljstvu',

  /**
   * Autentikacija je u cijelosti implementirana, ali NAMJERNO UMIROVLJENA do
   * završetka izrade asistenta. Dok je isključena, napredak se veže uz
   * anonimni identifikator gosta iz kolačića (vidi lib/auth.ts).
   */
  authEnabled: bool('AUTH_ENABLED', false),

  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  claudeMaxTokens: int('CLAUDE_MAX_TOKENS', 3000),

  /**
   * Usmeni razgovor: odgovor se SLUŠA, pa mora biti kratak, a odgovor se struji
   * pa se prva rečenica izgovara prije nego što je cjelina gotova.
   *
   * Model je Sonnet, ne Haiku: Haiku je bio ~1 s brži do prve rečenice, ali je
   * u hrvatskom griješio ("neizvješan", "nešto pošli po zlu", "Krećemo s
   * Poglavlja 1") i ignorirao zabranu Markdowna. Za alat koji studentima čita
   * naglas ta je razlika skuplja od sekunde.
   */
  usmeniModel: process.env.USMENI_MODEL || 'claude-sonnet-5',
  usmeniMaxTokens: int('USMENI_MAX_TOKENS', 400),
  usmeniTopK: int('USMENI_TOP_K', 6),

  embeddingProvider: (process.env.EMBEDDING_PROVIDER || 'openai') as 'openai' | 'voyage',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDim: int('EMBEDDING_DIM', 1536),

  asrModel: process.env.ASR_MODEL || 'whisper-1',
  ttsModel: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
  ttsVoice: process.env.TTS_VOICE || 'alloy',

  ragTopK: int('RAG_TOP_K', 10),
  ragRerankTopN: int('RAG_RERANK_TOP_N', 6),
  ragRerank: bool('RAG_RERANK', true),
  rerankModel: process.env.RERANK_MODEL || 'claude-haiku-4-5-20251001',
  ragContextCharBudget: int('RAG_CONTEXT_CHAR_BUDGET', 11000),
  ragMinScore: num('RAG_MIN_SCORE', 0.18),

  maxChunkTokens: int('MAX_CHUNK_TOKENS', 320),
  chunkOverlapTokens: int('CHUNK_OVERLAP_TOKENS', 60),

  prirucnikDocxPath: process.env.PRIRUCNIK_DOCX_PATH || './materijali/prirucnik.docx',
  dopunskiDir: process.env.DOPUNSKI_DIR || './materijali/dopunski',
};

/**
 * API ključ ide u HTTP zaglavlje, koje podnosi samo znakove do 255. Ako se u
 * varijablu zalijepi MASKIRANI prikaz ključa (niz „••••"), fetch pukne uz
 * nerazumljivo „Cannot convert argument to a ByteString". Zato se vrijednost
 * provjerava ovdje i greška se imenuje jasno.
 */
function provjeriKljuc(name: string, vrijednost: string): string {
  const cist = vrijednost.trim();
  const problem = [...cist].find((z) => z.charCodeAt(0) > 255);
  if (problem) {
    const maskiran = cist.includes('•') || cist.includes('●') || cist.includes('*');
    throw new Error(
      `Vrijednost varijable ${name} sadrži nedopušten znak „${problem}". ` +
        (maskiran
          ? 'Izgleda da je spremljen MASKIRANI prikaz ključa (točkice) umjesto stvarne vrijednosti — upišite pravi ključ.'
          : 'Ključ smije sadržavati samo obične ASCII znakove.'),
    );
  }
  return cist;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Nedostaje obavezna ENV varijabla: ${name}`);
  return provjeriKljuc(name, v);
}

/** Ključ za OpenAI govorne usluge (ASR/TTS); pada natrag na OPENAI_API_KEY. */
export function speechApiKey(): string {
  const ime = process.env.SPEECH_API_KEY?.trim() ? 'SPEECH_API_KEY' : 'OPENAI_API_KEY';
  const v = process.env.SPEECH_API_KEY || process.env.OPENAI_API_KEY;
  if (!v || !v.trim()) throw new Error('Nedostaje SPEECH_API_KEY (ili OPENAI_API_KEY) za ASR/TTS.');
  return provjeriKljuc(ime, v);
}
