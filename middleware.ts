import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Явный middleware вместо заводского next-auth/middleware.
// Причина: на Vercel session-cookie за HTTPS называется "__Secure-next-auth.session-token",
// а заводской middleware определяет имя куки эвристикой по NEXTAUTH_URL и в production
// может искать обычную "next-auth.session-token" — тогда /api/auth/session сессию видит,
// а middleware нет, и авторизованного пользователя редиректит на /login.
// Здесь мы явно пробуем ОБА имени куки и сами проверяем allowlist.

async function readToken(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  // 1) секьюрная кука (Vercel / любой HTTPS)
  const secure = await getToken({
    req,
    secret,
    secureCookie: true,
    cookieName: "__Secure-next-auth.session-token",
  });
  if (secure) return secure;
  // 2) обычная кука (localhost / http)
  return getToken({
    req,
    secret,
    secureCookie: false,
    cookieName: "next-auth.session-token",
  });
}

function isAllowed(email?: string | null): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false; // закрыто по умолчанию
  return allowed.includes(email.toLowerCase());
}

export async function middleware(req: NextRequest) {
  const token = await readToken(req);

  if (token && isAllowed(token.email)) {
    return NextResponse.next();
  }

  // Для API-маршрутов отдаём 401 JSON, а не HTML-редирект
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = token
    ? "error=AccessDenied" // вошёл в Google, но email не в ALLOWED_EMAILS
    : `callbackUrl=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

// Не блокируем: эндпоинты NextAuth, страницу входа, статику
// и webhook отчётов агентов (он защищён собственным секретом x-agent-secret).
export const config = {
  matcher: ["/((?!api/auth|api/agents/[^/]+/report|login|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
