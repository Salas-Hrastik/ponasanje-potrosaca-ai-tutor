import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCjelina, getPoglavlja } from '@/lib/content';
import { supabaseAdmin } from '@/lib/supabase';
import AiChat from '@/components/AiChat';
import MediaModal from '@/components/MediaModal';
import SazetakModal from '@/components/SazetakModal';
import Kartice from '@/components/Kartice';
import OralPractice from '@/components/OralPractice';
import NapredakOznaka from '@/components/NapredakOznaka';

/**
 * Nastavna cjelina = poglavlje. Stranica je STATIČKA ruta: sadržaj (ciljevi,
 * sažetak, kartice, mediji, kviz) ne ovisi o korisniku, pa se predgenerira i
 * poslužuje s CDN-a. Napredak se dohvaća na klijentu (NapredakOznaka), tako da
 * se cache ne razbija po korisniku.
 *
 * revalidate: sadržaj se mijenja samo ponovnim ingestom, pa je sat vremena
 * dovoljno da se izmjene prošire bez ponovnog builda.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const { data } = await supabaseAdmin().from('poglavlja').select('broj');
    return (data ?? []).map((p) => ({ broj: String(p.broj) }));
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

export default async function CjelinaPage({ params }: { params: { broj: string } }) {
  const broj = Number(params.broj);
  if (!Number.isFinite(broj)) return notFound();

  const [detalji, sveCjeline] = await Promise.all([getCjelina(broj), getPoglavlja()]);
  if (!detalji) return notFound();
  const { poglavlje, odjeljci, ciljevi, kartice, mediji, brojPitanja } = detalji;

  const indeks = sveCjeline.findIndex((p) => p.broj === broj);
  const prethodna = indeks > 0 ? sveCjeline[indeks - 1] : null;
  const sljedeca = indeks >= 0 && indeks < sveCjeline.length - 1 ? sveCjeline[indeks + 1] : null;

  return (
    <div className="page-cjelina-okvir">
      <div className="cjelina-traka">
        <Link href="/" className="gumb-pocetak">
          🏠 Početak
        </Link>
        <div className="mrvice-okvir">
          <p className="mrvice-dio">{poglavlje.dio}</p>
          <p className="mrvice-cjelina">
            <strong>
              {poglavlje.broj}. {poglavlje.naslov}
            </strong>{' '}
            · str. {poglavlje.stranica_od}–{poglavlje.stranica_do}
          </p>
        </div>
        <Link href={`/cjelina/${broj}/kviz`} className="gumb-kviz-vrh">
          Kviz cjeline ({brojPitanja}) →
        </Link>
      </div>

      {odjeljci.length > 0 && (
        <nav className="odjeljci-niz" aria-label="Odjeljci cjeline">
          {odjeljci.map((o) => (
            <span key={o.id} className="odjeljak-chip">
              {o.oznaka ? <span className="odjeljak-oznaka">{o.oznaka}</span> : null}
              {o.naslov}
              <span className="odjeljak-str">str. {o.stranica_od}–{o.stranica_do}</span>
            </span>
          ))}
        </nav>
      )}

      <div className="page-cjelina-dvostupac">
        <div className="cjelina-lijevo">
          {ciljevi.length > 0 && (
            <section className="kartica ciljevi-kartica">
              <h3>🎯 Ciljevi učenja</h3>
              <ul className="ciljevi-lista">
                {ciljevi.map((c) => (
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
                          [Priručnik: str. {c.stranica ?? `${poglavlje.stranica_od}–${poglavlje.stranica_do}`}]
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {poglavlje.sazetak_md ? (
            <SazetakModal
              naslov={`${poglavlje.broj}. ${poglavlje.naslov}`}
              sazetakMd={poglavlje.sazetak_md}
              stranice={`${poglavlje.stranica_od}–${poglavlje.stranica_do}`}
            />
          ) : (
            <section className="kartica">
              <p className="sazetak-prazno">
                Sažetak ove cjeline još nije učitan. Koristite AI asistenta desno — odgovori su
                utemeljeni izravno na tekstu priručnika (str. {poglavlje.stranica_od}–
                {poglavlje.stranica_do}).
              </p>
            </section>
          )}

          <Kartice kartice={kartice} />

          <MediaModal mediji={mediji} />

          <Link href={`/cjelina/${broj}/kviz`} className="gumb-kviz-veliki">
            🎯 Kviz cjeline ({brojPitanja} pitanja)
          </Link>

          <OralPractice poglavljeBroj={broj} naslovOpsega={`${poglavlje.broj}. ${poglavlje.naslov}`} />

          <div className="cjelina-navigacija">
            <NapredakOznaka poglavljeBroj={broj} />
            <div className="cjelina-navigacija-desno">
              {prethodna ? (
                <Link href={`/cjelina/${prethodna.broj}`} className="gumb-prethodna">
                  ← {prethodna.broj}. {prethodna.naslov}
                </Link>
              ) : (
                <span className="gumb-prethodna gumb-onemogucen">← Prethodna</span>
              )}
              {sljedeca ? (
                <Link href={`/cjelina/${sljedeca.broj}`} className="gumb-sljedeca">
                  {sljedeca.broj}. {sljedeca.naslov} →
                </Link>
              ) : (
                <span className="gumb-sljedeca gumb-onemogucen">Sljedeća →</span>
              )}
            </div>
          </div>
        </div>

        <div className="cjelina-desno">
          <AiChat
            poglavljeBroj={broj}
            naslovPoglavlja={poglavlje.naslov}
            predlozenaPitanja={ciljevi.map((c) => ciljKaoPitanje(c.tekst))}
          />
        </div>
      </div>
    </div>
  );
}
