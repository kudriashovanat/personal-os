"use client";

import { Card, SectionTitle, Badge } from "@/components/ui";
import { Briefcase, TrendingUp, PenLine, CalendarDays, Send, Newspaper, Laptop } from "lucide-react";

const AGENTS = [
  { name: "Career Search", icon: Briefcase, desc: "Ищет вакансии и пишет карточки в раздел «Карьера»" },
  { name: "HR Trends", icon: TrendingUp, desc: "Собирает сигналы рынка и исследования" },
  { name: "Content Ideas", icon: PenLine, desc: "Предлагает идеи для Telegram и LinkedIn" },
  { name: "Calendar Assistant", icon: CalendarDays, desc: "Готовит pending-события (создание — только после подтверждения)" },
  { name: "Telegram Sources", icon: Send, desc: "Сохраняет материалы из Telegram в Inbox Vault" },
  { name: "Personal Digest", icon: Newspaper, desc: "Утренний дайджест: задачи, события, сигналы" },
  { name: "Mac Organizer", icon: Laptop, desc: "Наводит порядок в файлах на Mac" },
];

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle eyebrow="Команда помощников" title="Агенты" />
      <div className="grid gap-3 sm:grid-cols-2">
        {AGENTS.map(({ name, icon: Icon, desc }) => (
          <Card key={name} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris-soft text-iris-deep">
                <Icon size={16} />
              </span>
              <Badge className="bg-line text-soft">не подключён</Badge>
            </div>
            <div className="font-display text-base font-semibold">{name}</div>
            <p className="text-sm leading-relaxed text-soft">{desc}</p>
            <div className="mt-auto flex justify-between border-t border-line/70 pt-2 text-xs text-soft/70">
              <span>Последний запуск: —</span>
              <span>Ошибок: 0</span>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-soft">
        Подключение агентов — Блок 3: каждый агент будет писать в свою таблицу через защищённый webhook,
        а здесь появятся живые статусы, отчёты и журнал ошибок.
      </p>
    </div>
  );
}
