# Dashboard plan refresh modal fixes

## Scroll problem

Modal "Оновити плани" відкривався через portal і мав високий z-index, але внутрішня структура змішувала кілька scroll-зон:

- summary/error блоки були поза формою;
- форма мала `flex-1` та `overflow-hidden`;
- список мав власний `overflow-y-auto`;
- після автопланування великий summary міг забирати висоту, а нижня частина форми обрізалась.

Виправлення:

- fixed modal content тепер має `overflow-y-auto overscroll-contain`;
- modal обмежений `max-h-[calc(100dvh-16px)]` на mobile;
- форма більше не обрізає власний контент через `overflow-hidden`;
- footer зроблено `sticky bottom-0`, щоб дії лишались доступними;
- `document.body` і далі блокується через `overflow: hidden`, поки modal відкритий.

## Error reasons

Раніше автопланування могло показувати generic текст на кшталт "не вдалося додати в план", без реальної причини.

Тепер кожна detail-запис у summary має:

- `reasonCode`;
- `reasonText`;
- короткий message із номером заявки.

## Reason codes

- `already_planned_current_week` - заявка вже є в плані вибраного тижня.
- `already_planned_other_active_week` - заявка ще прив'язана до іншого активного плану; спочатку потрібно натиснути "Оновити систему".
- `pending_review` - заявку треба спочатку підтвердити.
- `rejected` - відхилені заявки не додаються в план.
- `cancelled` - скасовані заявки не додаються в план.
- `done` - виконані заявки не додаються в план.
- `missing_category` - у заявки немає категорії.
- `category_not_mapped` - для категорії не налаштований маршрут.
- `worker_not_found` - не знайдено виконавця для категорії.
- `worker_inactive` - виконавець неактивний або недоступний.
- `draft_plan_not_found` - не знайдено або не створено draft-план.
- `plan_already_sent` - план вибраного тижня вже надісланий.
- `insert_failed` - Supabase повернув помилку при insert у `work_plan_items`.
- `update_failed` - Supabase повернув помилку при оновленні заявки.
- `check_existing_failed` - не вдалося перевірити, чи заявка вже є у плані.
- `no_active_tickets` - немає активних заявок для автопланування.

## Summary display

Після автопланування modal показує:

- загальні лічильники;
- згруповані причини з кількістю;
- перші 20 деталей;
- повідомлення "Показано перші N із M", якщо деталей більше.

## Known issues

- Результат усе ще передається через redirect query params, тому показуються агреговані й перші 20 деталей, а не повний лог усіх заявок.
- Якщо потрібно бачити повний список 100+ причин без обмежень URL, наступним етапом краще перейти на client-side action result або тимчасове server-side result store.
