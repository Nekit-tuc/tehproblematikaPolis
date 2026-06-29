import type { AiPriority } from "@/types/ai";

const CRITICAL_RE =
  /(нема(є)?\s+(електрик|світла|струму)|відсутн(я|є)\s+(електрик|світло|струм)|пожеж|дим|іскр|затоп|аварі|не\s+працює\s+магазин|загроз|небезпек)/iu;

const HIGH_RE =
  /(холодиль|морозиль|температура\s*\+?\s*1[0-9]|сильно\s+тече|тече\s+вода|потоп|протікає|вибиває\s+світло|каса\s+не\s+працює|pos\s+не\s+працює|дуже\s+гуде|набирається\s+вода|миші|щур|санітар)/iu;

const MEDIUM_RE =
  /(тече|капає|не\s+працює|не\s+робе|не\s+робить|злам|потрібно|треба|замінити|відремонтувати|прочистити|прикрутити|не\s+закрива|не\s+відкрива|ринв|склопакет|замок|двер)/iu;

export function inferPriority(text: string): AiPriority {
  const value = text.toLowerCase();
  if (CRITICAL_RE.test(value)) return "critical";
  if (HIGH_RE.test(value)) return "high";
  if (MEDIUM_RE.test(value)) return "medium";
  return "low";
}
