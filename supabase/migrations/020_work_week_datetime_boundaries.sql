alter table public.work_plans
  alter column period_start type timestamptz
    using (period_start::timestamp at time zone 'Europe/Kyiv'),
  alter column period_end type timestamptz
    using (period_end::timestamp at time zone 'Europe/Kyiv');

alter table public.weekly_periods
  alter column week_start type timestamptz
    using (week_start::timestamp at time zone 'Europe/Kyiv'),
  alter column week_end type timestamptz
    using (week_end::timestamp at time zone 'Europe/Kyiv');
