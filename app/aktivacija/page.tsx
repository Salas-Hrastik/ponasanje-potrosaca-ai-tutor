export const metadata = { title: "Aktivacija pristupa | Ponašanje potrošača u turizmu — AI udžbenik" };

interface ActivationPageProps {
  searchParams?: { greska?: string; next?: string };
}

export default function ActivationPage({ searchParams }: ActivationPageProps) {
  const next = searchParams?.next?.startsWith("/") && !searchParams.next.startsWith("//")
    ? searchParams.next
    : "/";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#f3f7f7", color: "#173b46", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ width: "min(560px, 100%)", padding: "32px 28px", border: "1px solid #c9dada", borderRadius: 20, background: "white", boxShadow: "0 20px 55px rgba(13, 58, 67, .12)" }}>
        <p style={{ margin: 0, color: "#a56b00", fontSize: 12, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>AIEduka · siguran pristup</p>
        <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(28px, 6vw, 40px)", lineHeight: 1.1 }}>Aktivacija pristupa</h1>
        <p style={{ margin: "0 0 22px", lineHeight: 1.55, color: "#506970" }}>Ponašanje potrošača u turizmu — AI udžbenik. Unesite adresu e-pošte korištenu pri kupnji i pristupni kod koji ste primili nakon potvrđenog plaćanja.</p>
        {searchParams?.greska ? <p role="alert" style={{ padding: "11px 13px", borderRadius: 10, background: "#fff0ee", color: "#9b2c20", fontWeight: 700 }}>{searchParams.greska}</p> : null}
        <form action="/api/aieduka/activate" method="post" style={{ display: "grid", gap: 15 }}>
          <input type="hidden" name="next" value={next} />
          <label style={{ display: "grid", gap: 6, fontWeight: 750 }}>E-pošta
            <input type="email" name="email" required autoComplete="email" style={{ minHeight: 46, padding: "10px 12px", border: "1px solid #aec5c8", borderRadius: 10, font: "inherit" }} />
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 750 }}>Pristupni kod
            <input name="token" required minLength={12} autoComplete="one-time-code" placeholder="AIED-XXXXXX-XXXXXX-XXXXXX" style={{ minHeight: 46, padding: "10px 12px", border: "1px solid #aec5c8", borderRadius: 10, font: "inherit", textTransform: "uppercase" }} />
          </label>
          <button type="submit" style={{ minHeight: 48, border: 0, borderRadius: 999, background: "#0b5968", color: "white", font: "inherit", fontWeight: 850, cursor: "pointer" }}>Aktiviraj i otvori platformu</button>
        </form>
        <p style={{ margin: "20px 0 0", fontSize: 13, lineHeight: 1.5, color: "#60777d" }}>Nemate pristupni kod? <a href="https://www.aieduka.hr/platforme/ponasanje-potrosaca#licenciranje" style={{ color: "#0b5968", fontWeight: 800 }}>Kupite pristup na AIEduka webu</a>.</p>
      </section>
    </main>
  );
}
