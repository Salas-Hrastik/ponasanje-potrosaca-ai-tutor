/**
 * Povezuje multimedijske datoteke iz Supabase Storagea s nastavnom cjelinom.
 *
 * Datoteke se u Storage podižu ručno (bucket `mediji`, mapa „N cjelina"), a ova
 * skripta iz njih čita trajanje i upisuje redove u tablicu `mediji`.
 *
 * Trajanje se čita IZ ZAGLAVLJA, bez preuzimanja cijele datoteke: dohvaća se
 * samo početak (i po potrebi kraj) rasponskim HTTP zahtjevom. ffprobe u ovom
 * okruženju nije dostupan, a ffmpeg koji dolazi uz Playwright je okljaštren
 * build bez MP4/MP3 podrške.
 *
 * Pokretanje:
 *   npm run mediji -- --poglavlje=3            # upiši u bazu
 *   npm run mediji -- --poglavlje=3 --suho     # samo ispiši što bi upisao
 */
import { supabaseAdmin } from '../lib/supabase';

const ARGS = process.argv.slice(2);
const POGLAVLJE = Number(ARGS.find((a) => a.startsWith('--poglavlje='))?.split('=')[1]);
const SUHO = ARGS.includes('--suho');

type Tip = 'video' | 'audio' | 'prezentacija';

