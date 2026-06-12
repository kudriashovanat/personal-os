import { Upcoming } from "@/components/Upcoming";

export default function BrainPage() {
  return (
    <Upcoming
      eyebrow="Obsidian-first"
      title="Second Brain"
      block="Блок 2 · Чтение Vault"
      description="Ваш Vault — источник истины. Быстрые заметки уже сохраняются markdown-файлами в папку Inbox через Google Drive. В Блоке 2 добавится чтение: страница будет показывать последние заметки прямо из Drive-синхронизированного Vault, не копируя их в базу."
      items={[
        "Последние заметки и Inbox из вашего Vault (чтение через Drive API)",
        "Просмотр markdown с поддержкой [[wikilinks]] и тегов",
        "Поиск по заметкам",
        "Источники из Telegram, новые темы и связи",
      ]}
    />
  );
}
