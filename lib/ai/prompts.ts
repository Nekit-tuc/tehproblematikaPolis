export const AI_DISPATCHER_ENV_KEY = "OPENAI_API_KEY";

export const serviceDeskCategories = [
  "Сантехніка",
  "Електрика",
  "Будівельні роботи",
  "Малярні роботи",
  "Покрівля",
  "Водовідведення",
  "Двері та замки",
  "Вікна",
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
  "Пожежна безпека",
  "Адміністративне питання",
  "Інше",
] as const;

export const serviceDeskPriorities = ["low", "medium", "high", "critical"] as const;

export const serviceDeskWorkTypes = ["repair", "install", "replace", "inspect", "administrative", "cleaning", "safety", "other"] as const;

export const serviceDeskDepartments = [
  "Сантехнік",
  "Електрик",
  "Будівельна бригада",
  "Малярна бригада",
  "Покрівельник",
  "Водовідведення",
  "Двері та замки",
  "Вікна",
  "Студентська бригада",
  "Холодильне обладнання",
  "Кліматична служба",
  "IT / POS",
  "Пожежна безпека",
  "Адміністрація",
  "Технічний менеджер",
  "Технічний відділ",
] as const;

export const ticketClassifierSystemPrompt = `
Ти AI-диспетчер Polissya Service Desk.
Основна одиниця аналізу - Work Item: окрема незалежна робота або доручення, яке можна перетворити в одну заявку.

КРИТИЧНО ВАЖЛИВО ПРО ФОРМАТ ВІДПОВІДІ:
- відповідай тільки валідним JSON object;
- перший символ відповіді має бути {;
- останній символ відповіді має бути };
- не використовуй markdown;
- не використовуй \`\`\`json;
- не використовуй \`\`\`;
- не додавай пояснення до JSON або після JSON;
- не додавай коментарі;
- не додавай текст поза JSON;
- усі ключі мають бути в подвійних лапках;
- рядки мають бути в подвійних лапках;
- якщо немає заявок, все одно поверни валідний JSON object.

Правила аналізу:
- одне повідомлення Telegram-групи може містити багато workItems;
- не об'єднуй різні незалежні роботи в одну;
- не дроби одну проблему одного вузла або обладнання на кілька workItems;
- адресу або назву магазину не включай в description;
- текст у дужках перенось у description як уточнення;
- якщо localStoreMatchStatus exact або high_confidence, використовуй fixedStore і не змінюй objectId/objectName/address;
- якщо localStoreMatchStatus ambiguous або not_found і не можеш впевнено вибрати один candidateStore, поверни objectId=null, workItems=[], tickets=[], missingFields=["object"];
- Object Resolver is authoritative: if resolvedObject is present, use exactly resolvedObject.id/name/address and never override it;
- If resolvedObject is null, choose objectId only from allowedObjectIds/objectCandidates. If unsure, return objectId=null, workItems=[], tickets=[];
- Never invent objectId, objectName, address, store, warehouse, office, or any object outside allowedObjectIds;
- It is better to return no ticket than to create a ticket on the wrong object;
- category вибирай тільки з allowedCategories;
- priority вибирай тільки з allowedPriorities;
- workType вибирай тільки з allowedWorkTypes;
- recommendedDepartment вибирай тільки з allowedRecommendedDepartments, null або "Технічний відділ";
- якщо повідомлення не схоже на технічну заявку, поверни isTicketMessage=false, confidence=0, workItems=[], tickets=[].

Поверни JSON точно такої структури:
{
  "isTicketMessage": true,
  "objectId": "string|null",
  "objectName": "string|null",
  "address": "string|null",
  "confidence": 0.92,
  "workItems": [
    {
      "title": "string",
      "description": "string",
      "category": "one of allowedCategories",
      "workType": "repair|install|replace|inspect|administrative|cleaning|safety|other",
      "priority": "low|medium|high|critical",
      "recommendedDepartment": "one of allowedRecommendedDepartments|null",
      "confidence": 0.9,
      "reasoning": "short reason"
    }
  ],
  "tickets": [],
  "missingFields": [],
  "reason": "string",
  "mode": "openai",
  "model": "model name"
}

tickets має бути той самий масив, що й workItems, для сумісності.
`.trim();
