"use client";

import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Feather } from "lucide-react";
import { Suspense, useEffect } from "react";

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const callbackUrl = params.get("callbackUrl") || "/";
  const { status } = useSession();

  // Обратный гард: уже авторизованного уводим в приложение
  useEffect(() => {
    if (status === "authenticated") window.location.replace(callbackUrl);
  }, [status, callbackUrl]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="glass-strong w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-iris text-white shadow-lift">
          <Feather size={24} />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Personal OS</h1>
        <p className="mt-2 text-sm text-soft">
          Личное пространство. Вход только для владельца.
        </p>
        {error && (
          <div className="mt-4 rounded-xl bg-rose-soft px-3 py-2.5 text-sm text-rose">
            {error === "AccessDenied"
              ? "Этот Google-аккаунт не входит в список разрешённых."
              : "Не удалось войти. Попробуйте ещё раз."}
          </div>
        )}
        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
        >
          <svg width="17" height="17" viewBox="0 0 24 24">
            <path fill="#fff" d="M21.35 11.1h-9.17v2.96h5.3c-.23 1.24-.93 2.29-1.99 3v2.49h3.22c1.88-1.74 2.96-4.3 2.96-7.32 0-.38-.03-.76-.08-1.13h-.24z"/>
            <path fill="#fff" opacity=".7" d="M12.18 21.5c2.69 0 4.95-.89 6.6-2.42l-3.22-2.49c-.89.6-2.03.95-3.38.95-2.6 0-4.8-1.76-5.58-4.12H3.27v2.57a9.96 9.96 0 0 0 8.91 5.51z"/>
            <path fill="#fff" opacity=".5" d="M6.6 13.42a5.99 5.99 0 0 1 0-3.84V7.01H3.27a9.97 9.97 0 0 0 0 8.98l3.33-2.57z"/>
            <path fill="#fff" opacity=".85" d="M12.18 5.46c1.46 0 2.78.5 3.81 1.49l2.85-2.85A9.95 9.95 0 0 0 3.27 7.01L6.6 9.58c.78-2.36 2.98-4.12 5.58-4.12z"/>
          </svg>
          Войти через Google
        </button>
        <p className="mt-5 text-xs text-soft/70">
          Закрыто от индексации · данные принадлежат вам · Obsidian-first
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
