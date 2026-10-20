export const metadata = { title: "Aktivacija pristupa | Ponašanje potrošača u turizmu — AI udžbenik" };

const PLATFORM_URL = "https://www.aieduka.hr/platforme/ponasanje-potrosaca#licenciranje";

interface ActivationPageProps {
  searchParams?: { greska?: string; poruka?: string; next?: string };
}

export default function ActivationPage({ searchParams }: ActivationPageProps) {
  const next = searchParams?.next?.startsWith("/") && !searchParams.next.startsWith("//")
    ? searchParams.next
    : "/";

  return (
    <main className="page-auth">
      <section className="auth-form access-entry" aria-labelledby="access-title">
        <h1 id="access-title">Pristup platformi</h1>
        <p className="auth-podnaslov">
          Ponašanje potrošača u turizmu — AI udžbenik. Unesite postojeći token, isprobajte platformu ili
          pregledajte mogućnosti ugovaranja pristupa.
        </p>

        {searchParams?.greska ? (
          <p className="auth-greska" role="alert">
            {searchParams.greska}
          </p>
        ) : null}
        {searchParams?.poruka ? (
          <p className="auth-poruka" role="status">
            {searchParams.poruka}
          </p>
        ) : null}

        <div className="access-option access-option-paid">
          <span className="auth-eyebrow">Ugovoreni pristup</span>
          <h2>Imam pristupni token</h2>
          <p>Unesite token koji ste dobili nakon ugovaranja ili od svoje ustanove, uz adresu e-pošte na koju je izdan.</p>
          <form action="/api/aieduka/activate" method="post" style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="next" value={next} />
            <label>
              Vaša adresa e-pošte
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <label>
              Pristupni token
              <input name="token" required minLength={12} autoComplete="one-time-code" placeholder="AIED-XXXXXX-XXXXXX-XXXXXX" style={{ textTransform: "uppercase" }} />
            </label>
            <button type="submit">Aktiviraj i otvori platformu</button>
          </form>
        </div>

        <div className="access-option access-option-trial">
          <span className="auth-eyebrow">Probno korištenje</span>
          <h2>Želim isprobati platformu</h2>
          <p>
            Ako vam je vlasnik već odobrio probu, vrijedit će njegov zadani rok. U protivnom dobivate
            probno razdoblje od 72 sata. Pristupni token stiže na navedenu e-poštu — unesite ga u polje
            lijevo da otvorite platformu.
          </p>
          <form action="/api/aieduka/trial" method="post" style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="next" value={next} />
            <label>
              Vaša adresa e-pošte
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <button type="submit" className="auth-magic">Pošalji token za probno korištenje</button>
          </form>
        </div>

        <div className="access-option access-option-contract">
          <span className="auth-eyebrow">Novi pristup</span>
          <h2>Ugovaranje pristupa</h2>
          <p>Nemate pristupni token? Pregledajte dostupna razdoblja korištenja i način sigurne aktivacije pristupa.</p>
          <a className="contract-open" href={PLATFORM_URL}>
            Pregledaj mogućnosti
          </a>
        </div>

        <p className="auth-session-note">
          Kod se šalje isključivo na unesenu adresu. Tijekom aktivnog probnog razdoblja možete se prijaviti
          više puta istim tokenom.
        </p>
      </section>
    </main>
  );
}
