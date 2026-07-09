alter table public.work_plans enable row level security;
alter table public.work_plan_items enable row level security;
alter table public.work_plan_dispatches enable row level security;

drop policy if exists "Managers can view work plans" on public.work_plans;
create policy "Managers can view work plans"
on public.work_plans for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can create work plans" on public.work_plans;
create policy "Managers can create work plans"
on public.work_plans for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can update work plans" on public.work_plans;
create policy "Managers can update work plans"
on public.work_plans for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Admins can delete work plans" on public.work_plans;
create policy "Admins can delete work plans"
on public.work_plans for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

drop policy if exists "Managers can view work plan items" on public.work_plan_items;
create policy "Managers can view work plan items"
on public.work_plan_items for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can create work plan items" on public.work_plan_items;
create policy "Managers can create work plan items"
on public.work_plan_items for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can update work plan items" on public.work_plan_items;
create policy "Managers can update work plan items"
on public.work_plan_items for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can delete work plan items" on public.work_plan_items;
create policy "Managers can delete work plan items"
on public.work_plan_items for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can view work plan dispatches" on public.work_plan_dispatches;
create policy "Managers can view work plan dispatches"
on public.work_plan_dispatches for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can create work plan dispatches" on public.work_plan_dispatches;
create policy "Managers can create work plan dispatches"
on public.work_plan_dispatches for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Managers can update work plan dispatches" on public.work_plan_dispatches;
create policy "Managers can update work plan dispatches"
on public.work_plan_dispatches for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'management', 'tech_manager')
  )
);

drop policy if exists "Admins can delete work plan dispatches" on public.work_plan_dispatches;
create policy "Admins can delete work plan dispatches"
on public.work_plan_dispatches for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);
