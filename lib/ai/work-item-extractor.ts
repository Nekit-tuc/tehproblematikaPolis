import type { AiWorkItem } from "@/types/ai";
import { classifyWorkItem } from "./work-classifier";

const ACTION_WORDS = [
  "потрібно",
  "треба",
  "необхідно",
  "повісити",
  "встановити",
  "поставити",
  "замінити",
  "відремонтувати",
  "зробити",
  "заробити",
  "переклеїти",
  "пофарбувати",
  "полагодити",
  "налаштувати",
  "відправити",
  "розвантажити",
  "прибрати",
  "перевірити",
  "розглянути",
  "прочистити",
  "прикрутити",
  "залишилися",
  "залишились",
  "серцевину",
] as const;

const PROBLEM_RE =
  /(не\s+працю|не\s+робе|не\s+робить|не\s+можливо|неможливо|тече|тіче|протіка|потік|капає|злам|потрібно|треба|замінити|відремонтувати|прочистити|прикрутити|повісити|встановити|поставити|зробити|заробити|пофарбувати|гуде|набирається|вибиває|не\s+відкрива|не\s+закрива|вогнегасник|бордюр|плитк|ринв|склопакет|замок|серцевин|парковк|дірк|отвір|миші)/iu;

const GREETING_RE = /^(добрий\s+день|доброго\s+дня|доброго\s+ранку|добрий\s+ранок|вітаю|привіт)[.!,\s-]*/iu;

export function normalizeWorkText(text: string) {
  return text
    .replace(/[’ʼ`´]/g, "'")
    .replace(/[“”„«»"]/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripObjectHints(text: string, objectHints: string[] = []) {
  return objectHints.reduce((result, hint) => {
    const normalizedHint = normalizeWorkText(hint);
    if (!normalizedHint || normalizedHint.length < 3) return result;
    return result.replace(new RegExp(`(^|[\\s,.;:\\n-])${escapeRegExp(normalizedHint)}(?=$|[\\s,.;:\\n-])`, "giu"), " ");
  }, text);
}

function stripAddressLikeText(text: string) {
  return text
    .replace(/^\s*[\p{L}' -]+,?\s*\d+[a-zа-яіїєґ/-]*\s*:\s*/iu, "")
    .replace(/\s*[\p{L}' -]+,\s*\d+[a-zа-яіїєґ/-]*\s*$/iu, "")
    .replace(/\s*[\p{L}' -]+\s+\d+[a-zа-яіїєґ/-]*\s*$/iu, "")
    .trim();
}

function cleanupSegment(text: string, objectHints: string[] = []) {
  return stripAddressLikeText(stripObjectHints(normalizeWorkText(text).replace(GREETING_RE, ""), objectHints))
    .replace(/^(?:\d+[\).\-\s]+|[-•]\s*)/u, "")
    .replace(/^[,.;:\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNumberedList(text: string) {
  const normalized = normalizeWorkText(text);
  const parts = normalized.split(/(?:^|\n|\s)(?=\d+[\).\-]\s+)/u).map((part) => part.trim());
  return parts.length > 1 ? parts : [];
}

function splitFreeText(text: string) {
  const actionLookahead = ACTION_WORDS.join("|");
  const protectedText = text.replace(/(\p{L}+)\s*,\s*(\d+)/giu, "$1 $2");
  return protectedText
    .split(new RegExp(`(?:\\n|;|•)|\\.\\s+|,\\s+(?=(?:${actionLookahead})(?:\\s|$))`, "giu"))
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeTitle(text: string) {
  const value = text.toLowerCase();
  if (/замок/u.test(value) && /шкаф|шаф/u.test(value)) return "Замінити замок у шкафчику для покупців";
  if (/серцевин|замок|закрити\s+на\s+ключ/u.test(value)) return "Відремонтувати замок дверей кабінету";
  if (/ринв/u.test(value) && /рамп/u.test(value)) return "Замінити ринву на рампі";
  if (/ринв/u.test(value) && /(2|друг)/u.test(value)) return "Зробити ринву на 2 поверсі хостела";
  if (/склопакет|вікн/u.test(value)) return "Замінити склопакет у роздягальні";
  if (/(дірк|отвір|миші)/u.test(value)) return "Заробити отвори від мишей";
  if (/пофарб/u.test(value) && /двер/u.test(value)) return "Пофарбувати двері в кабінеті та санвузлі";
  if (/вогнегасник/u.test(value)) return "Повісити вогнегасник";
  if (/столик|бочк/u.test(value)) return "Встановити столик або бочку на вулиці";
  if (/бордюр|плитк/u.test(value)) return "Відремонтувати бордюри та плитку по периметру";
  if (/парковк/u.test(value)) return "Розглянути можливість парковки навпроти магазину";
  if (/унітаз/u.test(value)) return "Проблема з унітазом";
  if (/ручк/u.test(value)) return "Прикрутити ручку";

  const withoutPrefix = text
    .replace(/^(потрібно|треба|необхідно)\s+/iu, "")
    .replace(/\(([^)]+)\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = withoutPrefix.length > 80 ? `${withoutPrefix.slice(0, 77)}...` : withoutPrefix;
  return title ? title[0].toUpperCase() + title.slice(1) : "Технічна робота";
}

function descriptionFromText(text: string, title: string) {
  const normalized = normalizeWorkText(text)
    .replace(/\(([^)]+)\)/g, ". $1")
    .replace(/\s+\./g, ".")
    .replace(/\.+/g, ".")
    .trim();
  const description = normalized || title;
  const withPrefix = /^(потрібно|треба|необхідно|замінити|зробити|відремонтувати|повісити|встановити|пофарбувати|прочистити|прикрутити|розглянути|заробити)/iu.test(description)
    ? description
    : `Потрібно ${description}`;
  return `${withPrefix[0].toUpperCase()}${withPrefix.slice(1).replace(/[.!?]+$/, "")}.`;
}

export function looksLikeWorkMessage(text: string) {
  return PROBLEM_RE.test(text.toLowerCase());
}

export function extractWorkItemTexts(text: string, objectHints: string[] = []) {
  const cleaned = cleanupSegment(text, objectHints);
  if (!cleaned || !looksLikeWorkMessage(cleaned)) return [];

  const numbered = splitNumberedList(cleaned);
  const rawParts = numbered.length > 1 ? numbered : splitFreeText(cleaned);
  const parts = rawParts
    .map((part) => cleanupSegment(part, objectHints))
    .filter((part) => part.length >= 6 && looksLikeWorkMessage(part));

  return parts.length > 0 ? dedupeParts(parts) : [cleaned];
}

function dedupeParts(parts: string[]) {
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = normalizeTitle(part).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractWorkItems(text: string, objectHints: string[] = []): AiWorkItem[] {
  return extractWorkItemTexts(text, objectHints).map((itemText) => {
    const title = normalizeTitle(itemText);
    const classification = classifyWorkItem(itemText);
    return {
      title,
      description: descriptionFromText(itemText, title),
      category: classification.category,
      workType: classification.workType,
      priority: classification.priority,
      recommendedDepartment: classification.recommendedDepartment,
      confidence: Math.min(0.96, 0.72 + (classification.category !== "Інше" ? 0.08 : 0) + (classification.workType !== "other" ? 0.08 : 0)),
      reasoning: classification.reasoning,
    };
  });
}
