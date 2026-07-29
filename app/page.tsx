import Link from 'next/link';
import { config } from '@/lib/config';
import { dohvatiKorisnika } from '@/lib/auth';
import { getPoglavlja, getNapredakMap, type NapredakStanje } from '@/lib/content';
import VodicModal from '@/components/VodicModal';

export const dynamic = 'force-dynamic';

export default async function NaslovnicaPage() {
  const [poglavlja, korisnik] = await Promise.all([getPoglavlja(), dohvatiKorisnika()]);
  const napredak: Map<string, NapredakStanje> = korisnik
    ? await getNapredakMap(korisnik.id)
    : new Map();

  if (poglavlja.length === 0) {
    return (
      <div className="page">
        <h1>Sadržaj kolegija još nije učitan</h1>
        <p>
          Nastavnik treba pokrenuti punjenje sadržaja: <code>npm run struktura</code> →{' '}
          <code>npm run ingest</code> nakon postavljanja Supabase projekta i sheme iz{' '}
          <code>supabase/schema.sql</code>.
        </p>
      </div>
    );
  }

  const zavrsenih = poglavlja.filter((p) => napredak.get(p.id)?.zavrseno).length;
  const ukupnoPostotak = Math.round((zavrsenih / poglavlja.length) * 100);
  const prva = poglavlja[0];
  const sljedeca = poglavlja.find((p) => !napredak.get(p.id)?.zavrseno) ?? prva;

  // Cjeline se na naslovnici prikazuju grupirane po dijelovima priručnika.
  const dijelovi: { naslov: string; poglavlja: typeof poglavlja }[] = [];
  for (const pog of poglavlja) {
    const zadnji = dijelovi[dijelovi.length - 1];
    if (zadnji && zadnji.naslov === pog.dio) zadnji.poglavlja.push(pog);
    else dijelovi.push({ naslov: pog.dio, poglavlja: [pog] });
  }

  return (
    <div className="page page-naslovnica">
      <section className="hero">
        <div className="hero-tekst">
          <p className="hero-institucija">
            {config.ustanova} · {config.studij}
          </p>
          <h1 className="hero-naslov">Ponašanje potrošača u turizmu</h1>
          <p className="hero-podnaslov">
            Od klasičnih čimbenika odlučivanja do interneta i umjetne inteligencije
          </p>
          {config.autorPrirucnika && (
            <p className="hero-autor">
              <Link href="/o-prirucniku">{config.autorPrirucnika}</Link>
            </p>
          )}
          <div className="hero-opis">
            Učenje po nastavnim cjelinama — ciljevi, sažetak, kartice, mediji i kviz, uz AI
            asistenta koji svaki odgovor <strong>citira iz priručnika</strong> (poglavlje i stranica).
          </div>
          <div className="hero-gumbi">
            <Link href={`/cjelina/${prva.broj}`} className="hero-gumb hero-gumb-bijeli">
              Kreni od početka
            </Link>
            <Link href={`/cjelina/${sljedeca.broj}`} className="hero-gumb hero-gumb-obrub">
              Nastavi učenje →
            </Link>
            <VodicModal />
          </div>
        </div>
        <div className="hero-korice" aria-hidden="true">
          <div className="korice-vrh">
            <img src="/baltazar-logo.svg" alt="" className="korice-znak" />
            <span className="korice-izdavac">
              Veleučilište
              <br />
              Baltazar Zaprešić
            </span>
          </div>
          <div className="korice-sredina">
            <span className="korice-oznaka">Veleučilišni priručnik</span>
            <span className="korice-naslov">Ponašanje potrošača u turizmu</span>
          </div>
          <span className="korice-dno">{config.autorPrirucnika || config.studij}</span>
        </div>
      </section>

      <section className="napredak-traka-sekcija">
        <div className="put-zaglavlje">
          <h2>Tvoj put kroz priručnik</h2>
          <p className="napredak-tekst">
            {zavrsenih}/{poglavlja.length} cjelina <strong>{ukupnoPostotak}%</strong>
          </p>
        </div>
        <div className="napredak-traka">
          <div className="napredak-traka-ispuna" style={{ width: `${ukupnoPostotak}%` }} />
        </div>
      </section>

      {dijelovi.map((dio) => (
        <section key={dio.naslov} className="dio-sekcija">
          <h2 className="dio-naslov">{dio.naslov}</h2>
          <div className="poglavlja-lista">
            {dio.poglavlja.map((pog) => {
              const stanje = napredak.get(pog.id);
              return (
                <Link
                  key={pog.id}
                  href={`/cjelina/${pog.broj}`}
                  className={`cjelina-kartica ${stanje?.zavrseno ? 'cjelina-zavrsena' : ''}`}
                >
                  <div className="cjelina-vrh">
                    <span className="cjelina-broj">{pog.broj}</span>
                    {stanje?.zavrseno ? (
                      <span className="cjelina-znak" title="Pregledano">
                        ✓
                      </span>
                    ) : stanje?.posjeceno ? (
                      <span className="cjelina-znak cjelina-znak-tih" title="Započeto">
                        ·
                      </span>
                    ) : null}
                  </div>
                  <h3>{pog.naslov}</h3>
                  <p className="cjelina-meta">
                    str. {pog.stranica_od}–{pog.stranica_do} · {pog.odjeljci.length} odjeljaka
                  </p>
                  <ul className="odjeljci-pregled">
                    {pog.odjeljci.slice(0, 4).map((o) => (
                      <li key={o.id}>
                        {o.oznaka ? `${o.oznaka} ` : ''}
                        {o.naslov}
                      </li>
                    ))}
                    {pog.odjeljci.length > 4 && (
                      <li className="odjeljci-jos">+ još {pog.odjeljci.length - 4}</li>
                    )}
                  </ul>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
