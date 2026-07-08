import type { AiDepartmentSuggestion, AiPriority, AiWorkType } from "@/types/ai";
import { serviceDeskCategories, serviceDeskDepartments } from "./prompts";
import { inferPriority } from "./priority-engine";

export type WorkClassification = {
  category: string;
  workType: AiWorkType;
  priority: AiPriority;
  recommendedDepartment: AiDepartmentSuggestion;
  reasoning: string;
};

function has(text: string, pattern: RegExp) {
  return pattern.test(text.toLowerCase());
}

export function inferCategory(text: string) {
  if (has(text, /(каналіза|сток|забит|раковин|мийк|сифон|унітаз|змива|не\s+сход|не\s+збіг|не\s+збiг)/iu)) return "Каналізація";
  if (has(text, /(кран|змішувач|змiшувач|водопостач|труба|вода|тече|тіче|протіка|потік|потiк|капає|бойлер)/iu)) return "Сантехніка";
  if (has(text, /(світл|свiтл|ламп|розет|електр|автомат|щиток|струм|кабель|вибиває|дзвін|дзвiн)/iu)) return "Електрика";
  if (has(text, /(замок|серцевин|ключ|двер|доводчик|фурнітур|фурнiтур|вікн|вiкн|склопакет|ручк)/iu)) return "Вікна / двері / фурнітура";
  if (has(text, /(лавк|стільц|стiльц|стілец|стiлец|столик|стіл|стiл|звар|парков|двір|двiр|територ|благоустр|бочка|рампа)/iu)) return "Буд-роботи, зварювальні, ремонтні проф";
  if (has(text, /(студент|прибир|клінінг|клiнiнг|косін|косiн|трава|винести|вивезти|сміт|смiт|дах|санітар|санiтар|обладнання)/iu)) return "Студенти";
  if (has(text, /(плитк|фасад|фарб|покрас|монтаж|вентиляц|ремонт|стіна|стiна|підлог|пiдлог|бордюр|отвір|отвiр|дірк|дiрк)/iu)) return "Будівельні роботи";
  return "Будівельні роботи";
}

export function inferWorkType(text: string): AiWorkType {
  const value = text.toLowerCase();
  if (/(небезпек|миші|мишi|санітар|санiтар|авар)/iu.test(value)) return "safety";
  if (/(встановити|поставити|повісити|повiсити|змонтувати|зробити|закріпити|закрiпити)/iu.test(value)) return "install";
  if (/(замінити|замiнити|поміняти|помiняти)/iu.test(value)) return "replace";
  if (/(розглянути|перевірити|перевiрити|оглянути|можливість|можливiсть)/iu.test(value)) return "inspect";
  if (/(прибрати|прибирання|сміття|смiття|бруд|клінінг|клiнiнг)/iu.test(value)) return "cleaning";
  if (/(документ|узгодити|адміністратив|адмiнiстратив)/iu.test(value)) return "administrative";
  if (/(відремонтувати|вiдремонтувати|ремонт|полагодити|прочистити|прикрутити|заробити|пофарбувати|закрити|не\s+працює|злам|тече|тіче|капає|гуде|не\s+можливо|неможливо)/iu.test(value)) return "repair";
  return "other";
}

export function recommendedDepartmentForCategory(category: string): string {
  const mapping: Record<string, string> = {
    "Будівельні роботи": "Будівельна бригада",
    "Сантехніка": "Сантехнік",
    "Каналізація": "Каналізаційна служба",
    "Електрика": "Електрик",
    "Вікна / двері / фурнітура": "Майстер з дверей та вікон",
    "Буд-роботи, зварювальні, ремонтні проф": "Зварювальна / ремонтна бригада",
    "Студенти": "Студентська бригада",
  };
  const department = mapping[category] ?? "Технічний відділ";
  return serviceDeskDepartments.includes(department as (typeof serviceDeskDepartments)[number]) ? department : "Технічний відділ";
}

export function classifyWorkItem(text: string): WorkClassification {
  const inferredCategory = inferCategory(text);
  const category = serviceDeskCategories.includes(inferredCategory) ? inferredCategory : "Будівельні роботи";
  const workType = inferWorkType(text);
  const priority = inferPriority(text);
  return {
    category,
    workType,
    priority,
    recommendedDepartment: recommendedDepartmentForCategory(category),
    reasoning: `Категорія "${category}", тип "${workType}" і пріоритет "${priority}" визначені за ключовими словами та контекстом роботи.`,
  };
}
