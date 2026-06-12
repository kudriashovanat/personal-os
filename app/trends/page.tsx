import { Upcoming } from "@/components/Upcoming";

export default function TrendsPage() {
  return (
    <Upcoming
      eyebrow="HR Trends Agent"
      title="HR-тренды"
      block="Блок 3 · Агенты"
      description="Раздел подключается к HR Trends Agent: агент будет ежедневно писать в таблицу trend_signals, а страница — показывать сигналы дня с источниками. Структура и API уже заложены."
      items={[
        "Главные сигналы дня с приоритетом и источниками",
        "Новые исследования и сигналы рынка",
        "Идеи для применения в работе",
        "Кнопка «Сделать постом» — отправляет идею в Контент-студию одним нажатием",
      ]}
    />
  );
}
