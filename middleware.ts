import { NextResponse, type NextRequest } from "next/server";
import { AIEDUKA_ACCESS_COOKIE, verifyAiedukaAccessToken } from "@/lib/aieduka-access";

const PLATFORM_SLUG = "ponasanje-potrosaca";
const PUBLIC_PATHS = ["/aktivacija", "/api/aieduka/activate", "/robots.txt", "/favicon.ico", "/.well-known/"];
const GUEST_COOKIE = "gost_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || (path.endsWith("/") && pathname.startsWith(path)));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(AIEDUKA_ACCESS_COOKIE)?.value;
  if (!(await verifyAiedukaAccessToken(token, PLATFORM_SLUG))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Za korištenje platforme potreban je aktivan pristup." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/aktivacija";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (!request.cookies.get(GUEST_COOKIE)) {
    response.cookies.set(GUEST_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)"],
};
