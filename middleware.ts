import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// MW_VERSION служит маркером деплоя: если в ответе 307 нет заголовка x-mw,
// значит на Vercel всё ещё работает старая версия middleware.
const MW_VERSION = "3";

async function readToken(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  // 1) дефолты библиотеки: на Vercel secureCookie = NEXTAUTH_URL.startsWith("https") ?? !!VERCEL
  const auto = await getToken({ req, secret });
  if (auto) return auto;
  // 2) явное секьюрное имя (HTTPS)
  const secure = await getToken({ req, secret, secureCookie: true, cookieName: "__Secure-next-auth.session-token" });
  if (secure) return secure;
  // 3) явное обычное имя (localhost / http)
  return getToken({ req, secret, secureCookie: false, cookieName: "next-auth.session-token" });
}

function parseAllowed(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().replace(/^["']|["']$/g, "").toLowerCase()) // срезаем случайные кавычки
    .filter(Boolean);
}

export async function middleware(req: NextRequest) {
  const token = await readToken(req);
  const allowed = parseAllowed();
  const email = token?.email?.toLowerCase() ?? null;

  if (token && email && allowed.includes(email)) {
    const res = NextResponse.next();
    res.headers.set("x-mw", MW_VERSION);
    return res;
  }

  // Диагностика причины — попадает в заголовок ответа и в логи Vercel
  const sessionCookies = req.cookies
    .getAll()
    .map((c) => c.name)
    .filter((n) => n.includes("next-auth"));
  const reason = !token
    ? `no-token; secret=${process.env.NEXTAUTH_SECRET ? "set" : "MISSING"}; cookies=[${sessionCookies.join(",")}]`
    : !email
      ? "token-without-email"
      : allowed.length === 0
        ? "ALLOWED_EMAILS-empty-or-missing"
        : `email-not-in-list (${email} vs ${allowed.length} allowed)`;
  console.log(`[middleware v${MW_VERSION}] ${req.nextUrl.pathname} -> redirect: ${reason}`);

  // Для API — 401 JSON, не HTML-редирект
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const res = NextResponse.json({ error: "Нет доступа" }, { status: 401 });
    res.headers.set("x-mw", MW_VERSION);
    res.headers.set("x-auth-reason", reason);
    return res;
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = token ? "error=AccessDenied" : `callbackUrl=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  const res = NextResponse.redirect(url);
  res.headers.set("x-mw", MW_VERSION);
  res.headers.set("x-auth-reason", reason);
  return res;
}

export const config = {
  matcher: ["/((?!api/auth|api/agents/[^/]+/report|login|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
