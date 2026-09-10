# Синхронізація об'єктів і директорів

## Проблема

На сторінці `/objects` об'єкти були видимі як звичайний довідник, але не було повної картини по директорах магазинів:

- які директори прив'язані до конкретного об'єкта;
- які прив'язки очікують підтвердження;
- які об'єкти створені директором і потребують перевірки;
- які директори ще не мають жодного об'єкта.

Через це адмін міг бачити об'єкти і директорів у різних місцях, але не мав нормального екрану синхронізації.

## Таблиці

Використовуються існуючі таблиці:

- `objects`
- `profiles` з `role = 'store_director'`
- `director_objects`

Реальна схема `director_objects`:

- `profile_id`
- `object_id`
- `phone`
- `is_primary`
- `approval_status`
- `approved_at`
- `approved_by_profile_id`
- `rejected_at`
- `rejection_reason`
- `note`

У `objects` немає окремого поля `phone`, тому сторінка не використовує неіснуючий телефон об'єкта.

## Як `/objects` показує директорів

Для кожного об'єкта сторінка показує:

- назву, номер і адресу;
- badges `Без директора`, `Очікує підтвердження`, `Створено директором`, `Потребує заповнення`;
- усі прив'язки директорів до об'єкта;
- статус кожної прив'язки: `approved`, `pending`, `rejected`;
- позначку `Primary`;
- дії для адміністрування прив'язок.

Об'єкт вважається без директора, якщо він не має жодної `approved` прив'язки у `director_objects`.

## Фільтри

На `/objects` додано швидкі фільтри:

- `Усі об'єкти`
- `Без директора`
- `Очікують підтвердження`
- `Потребують перевірки`

`Потребують перевірки` включає об'єкти, де:

- `objects.needs_admin_review = true`
- або `objects.source = 'director_registration'`

## Директори без об'єкта

Окремий блок показує директорів:

- `profiles.role = 'store_director'`
- `approval_status = 'approved'` або `pending`
- немає жодної active прив'язки `approved` або `pending`

Rejected-прив'язки не рахуються як активний об'єкт директора.

## Прив'язка директора

Action `linkDirectorToObjectAction`:

1. Перевіряє роль: `admin`, `management`, `tech_manager`.
2. Перевіряє, що profile існує і має `role = 'store_director'`.
3. Перевіряє, що object існує.
4. Робить `upsert` у `director_objects` по парі `profile_id, object_id`.
5. Ставить `approval_status = 'approved'`.
6. Заповнює `approved_at` і `approved_by_profile_id`.
7. Не змінює `profiles.approval_status` директора.

Якщо вибрано `Primary`, система спочатку скидає `is_primary = false` для інших директорів цього object, а потім робить нову прив'язку primary.

## Відв'язка

Action `unlinkDirectorFromObjectAction`:

- не видаляє `profile`;
- не видаляє `object`;
- видаляє тільки запис `director_objects` для пари director/object.

Після цього director portal не бачить цей об'єкт, бо портал читає тільки `director_objects.approval_status = 'approved'`.

## Pending approval

Pending-прив'язки видно на `/objects`.

Для pending доступно:

- `Підтвердити`
- `Відхилити`

Підтвердження ставить:

- `approval_status = 'approved'`
- `approved_at`
- `approved_by_profile_id`

Відхилення ставить:

- `approval_status = 'rejected'`
- `rejected_at`
- `rejection_reason`
- `is_primary = false`

## Primary director

Primary задається на рівні object:

- перед встановленням нового primary всі інші `director_objects` цього `object_id` отримують `is_primary = false`;
- новий link отримує `is_primary = true`;
- це не змінює старі tickets.

## Director portal

Director portal лишається на існуючому правилі:

```text
director_objects.profile_id = current profile
director_objects.approval_status = 'approved'
```

Директор бачить тільки approved об'єкти і може створювати заявки тільки по approved object.

## Старі заявки

Зміна або видалення прив'язки не переписує старі заявки:

- `tickets.object_id` лишається тим самим;
- `tickets.director_profile_id` лишається тим самим;
- історія заявок не переноситься між директорами.

## SQL для перевірки

Усі директори:

```sql
select id, full_name, phone, email, role, approval_status
from profiles
where role = 'store_director'
order by created_at desc;
```

Директори без об'єкта:

```sql
select p.id, p.full_name, p.phone, p.approval_status
from profiles p
left join director_objects do on do.profile_id = p.id
where p.role = 'store_director'
group by p.id, p.full_name, p.phone, p.approval_status
having count(do.object_id) = 0;
```

Об'єкти без approved директора:

```sql
select o.id, o.name, o.address, o.object_number
from objects o
left join director_objects do
on do.object_id = o.id
and do.approval_status = 'approved'
where do.object_id is null
order by o.name;
```

Всі прив'язки:

```sql
select
p.full_name as director_name,
p.phone as director_phone,
p.approval_status as director_status,
o.name as object_name,
o.address,
do.approval_status as link_status,
do.is_primary
from director_objects do
join profiles p on p.id = do.profile_id
join objects o on o.id = do.object_id
order by o.name, p.full_name;
```

## Known issues

- Автоматична масова прив'язка директорів до об'єктів не робиться без явного бізнес-правила.
- Відв'язка реалізована як delete `director_objects`; якщо потрібен повний audit trail по відв'язках, краще окремо додати журнал подій.
- Блок вибору об'єкта для директора без об'єкта використовує існуючий довідник об'єктів; очевидні дублікати адрес не виправляються автоматично.