function tipDatoteke(ime: string): Tip | null {
  const e = ime.toLowerCase().split('.').pop() ?? '';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(e)) return 'video';
  if (['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(e)) return 'audio';
  if (['pptx', 'ppt', 'pdf', 'key'].includes(e)) return 'prezentacija';
  return null;
}

/** „Psihologija_turizma.mp4" → „Psihologija turizma" */
function naslovIzImena(ime: string): string {
  return ime.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

/**
 * Naslov koji ništa ne govori: „Cjelina 6", „Audio", „6"… Takve datoteke ne
 * zaslužuju svoj naslov u popisu medija, nego preuzimaju ime cjeline.
 */
function genericanNaslov(naslov: string): boolean {
  return /^(cjelina|poglavlje|audio|podcast|snimka|zvuk)?\s*\d*$/i.test(naslov.trim());
}

async function raspon(url: string, od: number, do_: number): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { Range: `bytes=${od}-${do_}` } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * MP4/M4A: traži `mvhd` i čita timescale + duration. Box `moov` zna biti i na
 * kraju datoteke, pa se u tom slučaju gleda i rep.
 */
function mvhdTrajanje(buf: Buffer): number | null {
  const i = buf.indexOf('mvhd');
  if (i < 0) return null;
  const verzija = buf[i + 4];
  try {
    if (verzija === 1) {
      const timescale = buf.readUInt32BE(i + 24);
      const trajanje = Number(buf.readBigUInt64BE(i + 28));
      return timescale ? trajanje / timescale : null;
    }
    const timescale = buf.readUInt32BE(i + 16);
    const trajanje = buf.readUInt32BE(i + 20);
    return timescale ? trajanje / timescale : null;
  } catch {
    return null;
  }
}

const BITRATE = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const FREKV = [44100, 48000, 32000, 0];

/** MP3: Xing/Info zaglavlje (VBR) ako postoji, inače proračun iz CBR bitratea. */
function mp3Trajanje(buf: Buffer, ukupnoBajta: number): number | null {
  let poc = 0;
  if (buf.slice(0, 3).toString() === 'ID3') {
    poc = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  }
  for (let i = poc; i < buf.length - 4; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const verzija = (buf[i + 1] >> 3) & 3;
    const sloj = (buf[i + 1] >> 1) & 3;
    const bi = (buf[i + 2] >> 4) & 15;
    const fi = (buf[i + 2] >> 2) & 3;
    if (verzija !== 3 || sloj !== 1 || bi === 0 || bi === 15 || fi > 2) continue;

    const okvir = buf.slice(i, i + 1500);
    for (const oznaka of ['Xing', 'Info']) {
      const j = okvir.indexOf(oznaka);
      if (j >= 0 && (okvir.readUInt32BE(j + 4) & 1) === 1) {
        return (okvir.readUInt32BE(j + 8) * 1152) / FREKV[fi];
      }
    }
    return ((ukupnoBajta - poc) * 8) / (BITRATE[bi] * 1000);
  }
  return null;
}

async function trajanjeSekundi(url: string, ime: string, velicina: number): Promise<number | null> {
  const tip = tipDatoteke(ime);
  if (tip === 'prezentacija') return null;

  const glava = await raspon(url, 0, Math.min(1_048_575, velicina - 1));
  if (!glava) return null;

  if (tip === 'audio' && ime.toLowerCase().endsWith('.mp3')) return mp3Trajanje(glava, velicina);

  const izGlave = mvhdTrajanje(glava);
  if (izGlave) return izGlave;

  // moov na kraju datoteke — dohvati rep.
  const rep = await raspon(url, Math.max(0, velicina - 1_048_576), velicina - 1);
  return rep ? mvhdTrajanje(rep) : null;
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

async function main() {
  if (!Number.isFinite(POGLAVLJE)) {
    console.log('Navedite cjelinu, npr.: npm run mediji -- --poglavlje=3');
    return;
  }

  const sb = supabaseAdmin();
  const { data: pog } = await sb
    .from('poglavlja')
    .select('id, broj, naslov')
    .eq('broj', POGLAVLJE)
    .single();
  if (!pog) throw new Error(`Nema cjeline ${POGLAVLJE}.`);

  const mapa = `${POGLAVLJE} cjelina`;
  const { data: datoteke, error } = await sb.storage.from('mediji').list(mapa, { limit: 200 });
  if (error) throw new Error(`Storage: ${error.message}`);
  if (!datoteke?.length) {
    console.log(`[mediji] Mapa „${mapa}" je prazna ili ne postoji — nema što uvesti.`);
    return;
  }

  // Redoslijed prikaza: video, pa audio, pa prezentacija (kao u cjelinama 1 i 2).
  const poredak: Record<Tip, number> = { video: 0, audio: 1, prezentacija: 2 };
  const stavke = datoteke
    .filter((d) => d.id !== null && tipDatoteke(d.name))
    .map((d) => ({ ime: d.name, tip: tipDatoteke(d.name)!, velicina: Number(d.metadata?.size ?? 0) }))
    .sort((a, b) => poredak[a.tip] - poredak[b.tip]);

  const { data: javni } = sb.storage.from('mediji').getPublicUrl(mapa);
  const baza = javni.publicUrl.replace(/\/$/, '');

  /**
   * Naslov se izvodi iz imena datoteke, koje je bez dijakritika („Zasto
   * putovanja…"). Ako je naslov već jednom sređen, ponovno pokretanje ga NE
   * smije pregaziti — zato se postojeći naslovi po URL-u čuvaju. Generički
   * naslovi nisu „sređeni", pa se osvježavaju.
   */
  const { data: postojeci } = await sb
    .from('mediji')
    .select('url, naslov')
    .eq('poglavlje_id', pog.id);
  const raniji = new Map((postojeci ?? []).map((r) => [r.url, r.naslov]));

  /** Ime cjeline umjesto ničega — inače u popisu stoji „🎧 Audio · Cjelina 6". */
  function naslovStavke(ime: string, tip: Tip, url: string): { naslov: string; zadrzan: boolean } {
    const cuvani = raniji.get(url);
    if (cuvani && !genericanNaslov(cuvani)) return { naslov: cuvani, zadrzan: true };
    const izImena = naslovIzImena(ime);
    if (genericanNaslov(izImena)) return { naslov: pog!.naslov, zadrzan: false };
    return { naslov: izImena, zadrzan: false };
  }

  const redovi = [];
  for (const [i, s] of stavke.entries()) {
    const url = `${baza}/${encodeURIComponent(s.ime)}`;
    const t = await trajanjeSekundi(url, s.ime, s.velicina);
    const { naslov, zadrzan } = naslovStavke(s.ime, s.tip, url);
    redovi.push({
      poglavlje_id: pog.id,
      tip: s.tip,
      naslov,
      url,
      trajanje_s: t ? Math.round(t) : null,
      redoslijed: i,
    });
    console.log(
      `  ${s.tip.padEnd(13)} ${naslov.padEnd(46)} ${t ? mmss(t) : '—'}${zadrzan ? '  (postojeći naslov zadržan)' : ''}`,
    );
  }

  if (SUHO) {
    console.log('[mediji] --suho: ništa nije upisano.');
    return;
  }

  // Ponovno pokretanje ne smije udvostručiti zapise.
  await sb.from('mediji').delete().eq('poglavlje_id', pog.id);
  const { error: greska } = await sb.from('mediji').insert(redovi);
  if (greska) throw new Error(`Upis: ${greska.message}`);
  console.log(`[mediji] Cjelina ${pog.broj} „${pog.naslov}": upisano ${redovi.length} zapisa.`);
}

main().catch((e) => {
  console.error('[mediji] GREŠKA:', e);
  process.exit(1);
});
