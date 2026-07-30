import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCjelina, getPoglavlja } from '@/lib/content';
import { supabaseAdmin } from '@/lib/supabase';
import CjelinaRadniProstor from '@/components/CjelinaRadniProstor';
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

      <CjelinaRadniProstor
        broj={broj}
        naslov={poglavlje.naslov}
        dio={`${poglavlje.dio} · CJELINA ${poglavlje.broj}`}
        stranicaOd={poglavlje.stranica_od}
        stranicaDo={poglavlje.stranica_do}
        sazetakMd={poglavlje.sazetak_md ?? ''}
        odjeljci={odjeljci}
        ciljevi={ciljevi}
        kartice={kartice}
        mediji={mediji}
        brojPitanja={brojPitanja}
      />

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
  );
}
