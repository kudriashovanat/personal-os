"use client";

import { useEffect, useState } from "react";
import { Card, SectionTitle, Button, Input, Textarea, Badge } from "@/components/ui";
import { TARGET_ROLES, TARGET_LEVEL } from "@/lib/career";
import { CareerNav } from "@/components/CareerNav";
import { IdCard, Check } from "lucide-react";

type Profile = {
  cv_text: string;
  target_level: string;
  location: string;
  target_roles: string[];
  languages: string[];
  achievements: string[];
};

const empty: Profile = { cv_text: "", target_level: "", location: "", target_roles: [], languages: [], achievements: [] };

// Список ↔ многострочный текст (одна строка = один пункт).
const toLines = (a: string[]) => (a ?? []).join("\n");
const fromLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) =>
        setP(
          d && !d.error
            ? {
                cv_text: d.cv_text ?? "",
                target_level: d.target_level ?? "",
                location: d.location ?? "",
                target_roles: Array.isArray(d.target_roles) ? d.target_roles : [],
                languages: Array.isArray(d.languages) ? d.languages : [],
                achievements: Array.isArray(d.achievements) ? d.achievements : [],
              }
            : { ...empty }
        )
      )
      .catch(() => setP({ ...empty }));
  }, []);

  async function save() {
    if (!p) return;
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!p) return <div className="mx-auto max-w-3xl"><Card><div className="h-40 animate-pulse rounded-xl bg-line/60" /></Card></div>;

  const hasCv = p.cv_text.trim().length > 50;

  return (
    <div className="mx-auto max-w-3xl">
      <CareerNav />
      <SectionTitle
        eyebrow="Foundation"
        title="Профиль"
        action={<Button onClick={save} disabled={saving}>{saved ? <><Check size={15} /> Сохранено</> : saving ? "Сохраняю…" : "Сохранить"}</Button>}
      />

      <Card className="mb-4 flex items-center gap-2">
        <IdCard size={16} className="text-iris" />
        <span className="text-sm text-soft">Профиль — основа скоринга и Calibrator. Без CV эти функции работают вхолостую.</span>
        <Badge className={hasCv ? "ml-auto bg-sage-soft text-sage" : "ml-auto bg-rose-soft text-rose"}>{hasCv ? "CV заполнено" : "CV не заполнено"}</Badge>
      </Card>

      <div className="flex flex-col gap-4">
        <Field label="CV / резюме (текст)" hint="Вставьте полный текст резюме — на нём строится оценка соответствия.">
          <Textarea rows={12} value={p.cv_text} onChange={(e) => setP({ ...p, cv_text: e.target.value })} placeholder="Опыт, роли, достижения с цифрами…" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Целевой уровень" hint="Узкое место №1: целишься в HRBP/People Partner, не в Director.">
            <Input value={p.target_level} onChange={(e) => setP({ ...p, target_level: e.target.value })} placeholder={TARGET_LEVEL} />
          </Field>
          <Field label="Локация / рынок">
            <Input value={p.location} onChange={(e) => setP({ ...p, location: e.target.value })} placeholder="Израиль / Кипр / remote" />
          </Field>
        </div>

        <Field label="Целевые роли" hint="По одной в строке. Скоринг сравнивает вакансии именно с этим списком.">
          <Textarea rows={5} value={toLines(p.target_roles)} onChange={(e) => setP({ ...p, target_roles: fromLines(e.target.value) })}
            placeholder={TARGET_ROLES.join("\n")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Языки" hint="По одному в строке.">
            <Textarea rows={4} value={toLines(p.languages)} onChange={(e) => setP({ ...p, languages: fromLines(e.target.value) })} placeholder={"English B2\nРусский — родной\nИврит — начальный"} />
          </Field>
          <Field label="Достижения (STAR с цифрами)" hint="По одному в строке.">
            <Textarea rows={4} value={toLines(p.achievements)} onChange={(e) => setP({ ...p, achievements: fromLines(e.target.value) })} placeholder={"Снизила текучесть на 30%…\nЗапустила онбординг для 200+ сотрудников…"} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-soft">{label}</div>
      {hint && <div className="mb-1.5 text-xs text-soft/80">{hint}</div>}
      {children}
    </div>
  );
}
