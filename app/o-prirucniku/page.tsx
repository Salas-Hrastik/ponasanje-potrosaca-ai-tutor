import Link from 'next/link';
import { config } from '@/lib/config';

export const metadata = { title: 'O priručniku' };

/**
 * Sve tvrdnje na ovoj stranici dolaze iz naslovnice i predgovora priručnika.
 * Ime autora priručnik u isporučenom dokumentu ne navodi, pa se ono ovdje NE
 * pretpostavlja — nastavnik ga dopunjuje kad bude poznato.
 */
export default function OPrirucnikuPage() {
  return (
    <div className="page page-autori">
      <p className="mrvice-redak">
        <Link href="/">← Naslovnica</Link>
      </p>
      <h1>O priručniku</h1>

      <article className="autor-kartica">
        <h2>Ponašanje potrošača u turizmu</h2>
        <p className="autor-podnaslov">
          Od klasičnih čimbenika odlučivanja do interneta i umjetne inteligencije — priručnik za
          razumijevanje suvremenog turističkog potrošača.
        </p>
        <p>
          Veleučilišni priručnik i nastavni materijal za studente {config.ustanova}a, studij{' '}
          {config.studij}. Prema predgovoru, priručnik je osmišljen kao podloga za učenje na kolegiju{' '}
          <em>{config.kolegij}</em> i kao temelj za izradu popratnih nastavnih materijala.
        </p>
        <p>
          Gradivo je podijeljeno u dva dijela. <strong>Dio I</strong> postavlja temelje: što je
          ponašanje potrošača, koji ga psihološki i društveni čimbenici oblikuju, kako teče proces
          donošenja odluke o putovanju te kako se ponašanje razlikuje po podvrstama turizma posebnih
          interesa. <strong>Dio II</strong> te temelje smješta u digitalno doba: kako internet,
          platforme, društvene mreže i umjetna inteligencija mijenjaju svaku fazu putničkog
          odlučivanja.
        </p>
        <p>
          Kroz tekst se ponavljaju didaktički elementi: <em>Ključni pojmovi</em>,{' '}
          <em>Primjer iz prakse</em>, <em>AI u fokusu</em> te <em>Sažetak poglavlja</em> i{' '}
          <em>Pitanja za ponavljanje</em>.
        </p>
        <p className="autor-napomena">
          Predgovor napominje da je dio podatkovnih pokazatelja preuzet iz naznačenih industrijskih
          izvora (npr. Skift &amp; McKinsey, 2025.), dok su ostali ilustrativnog karaktera i služe
          razumijevanju trendova; za seminarske i znanstvene radove preporučuje se provjera najnovijih
          izvora.
        </p>
      </article>

      <article className="autor-kartica">
        <h2>Kako ovaj asistent koristi priručnik</h2>
        <p>
          Asistent „{config.assistantName}&ldquo; odgovara <strong>isključivo</strong> na temelju sadržaja
          priručnika. Svaki odgovor navodi poglavlje i raspon stranica na kojima se tvrdnja nalazi.
          Ako u priručniku nema podloge za odgovor, asistent to otvoreno kaže i predloži gdje tražiti —
          umjesto da nagađa.
        </p>
        <p>
          Dopunski izvori (industrijska izvješća navedena u priručniku) dostupni su odvojeno i u
          citatima su uvijek označeni kao dopunski. Popis vidi na stranici{' '}
          <Link href="/izvori">Izvori</Link>.
        </p>
      </article>
    </div>
  );
}
