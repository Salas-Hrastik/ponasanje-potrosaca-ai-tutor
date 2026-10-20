import { NextResponse } from "next/server";

const PLATFORM_SLUG = "ponasanje-potrosaca";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function activationRedirect(request: Request, next: string, params: Record<string, string>) {
  const url = new URL("/aktivacija", request.url);
  url.searchParams.set("next", next);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return activationRedirect(request, "/", { greska: "Zahtjev za probno korištenje nije ispravan." });
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));

  if (!email) {
    return activationRedirect(request, next, { greska: "Unesite adresu e-pošte." });
  }

  try {
    const response = await fetch("https://www.aieduka.hr/api/licenses/trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, platformSlug: PLATFORM_SLUG }),
      cache: "no-store",
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      return activationRedirect(request, next, {
        greska: result.error || "Probno korištenje trenutačno nije dostupno.",
      });
    }

    return activationRedirect(request, next, {
      poruka: "Probni pristupni token poslan je na navedenu e-poštu. Unesite ga u polje \"Pristupni token\" da otvorite platformu.",
    });
  } catch {
    return activationRedirect(request, next, { greska: "Probno korištenje trenutačno nije dostupno. Pokušajte ponovno." });
  }
}
