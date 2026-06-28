import type { AiParsedTicket, AiPriority } from "@/types/ai";
import { serviceDeskCategories, serviceDeskDepartments, serviceDeskPriorities } from "./prompts";

export type AiTicketPriority = (typeof serviceDeskPriorities)[number];
export type AiTicketCategory = (typeof serviceDeskCategories)[number];

export type AiTicketClassification = {
  isTicket: boolean;
  hasProblemDescription: boolean;
  objectId: string | null;
  objectName: string | null;
  address: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: AiPriority | null;
  recommendedDepartment: string | null;
  confidence: number;
  missingFields: string[];
  rawText: string;
  mode: "mock" | "openai-ready";
  problemDescription?: string | null;
  recommendedAssignee?: string | null;
};

const ACTION_START_RE = /^(потрібно|треба|необхідно|прочистити|прикрутити|замінити|відремонтувати|переклеїти|полагодити|налаштувати|відправити|розвантажити|прибрати|перевірити|не працює|не робе|тече|протікає|потік|капає|зламався|зламалась|зламалось|гуде|набирається|вибиває|не відкривається|не закривається)\b/iu;

export function normalizeTicketText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripGreeting(text: string) {
  return text.replace(/^(добрий день|доброго дня|доброго ранку|добрий ранок|вітаю|привіт)[.!,\s-]*/iu, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripObjectHints(text: string, objectHints: string[] = []) {
  return objectHints.reduce((result, hint) => {
    const normalizedHint = normalizeTicketText(hint);
    if (!normalizedHint || normalizedHint.length < 3) return result;
    return result.replace(new RegExp(`(^|[\\s,.;:-])${escapeRegExp(normalizedHint)}(?=$|[\\s,.;:-])`, "giu"), " ");
  }, text);
}

function stripLeadingAddressLikeText(text: string) {
  return text
    .replace(/^([А-ЯІЇЄҐA-Z][\p{L}'’ʼ`-]+)\s*,?\s*\d+[а-яa-z]?\s+/iu, "")
    .replace(/^(м\.?\s*)?[А-ЯІЇЄҐA-Z][\p{L}'’ʼ`-]+,\s*(вул\.?\s*)?[А-ЯІЇЄҐA-Z][\p{L}'’ʼ`\s-]+,\s*\d+[а-яa-z]?\s+/iu, "")
    .trim();
}

function cleanupTaskText(text: string, objectHints: string[] = []) {
  return stripLeadingAddressLikeText(stripObjectHints(stripGreeting(normalizeTicketText(text)), objectHints))
    .replace(/^[,.;:-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitByActionSeparators(text: string) {
  const protectedText = text.replace(/([А-ЯІЇЄҐA-Z][\p{L}'’ʼ`-]+)\s*,\s*(\d+[а-яa-z]?)/giu, "$1 $2");
  const roughParts = protectedText
    .split(/(?:;|\n|•|\s+-\s+)|,\s+(?=(?:потрібно|треба|необхідно|прочистити|прикрутити|замінити|відремонтувати|переклеїти|полагодити|налаштувати|відправити|розвантажити|прибрати|перевірити|не працює|не робе|тече|протікає|потік|капає|зламався|зламалась|зламалось|вибиває)\b)|\s+(?:і|та)\s+(?=(?:потрібно|треба|необхідно|прочистити|прикрутити|замінити|відремонтувати|переклеїти|полагодити|налаштувати|відправити|розвантажити|прибрати|перевірити|не працює|не робе|тече|протікає|потік|капає|зламався|зламалась|зламалось|вибиває)\b)/giu)
    .map((part) => part.trim())
    .filter(Boolean);

  if (roughParts.length <= 1) return roughParts;
  return roughParts.filter((part) => ACTION_START_RE.test(part) || looksLikeTicket(part));
}

export function splitPotentialTasks(text: string, objectHints: string[] = []) {
  const cleaned = cleanupTaskText(text, objectHints);
  if (!cleaned) return [];
  const parts = splitByActionSeparators(cleaned)
    .map((part) => cleanupTaskText(part, objectHints))
    .filter((part) => part.length >= 8 && looksLikeTicket(part));
  return parts.length > 0 ? parts : looksLikeTicket(cleaned) ? [cleaned] : [];
}

export function shortTitleFromText(text: string) {
  const normalized = normalizeTicketText(text)
    .replace(/^потрібно\s+/iu, "")
    .replace(/^треба\s+/iu, "")
    .replace(/^необхідно\s+/iu, "");
  if (!normalized) return null;
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized[0].toUpperCase() + normalized.slice(1);
}

function descriptionFromTask(task: string) {
  const normalized = normalizeTicketText(task).replace(/\(([^)]+)\)/g, ". $1").replace(/\s+\./g, ".").replace(/\.+/g, ".").trim();
  const withPrefix = /^(потрібно|треба|необхідно)\b/iu.test(normalized) ? normalized : `Потрібно ${normalized}`;
  return `${withPrefix[0].toUpperCase() + withPrefix.slice(1).replace(/[.!?]+$/, "")}.`;
}

function titleFromTask(task: string, category: AiTicketCategory) {
  const value = task.toLowerCase();
  if (/(унітаз)/u.test(value)) return /тече|протіка|потік|капає/u.test(value) ? "Протікає унітаз" : "Проблема з унітазом";
  if (/(змішувач|кран)/u.test(value)) return "Проблема зі змішувачем";
  if (/(кондиціон)/u.test(value)) return "Проблема з кондиціонером";
  if (/(холодиль|морозиль|температура)/u.test(value)) return "Проблема з холодильним обладнанням";
  if (/(ручк)/u.test(value)) return "Прикрутити ручку";
  if (/(плитк)/u.test(value)) return "Ремонт плитки";
  if (category === "Електрика") return "Проблема з електрикою";
  return shortTitleFromText(task) ?? "Технічна заявка";
}

export function inferCategory(text: string): AiTicketCategory {
  const value = text.toLowerCase();
  if (/(унітаз|змішувач|кран|вода|тече|протіка|потік|капає|каналізац|раковин|мийк|сифон|труба)/u.test(value)) return "Сантехніка";
  if (/(світл|ламп|розет|електр|автомат|щиток|нема струму|відсутня електрика|кабель|вибиває)/u.test(value)) return "Електрика";
  if (/(плитк|стіна|стеля|двер|ручк|ремонт|будівельн|штукатур|підлога|вхід|не відкривається|не закривається)/u.test(value)) return "Будівельні роботи";
  if (/(студент|розвантаж|вантаж|перенести|допомога|відправити)/u.test(value)) return "Роботи студентів";
  if (/(холодиль|морозиль|температура|вітрин|компресор|камера)/u.test(value)) return "Холодильне обладнання";
  if (/(кондиціон|вентиляц|витяжк|клімат)/u.test(value)) return "Кондиціонування та вентиляція";
  if (/(стелаж|вітрин|ваги|торгове обладнання|кошик|полиці)/u.test(value)) return "Торгове обладнання";
  if (/(каса|pos|термінал|сканер|чек|фіскаль)/u.test(value)) return "Каси та POS-обладнання";
  if (/(комп'ют|компют|ноутбук|мереж|wi-?fi|інтернет|роутер|принтер)/u.test(value)) return "Комп'ютери та мережа";
  if (/(зв'язок|звязок|телефон|мобільн|провайдер)/u.test(value)) return "Інтернет та зв'язок";
  if (/(мебл|стіл|шаф|крісл|тумб)/u.test(value)) return "Меблі";
  if (/(вивіск|банер|реклам|лайтбокс)/u.test(value)) return "Вивіски та реклама";
  if (/(прибир|бруд|сміт|клінінг)/u.test(value)) return "Прибирання";
  if (/(територ|двір|парков|фасад|благоустр)/u.test(value)) return "Благоустрій території";
  return "Інше";
}

export function inferPriority(text: string): AiPriority {
  const value = text.toLowerCase();
  if (/(нема електрики|відсутня електрика|затоп|пожеж|дим|аварі|не працює магазин)/u.test(value)) return "critical";
  if (/(холодиль|морозиль|температура \+?1[0-9]|протікає|тече сильно|не працює каса|не працює кондиціонер|дуже гуде|набирається вода|вибиває світло)/u.test(value)) return "high";
  if (/(тече|капає|не працює|не робе|зламав|потрібно|треба|терміново|прочистити)/u.test(value)) return "medium";
  return "low";
}

export function recommendedDepartmentForCategory(category: AiTicketCategory) {
  if (category === "Сантехніка") return "Сантехнік";
  if (category === "Електрика") return "Електрик";
  if (category === "Холодильне обладнання") return "Холодильне обладнання";
  if (category === "Кондиціонування та вентиляція") return "Кліматична служба";
  if (category === "Каси та POS-обладнання" || category === "Комп'ютери та мережа" || category === "Інтернет та зв'язок") return "IT / POS";
  if (category === "Роботи студентів") return "Студентська бригада";
  if (category === "Будівельні роботи") return "Будівельна бригада";
  return "Технічний менеджер";
}

export function recommendedAssigneeForCategory(category: AiTicketCategory) {
  return recommendedDepartmentForCategory(category);
}

export function looksLikeTicket(text: string) {
  const value = text.toLowerCase();
  return /(не працю|не робе|злам|тече|протіка|потік|капає|потрібно|треба|температура|нема|відсутн|поламан|замінити|відправити|розвантаж|ремонт|переклеїти|не вмика|не включа|прочистити|прикрутити|гуде|набирається|вибиває світло|не відкривається|не закривається)/u.test(value);
}

export function hasProblemDescription(text: string) {
  const normalized = normalizeTicketText(text);
  return normalized.length >= 12 && looksLikeTicket(normalized);
}

export function parsePotentialTickets(text: string, objectHints: string[] = []): AiParsedTicket[] {
  return splitPotentialTasks(text, objectHints).map((task) => {
    const category = inferCategory(task);
    return {
      title: titleFromTask(task, category),
      description: descriptionFromTask(task),
      category,
      priority: inferPriority(task),
      recommendedDepartment: serviceDeskDepartments.includes(recommendedDepartmentForCategory(category) as (typeof serviceDeskDepartments)[number])
        ? recommendedDepartmentForCategory(category)
        : "Технічний відділ",
      confidence: Math.min(0.96, 0.68 + (ACTION_START_RE.test(task) ? 0.12 : 0) + (category !== "Інше" ? 0.08 : 0)),
    };
  });
}
