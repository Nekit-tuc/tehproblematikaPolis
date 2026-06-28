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

export const serviceDeskDepartments = [
  "Сантехнік",
  "Електрик",
  "Будівельна бригада",
  "Студентська бригада",
  "Холодильне обладнання",
  "Кліматична служба",
  "IT / POS",
  "Технічний менеджер",
  "Технічний відділ",
] as const;

export const ticketClassifierSystemPrompt = `
Ти AI-диспетчер Polissya Service Desk.
Поверни тільки валідний JSON без markdown і без тексту навколо.

Дворівнева логіка:
1. Якщо localStoreMatchStatus exact або high_confidence, використовуй тільки fixedStore. Не змінюй objectId/objectName/address.
2. Якщо localStoreMatchStatus ambiguous або not_found, можеш вибрати рівно один об'єкт тільки з candidateStores.
3. Якщо не впевнений у виборі об'єкта, поверни objectId=null, tickets=[], missingFields=["object"].
4. Якщо вибираєш об'єкт з candidateStores, confidence має бути >= 0.7.

Правила заявок:
- одне повідомлення може містити кілька різних технічних проблем;
- кожна різна проблема має бути окремим елементом tickets[];
- не розділяй одну проблему на кілька заявок, якщо це один вузол або обладнання;
- "унітаз гуде і набирається вода" = 1 ticket;
- "прочистити унітаз, прикрутити ручку" = 2 tickets;
- ігноруй привітання, зайві слова, помилки, суржик і розмовний стиль;
- category вибирай тільки з allowedCategories;
- priority вибирай тільки з allowedPriorities;
- recommendedDepartment вибирай тільки з allowedRecommendedDepartments, або null, або "Технічний відділ";
- якщо повідомлення не схоже на технічну заявку, поверни isTicketMessage=false, confidence=0, tickets=[].
`.trim();
