import { NextResponse } from "next/server";
import { AIEDUKA_ACCESS_COOKIE } from "@/lib/aieduka-access";

const PLATFORM_SLUG = "ponasanje-potrosaca";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function activationFailure(request: Request, message: string, next: string) {
  const url = new URL("/aktivacija", request.url);
  url.searchParams.set("greska", message);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return activationFailure(request, "Zahtjev za aktivaciju nije ispravan.", "/");
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("token") ?? "").trim();
  const next = safeNext(form.get("next"));

  if (!email || token.length < 12) {
    return activationFailure(request, "Unesite adresu e-pošte i cijeli pristupni kod.", next);
  }

  try {
    const response = await fetch("https://www.aieduka.hr/api/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, platformSlug: PLATFORM_SLUG }),
      cache: "no-store",
    });
    const result = (await response.json()) as { accessToken?: string; expiresAt?: number; error?: string };
    if (!response.ok || !result.accessToken || !result.expiresAt) {
      return activationFailure(
        request,
        result.error || "Kod nije valjan za ovu platformu ili je istekao.",
        next,
      );
    }

    const redirect = NextResponse.redirect(new URL(next, request.url), 303);
    redirect.cookies.set(AIEDUKA_ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60, result.expiresAt - Math.floor(Date.now() / 1000)),
    });
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  } catch {
    return activationFailure(request, "Aktivacija trenutačno nije dostupna. Pokušajte ponovno.", next);
  }
}
