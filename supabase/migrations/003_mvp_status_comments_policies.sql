-- MVP fixes for real testing:
-- 1) store_manager can read objects connected to their own profile/managed object;
-- 2) store_manager can update tickets for their own object/created tickets;
-- 3) workers can update only assigned tickets.

create or replace function public.current_object_id()
returns uuid
language sql
stable
as $$
  select object_id from public.profiles where id = auth.uid()
$$;

drop policy if exists "objects read for operations roles" on public.objects;
create policy "objects read for permitted roles"
on public.objects
for select
to authenticated
using (
  public.current_role() in ('admin','management','tech_manager')
  or (
    public.current_role() = 'store_manager'
    and (
      id = public.current_object_id()
      or manager_id = auth.uid()
    )
  )
);

drop policy if exists "tech team update tickets" on public.tickets;
create policy "permitted users update tickets"
on public.tickets
for update
to authenticated
using (
  public.current_role() in ('admin','tech_manager')
  or (public.current_role() = 'worker' and assigned_to = auth.uid())
  or (public.current_role() = 'store_manager' and (object_id = public.current_object_id() or created_by = auth.uid()))
)
with check (
  public.current_role() in ('admin','tech_manager')
  or (public.current_role() = 'worker' and assigned_to = auth.uid())
  or (public.current_role() = 'store_manager' and (object_id = public.current_object_id() or created_by = auth.uid()))
);
