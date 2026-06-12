import { Upcoming } from "@/components/Upcoming";

export default function FilesPage() {
  return (
    <Upcoming
      eyebrow="Документы под контролем"
      title="Файлы"
      block="Блок 3 · Загрузки"
      description="Центр загрузки: файл уходит в папку Google Drive «Personal OS Uploads», а в Obsidian создаётся карточка со ссылкой, метаданными и кратким содержанием. Файлы живут в Drive, знания — в Vault."
      items={[
        "Загрузка PDF, DOCX, XLSX, изображений, аудио и видео",
        "Автосохранение в Google Drive → Personal OS Uploads",
        "Карточка файла в Obsidian: ссылка, метаданные, краткое содержание",
        "Извлечение текста и связь с заметками и проектами",
      ]}
    />
  );
}
