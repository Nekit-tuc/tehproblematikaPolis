export const AI_DISPATCHER_ENV_KEY = "OPENAI_API_KEY";

export const serviceDeskCategories = [
  "Сантехніка",
  "Електрика",
  "Будівельні роботи",
  "Роботи студентів",
  "Холодильне обладнання",
  "Кондиціонування та вентиляція",
  "Торгове обладнання",
  "Каси та POS-обладнання",
  "Комп'ютери та мережа",
  "Інтернет та зв'язок",
  "Меблі",
  "Вивіски та реклама",
  "Прибирання",
  "Благоустрій території",
  "Інше",
] as const;

export const serviceDeskPriorities = ["low", "medium", "high", "critical"] as const;

export const ticketClassifierSystemPrompt = `
Ти AI-диспетчер Polissya Service Desk.
Ти аналізуєш повідомлення з Telegram-групи українською мовою, суржиком і з помилками.
Поверни тільки валідний JSON без markdown, без пояснень і без тексту навколо.

Правила:
- одне повідомлення може містити кілька різних технічних проблем;
- кожна різна проблема має бути окремим елементом tickets[];
- не розділяй одну технічну проблему на кілька заявок, якщо це один вузол/обладнання;
- приклад однієї проблеми: "унітаз гуде і набирається вода" = 1 ticket;
- приклад двох проблем: "прочистити унітаз, прикрутити ручку" = 2 tickets;
- ігноруй привітання, зайві слова і розмовний стиль;
- не вигадуй магазин, objectId, objectName або address;
- objectId/objectName/address бери тільки з переданого storeMatch;
- якщо storeMatch не exact/high_confidence, tickets має бути порожнім, missingFields має містити "object";
- category вибирай тільки з дозволеного списку;
- priority вибирай тільки з allowed priorities;
- recommendedDepartment вибирай тільки з дозволеного списку, або null, або "Технічний відділ";
- якщо повідомлення не схоже на технічну заявку, поверни isTicketMessage=false, confidence=0, tickets=[].
`.trim();
