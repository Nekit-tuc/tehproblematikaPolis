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
  if (has(text, /(ринв|водост|водовід|злив)/iu)) return "Водовідведення";
  if (has(text, /(унітаз|змішувач|кран|вода|тече|протіка|потік|капає|каналіза|раковин|мийк|сифон|труба)/iu)) return "Сантехніка";
  if (has(text, /(світл|ламп|розет|електр|автомат|щиток|струм|кабель|вибиває)/iu)) return "Електрика";
  if (has(text, /(вогнегасник|пожеж)/iu)) return "Пожежна безпека";
  if (has(text, /(пофарб|фарбув)/iu)) return "Малярні роботи";
  if (has(text, /(замок|серцевин|ключ|двері\s+не\s+закри|не\s+закрива|не\s+відкрива)/iu)) return "Двері та замки";
  if (has(text, /(склопакет|вікн)/iu)) return "Вікна";
  if (has(text, /(покрів|дах)/iu)) return "Покрівля";
  if (has(text, /(парковк|розглянути\s+можливість)/iu)) return "Адміністративне питання";
  if (has(text, /(студент|розвантаж|вантаж|перенести|допомог|відправити)/iu)) return "Роботи студентів";
  if (has(text, /(холодиль|морозиль|температура|вітрин|компресор|камера)/iu)) return "Холодильне обладнання";
  if (has(text, /(кондиціон|вентиляц|витяжк|клімат)/iu)) return "Кондиціонування та вентиляція";
  if (has(text, /(стелаж|вітрин|ваги|торгове\s+обладнання|кошик|полиці)/iu)) return "Торгове обладнання";
  if (has(text, /(каса|pos|термінал|сканер|чек|фіскал)/iu)) return "Каси та POS-обладнання";
  if (has(text, /(комп'ют|компют|ноутбук|мереж|wi-?fi|інтернет|роутер|принтер)/iu)) return "Комп'ютери та мережа";
  if (has(text, /(зв'язок|звязок|телефон|мобільн|провайдер)/iu)) return "Інтернет та зв'язок";
  if (has(text, /(мебл|стіл|столик|бочк|шаф|шкаф|крісл|тумб)/iu)) return "Меблі";
  if (has(text, /(вивіск|банер|реклам|лайтбокс)/iu)) return "Вивіски та реклама";
  if (has(text, /(прибир|бруд|сміт|клінінг)/iu)) return "Прибирання";
  if (has(text, /(територ|двір|парков|фасад|благоустр|бордюр|плитк|дірк|отвір|миші|стіна|підлога|ремонт|будівельн|ручк)/iu)) return "Будівельні роботи";
  return "Інше";
}

export function inferWorkType(text: string): AiWorkType {
  const value = text.toLowerCase();
  if (/(пожеж|вогнегасник|небезпек|миші|санітар)/iu.test(value)) return "safety";
  if (/(встановити|поставити|повісити|змонтувати|зробити)/iu.test(value)) return "install";
  if (/(замінити|поміняти)/iu.test(value)) return "replace";
  if (/(розглянути|перевірити|оглянути|можливість)/iu.test(value)) return "inspect";
  if (/(прибрати|прибирання|сміття|бруд)/iu.test(value)) return "cleaning";
  if (/(документ|узгодити|адміністратив|парковк)/iu.test(value)) return "administrative";
  if (/(відремонтувати|ремонт|полагодити|прочистити|прикрутити|заробити|пофарбувати|закрити|не\s+працює|злам|тече|тіче|капає|гуде|не\s+можливо|неможливо)/iu.test(value)) return "repair";
  return "other";
}

export function recommendedDepartmentForCategory(category: string): string {
  const mapping: Record<string, string> = {
    "Сантехніка": "Сантехнік",
    "Електрика": "Електрик",
    "Будівельні роботи": "Будівельна бригада",
    "Малярні роботи": "Малярна бригада",
    "Покрівля": "Покрівельник",
    "Водовідведення": "Водовідведення",
    "Двері та замки": "Двері та замки",
    "Вікна": "Вікна",
    "Роботи студентів": "Студентська бригада",
    "Холодильне обладнання": "Холодильне обладнання",
    "Кондиціонування та вентиляція": "Кліматична служба",
    "Каси та POS-обладнання": "IT / POS",
    "Комп'ютери та мережа": "IT / POS",
    "Інтернет та зв'язок": "IT / POS",
    "Пожежна безпека": "Пожежна безпека",
    "Адміністративне питання": "Адміністрація",
    "Прибирання": "Технічний відділ",
    "Благоустрій території": "Будівельна бригада",
  };
  const department = mapping[category] ?? "Технічний відділ";
  return serviceDeskDepartments.includes(department as (typeof serviceDeskDepartments)[number]) ? department : "Технічний відділ";
}

export function classifyWorkItem(text: string): WorkClassification {
  const category = serviceDeskCategories.includes(inferCategory(text) as (typeof serviceDeskCategories)[number]) ? inferCategory(text) : "Інше";
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
