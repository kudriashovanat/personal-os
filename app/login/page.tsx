"use client";

import { Suspense, useEffect, useMemo } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function getSafeCallbackUrl(value: string | null) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = useMemo(() => {
    return getSafeCallbackUrl(searchParams.get("callbackUrl"));
  }, [searchParams]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl || "/");
    }
  }, [status, callbackUrl, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4f2fb]">
        <div className="rounded-3xl bg-white/80 px-10 py-8 shadow-xl text-center">
          <div className="text-2xl font-semibold mb-2">Personal OS</div>
          <div className="text-sm text-slate-500">Открываю пространство…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f4f2fb] px-4">
      <div className="w-full max-w-md rounded-3xl bg-white/85 p-8 shadow-xl text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500 text-white">
          ✦
        </div>

        <h1 className="text-2xl font-semibold text-slate-900">Personal OS</h1>
        <p className="mt-2 text-sm text-slate-500">
          Личное пространство. Вход только для владельца.
        </p>

        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-7 w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Войти через Google
        </button>

        <p className="mt-5 text-xs text-slate-400">
          Закрыто от индексации · данные принадлежат вам · Obsidian-first
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-[#f4f2fb]">
          <div className="rounded-3xl bg-white/80 px-10 py-8 shadow-xl text-center">
            <div className="text-2xl font-semibold mb-2">Personal OS</div>
            <div className="text-sm text-slate-500">Открываю пространство…</div>
          </div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
