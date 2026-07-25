import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getLekcijaDetalji,
  getPoglavljaSaLekcijama,
  getBrojOdobrenihPitanja,
} from '@/lib/content';
import { supabaseAdmin } from '@/lib/supabase';
import AiChat from '@/components/AiChat';
import MediaModal from '@/components/MediaModal';
import SazetakModal from '@/components/SazetakModal';
import OralPractice from '@/components/OralPractice';
import NapredakOznaka from '@/components/NapredakOznaka';

/**
 * Lekcija je STATIČKA ruta: sadržaj (ciljevi, sažetak, mediji, struktura) ne
 * ovisi o korisniku, pa se stranica može predgenerirati i posluživati s CDN-a.
 * Sve što je vezano uz korisnika — napredak — dohvaća se na klijentu
 * (NapredakOznaka), tako da se cache ne razbija po korisniku.
 *
 * revalidate: sadržaj se mijenja samo ponovnim ingestom, pa je sat vremena
 * dovoljno da se izmjene prošire bez ponovnog builda.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const { data } = await supabaseAdmin().from('lekcije').select('id');
    return (data ?? []).map((l) => ({ id: l.id as string }));
  } catch {
    // Baza nije dostupna pri buildu (npr. prvi deploy prije ingesta) —
    // stranice se tada generiraju na zahtjev.
    return [];
  }
}

/**
 * Cilj učenja („objasniti pojam X") pretvara u pitanje koje student može
 * postaviti asistentu. Ciljevi su formulirani infinitivom, pa ih „Možeš li …?"
 * gramatički ispravno pretvara u pitanje.
 */
function ciljKaoPitanje(tekst: string): string {
  const t = tekst.trim().replace(/[.;]+$/, '');
  return `Možeš li ${t.charAt(0).toLowerCase()}${t.slice(1)}?`;
}

export default async function LekcijaPage({ params }: { params: { id: string } }) {
  // Sve neovisne dohvate pokreni odjednom — baza je udaljena, pa sekvencijalni
  // upiti množe mrežnu latenciju.
  const [detalji, poglavlja] = await Promise.all([
    getLekcijaDetalji(params.id),
    getPoglavljaSaLekcijama(),
  ]);
  if (!detalji) return notFound();
  const { lekcija, ciljevi, mediji } = detalji as any;

  const brojPitanja = await getBrojOdobrenihPitanja(lekcija.poglavlje_id);

  const poglavljeBroj = lekcija.poglavlja?.broj;
  const poglavljeNaslov = lekcija.poglavlja?.naslov;

  const sveLekcije = poglavlja.flatMap((p) => p.lekcije);
  const indeks = sveLekcije.findIndex((l) => l.id === lekcija.id);
  const prethodna = indeks > 0 ? sveLekcije[indeks - 1] : null;
  const sljedece = sveLekcije.slice(indeks + 1, indeks + 3);
  const sljedeca = sljedece[0] ?? null;

  // Studentima se prikazuju samo odobreni ciljevi; nacrti čekaju nastavnika.
  const vidljiviCiljevi = (ciljevi as any[]).filter((c) => c.odobreno);

  return (
    <div className="page-lekcija-okvir">
      <div className="lekcija-traka">
        <Link href="/" className="gumb-pocetak">
          🏠 Početak
        </Link>
        <div className="mrvice-okvir">
          <p className="mrvice-poglavlje">
            <Link href={`/poglavlje/${poglavljeBroj}`}>
              📖 {poglavljeBroj}. {poglavljeNaslov}
            </Link>
          </p>
          <p className="mrvice-lekcija">
            L{lekcija.broj}: {lekcija.oznaka ? `${lekcija.oznaka} ` : ''}
            {lekcija.naslov} · str. {lekcija.stranica_od}–{lekcija.stranica_do}
          </p>
        </div>
        <Link href={`/poglavlje/${poglavljeBroj}/kviz`} className="gumb-kviz-vrh">
          Kviz poglavlja ({brojPitanja}) →
        </Link>
      </div>

      <div className="lekcije-niz">
        <span className="lekcija-chip lekcija-chip-aktivna">
          L{lekcija.broj} : {lekcija.naslov}
        </span>
        {sljedece.map((l) => (
          <span key={l.id} className="lekcija-chip-spoj">
            <span className="lekcija-chip-strelica">→</span>
            <Link href={`/lekcija/${l.id}`} className="lekcija-chip">
              L{l.broj} : {l.naslov}
            </Link>
          </span>
        ))}
      </div>

      <div className="page-lekcija-dvostupac">
        <div className="lekcija-lijevo">
          {vidljiviCiljevi.length > 0 && (
            <section className="kartica ciljevi-kartica">
              <h3>🎯 Ciljevi učenja</h3>
              <ul className="ciljevi-lista">
                {vidljiviCiljevi.map((c: any) => (
                  <li key={c.id}>
                    <span className="cilj-krug" aria-hidden="true" />
                    <span className="cilj-sadrzaj">
                      {c.tekst}
                      <span className="cilj-meta">
                        {c.kognitivna_razina && (
                          <span className="cilj-razina-chip">
                            {c.kognitivna_razina.charAt(0).toUpperCase() + c.kognitivna_razina.slice(1)}
                          </span>
                        )}
                        <span className="cilj-stranica">
                          [Priručnik: str. {c.stranica ?? `${lekcija.stranica_od}–${lekcija.stranica_do}`}]
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lekcija.sazetak_md ? (
            <SazetakModal
              naslov={`${lekcija.oznaka ? `${lekcija.oznaka} ` : ''}${lekcija.naslov}`}
              sazetakMd={lekcija.sazetak_md}
              stranice={`${lekcija.stranica_od}–${lekcija.stranica_do}`}
            />
          ) : (
            <section className="kartica">
              <p className="sazetak-prazno">
                Sažetak za ovu lekciju još nije učitan. Koristite AI asistenta desno — odgovori su
                utemeljeni izravno na tekstu priručnika (str. {lekcija.stranica_od}–{lekcija.stranica_do}).
              </p>
            </section>
          )}

          <MediaModal mediji={mediji} />

          <Link href={`/poglavlje/${poglavljeBroj}/kviz`} className="gumb-kviz-veliki">
            🎯 Kviz poglavlja ({brojPitanja} pitanja)
          </Link>

          <OralPractice lekcijaId={lekcija.id} naslovOpsega={`${lekcija.oznaka} ${lekcija.naslov}`} />

          <div className="lekcija-navigacija">
            <NapredakOznaka lekcijaId={lekcija.id} />
            <div className="lekcija-navigacija-desno">
              {prethodna ? (
                <Link href={`/lekcija/${prethodna.id}`} className="gumb-prethodna">
                  ← Prethodna
                </Link>
              ) : (
                <span className="gumb-prethodna gumb-onemogucen">← Prethodna</span>
              )}
              {sljedeca ? (
                <Link href={`/lekcija/${sljedeca.id}`} className="gumb-sljedeca">
                  Sljedeća →
                </Link>
              ) : (
                <span className="gumb-sljedeca gumb-onemogucen">Sljedeća →</span>
              )}
            </div>
          </div>
        </div>

        <div className="lekcija-desno">
          <AiChat
            lekcijaId={lekcija.id}
            naslovLekcije={lekcija.naslov}
            poglavljeBroj={poglavljeBroj}
            predlozenaPitanja={vidljiviCiljevi.map((c: any) => ciljKaoPitanje(c.tekst))}
          />
        </div>
      </div>
    </div>
  );
}
