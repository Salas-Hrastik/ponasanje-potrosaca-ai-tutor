import Link from 'next/link';
import { getDopunskiIzvori } from '@/lib/content';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Izvori' };

export default async function IzvoriPage() {
  const dopunski = await getDopunskiIzvori();

  return (
    <div className="page page-izvori">
      <p className="lekcija-mrvice">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>Izvori</h1>

      <section className="kartica">
        <h2>Izvor istine</h2>
        <p>
          Veleučilišni priručnik <strong>„Ponašanje potrošača u turizmu&ldquo;</strong> jedini je izvor iz
          kojeg asistent odgovara u chatu, kvizu i usmenoj vježbi. Svaki odgovor navodi poglavlje i
          stranicu.
        </p>
      </section>

      <section className="kartica">
        <h2>Dopunski izvori</h2>
        <p className="izvori-uvod">
          Dopunski su isključivo izvori koje priručnik sam navodi. Nisu u zadanom opsegu dohvata —
          uključuju se tek prekidačem <em>„Uključi dopunske izvore&ldquo;</em> u chatu, a u citatima su
          uvijek posebno označeni.
        </p>
        {dopunski.length === 0 ? (
          <p className="izvori-prazno">
            Dopunski izvori još nisu učitani. Nastavnik ih dodaje u registar{' '}
            <code>data/dopunski-izvori.json</code> i pokreće <code>npm run ingest:dopunski</code>.
          </p>
        ) : (
          <ul className="izvori-lista">
            {dopunski.map((i) => (
              <li key={i.id}>
                <strong>{i.naslov}</strong>
                {i.autor ? ` — ${i.autor}` : ''}
                {i.godina ? `, ${i.godina}.` : ''}
                {i.ukupno_stranica ? ` (${i.ukupno_stranica} str.)` : ''}
                {i.napomena && <p className="izvor-napomena">{i.napomena}</p>}
                {i.url && (
                  <a href={i.url} target="_blank" rel="noreferrer">
                    Otvori izvor →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="kartica">
        <h2>Literatura iz priručnika</h2>
        <p>
          Cjelovit popis literature nalazi se u samom priručniku, u poglavlju{' '}
          <em>„Literatura i izvori za daljnje učenje&ldquo;</em> — dostupno kao lekcija u dijelu{' '}
          <strong>Dodaci</strong>.
        </p>
      </section>
    </div>
  );
}
