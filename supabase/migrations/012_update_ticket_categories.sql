begin;

insert into public.categories (name, description, is_active)
values
  ('Будівельні роботи', 'Фасад та зовнішні роботи, плитка, ремонт, покраска, монтажні та загальнобудівельні роботи, вентиляція.', true),
  ('Сантехніка', 'Роботи з водопостачанням, проблеми або поламане сантехнічне обладнання, поламаний кран, протікає вода, протікає кран, протікання та подібні проблеми з водою.', true),
  ('Каналізація', 'Не збігає вода, забита раковина, не змиває унітаз, не сходить вода, забита каналізація та подібні проблеми зі стоками.', true),
  ('Електрика', 'Електроживлення, освітлення, автомати, розетки, електромережі, дзвінки з вулиці та все, що стосується електрики.', true),
  ('Вікна / двері / фурнітура', 'Зламаний замок, не працює замок, зламаний ключ, розбите вікно, не працює доводчик дверей, проблеми з доводчиком, заїдає замок, двері не відкриваються, проблеми з дверима, вікнами та фурнітурою.', true),
  ('Буд-роботи, зварювальні, ремонтні проф', 'Двір, парковка, прилегла територія, ремонт лавок, зварювальні роботи, ремонт стільців, столів та інші ремонтні профільні роботи.', true),
  ('Студенти', 'Допоміжні роботи, які виконують студентські бригади: вивезти обладнання, прибирання приміщень, санітарний стан, клінінг, косіння трави, прибирання на дахах.', true)
on conflict (name) do update
set
  description = excluded.description,
  is_active = true;

create temp table ticket_category_mapping on commit drop as
select
  old_categories.id as old_id,
  new_categories.id as new_id
from public.categories old_categories
join public.categories new_categories
  on new_categories.name =
    case
      when old_categories.name in (
        'Будівельні роботи',
        'Малярні роботи',
        'Покрівля',
        'Холодильне обладнання',
        'Кондиціонування та вентиляція',
        'Торгове обладнання',
        'Вивіски та реклама',
        'Пожежна безпека',
        'Адміністративне питання',
        'Інше'
      ) then 'Будівельні роботи'
      when old_categories.name in ('Сантехніка') then 'Сантехніка'
      when old_categories.name in ('Каналізація', 'Водовідведення') then 'Каналізація'
      when old_categories.name in (
        'Електрика',
        'Каси та POS-обладнання',
        'Комп''ютери та мережа',
        'Інтернет та зв''язок'
      ) then 'Електрика'
      when old_categories.name in ('Двері та замки', 'Вікна') then 'Вікна / двері / фурнітура'
      when old_categories.name in ('Меблі', 'Благоустрій території') then 'Буд-роботи, зварювальні, ремонтні проф'
      when old_categories.name in ('Роботи студентів', 'Студенти', 'Прибирання') then 'Студенти'
      else 'Будівельні роботи'
    end
where old_categories.name not in (
  'Будівельні роботи',
  'Сантехніка',
  'Каналізація',
  'Електрика',
  'Вікна / двері / фурнітура',
  'Буд-роботи, зварювальні, ремонтні проф',
  'Студенти'
);

update public.tickets tickets
set category_id = mapping.new_id
from ticket_category_mapping mapping
where tickets.category_id = mapping.old_id;

insert into public.worker_categories (worker_id, category_id)
select distinct worker_categories.worker_id, mapping.new_id
from public.worker_categories worker_categories
join ticket_category_mapping mapping on mapping.old_id = worker_categories.category_id
on conflict (worker_id, category_id) do nothing;

delete from public.worker_categories worker_categories
using ticket_category_mapping mapping
where worker_categories.category_id = mapping.old_id;

update public.categories
set is_active = false
where name not in (
  'Будівельні роботи',
  'Сантехніка',
  'Каналізація',
  'Електрика',
  'Вікна / двері / фурнітура',
  'Буд-роботи, зварювальні, ремонтні проф',
  'Студенти'
);

commit;
