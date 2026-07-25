import Link from 'next/link';
import { config } from '@/lib/config';
import { dohvatiKorisnika } from '@/lib/auth';
import { getPoglavljaSaLekcijama, getNapredakMap, type NapredakStanje } from '@/lib/content';
import VodicModal from '@/components/VodicModal';

export const dynamic = 'force-dynamic';

export default async function NaslovnicaPage() {
  const [poglavlja, korisnik] = await Promise.all([getPoglavljaSaLekcijama(), dohvatiKorisnika()]);
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

  const sveLekcije = poglavlja.flatMap((p) => p.lekcije);
  const zavrsenih = sveLekcije.filter((l) => napredak.get(l.id)?.zavrseno).length;
  const ukupnoPostotak = sveLekcije.length > 0 ? Math.round((zavrsenih / sveLekcije.length) * 100) : 0;
  const prvaLekcija = sveLekcije[0];
  const sljedecaLekcija = sveLekcije.find((l) => !napredak.get(l.id)?.zavrseno) ?? prvaLekcija;

  // Poglavlja se na naslovnici prikazuju grupirana po dijelovima knjige.
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
          <p className="hero-institucija">{config.ustanova} · {config.studij}</p>
          <h1 className="hero-naslov">Ponašanje potrošača u turizmu</h1>
          <p className="hero-podnaslov">
            Od klasičnih čimbenika odlučivanja do interneta i umjetne inteligencije
          </p>
          <div className="hero-opis">
            Interaktivno učenje po lekcijama — ciljevi, sažetak, mediji i kviz, uz AI asistenta
            koji svaki odgovor <strong>citira iz priručnika</strong> (poglavlje i stranica).
          </div>
          <div className="hero-gumbi">
            {prvaLekcija && (
              <Link href={`/lekcija/${prvaLekcija.id}`} className="hero-gumb hero-gumb-bijeli">
                Kreni od početka
              </Link>
            )}
            {sljedecaLekcija && (
              <Link href={`/lekcija/${sljedecaLekcija.id}`} className="hero-gumb hero-gumb-obrub">
                Nastavi učenje →
              </Link>
            )}
            <Link href="/usmena-vjezba" className="hero-gumb hero-gumb-obrub">
              🎙️ Usmena vježba
            </Link>
            <Link href="/zavrsna-provjera" className="hero-gumb hero-gumb-zuti">
              🎓 Završna provjera znanja
            </Link>
            <VodicModal />
          </div>
        </div>
        <div className="hero-korice" aria-hidden="true">
          <div className="korice-vrh">
            <span className="korice-znak">VBZ</span>
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
          <span className="korice-dno">Management u turizmu i ugostiteljstvu</span>
        </div>
      </section>

      <section className="napredak-traka-sekcija">
        <div className="put-zaglavlje">
          <h2>Tvoj put kroz priručnik</h2>
          <p className="napredak-tekst">
            {zavrsenih}/{sveLekcije.length} lekcija <strong>{ukupnoPostotak}%</strong>
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
              const zavrsenoUPoglavlju = pog.lekcije.filter((l) => napredak.get(l.id)?.zavrseno).length;
              const prva = pog.lekcije[0];
              const postotak =
                pog.lekcije.length > 0 ? Math.round((zavrsenoUPoglavlju / pog.lekcije.length) * 100) : 0;
              return (
                <div key={pog.id} className="poglavlje-kartica">
                  <h3>
                    {/* Klikabilni naslov poglavlja svugdje vodi na prvu lekciju poglavlja. */}
                    {prva ? (
                      <Link href={`/lekcija/${prva.id}`}>
                        {pog.broj}. {pog.naslov}
                      </Link>
                    ) : (
                      <>
                        {pog.broj}. {pog.naslov}
                      </>
                    )}
                  </h3>
                  <p className="poglavlje-meta">
                    str. {pog.stranica_od}–{pog.stranica_do} · {zavrsenoUPoglavlju}/{pog.lekcije.length} lekcija ·{' '}
                    <Link href={`/poglavlje/${pog.broj}/kviz`}>Kviz poglavlja</Link>
                  </p>
                  <div className="napredak-traka napredak-traka-mala">
                    <div className="napredak-traka-ispuna" style={{ width: `${postotak}%` }} />
                  </div>
                  <ol className="lekcije-lista">
                    {pog.lekcije.map((lek) => {
                      const stanje = napredak.get(lek.id);
                      return (
                        <li key={lek.id} className={stanje?.zavrseno ? 'lekcija-zavrsena' : ''}>
                          <Link href={`/lekcija/${lek.id}`}>
                            <span className="lekcija-oznaka" aria-hidden="true">
                              {stanje?.zavrseno ? '✓' : stanje?.posjeceno ? '·' : ''}
                            </span>
                            {lek.oznaka ? `${lek.oznaka} ` : ''}
                            {lek.naslov}
                          </Link>{' '}
                          <span className="lekcija-stranice">
                            (str. {lek.stranica_od}–{lek.stranica_do})
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
