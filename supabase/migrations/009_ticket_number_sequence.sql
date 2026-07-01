create sequence if not exists public.ticket_number_seq;

do $$
declare
  current_year text := to_char(now(), 'YYYY');
  max_number bigint;
begin
  select coalesce(max(substring(number from ('^PSD-' || current_year || '-(\d+)$'))::bigint), 0)
  into max_number
  from public.tickets
  where number like ('PSD-' || current_year || '-%');

  if max_number > 0 then
    perform setval('public.ticket_number_seq', max_number, true);
  end if;
end;
$$;

create or replace function public.next_ticket_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year text := to_char(now(), 'YYYY');
  next_value bigint;
  candidate text;
begin
  loop
    next_value := nextval('public.ticket_number_seq');
    candidate := 'PSD-' || current_year || '-' || lpad(next_value::text, 4, '0');

    if not exists (
      select 1
      from public.tickets
      where number = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

grant execute on function public.next_ticket_number() to authenticated;
grant execute on function public.next_ticket_number() to service_role;
