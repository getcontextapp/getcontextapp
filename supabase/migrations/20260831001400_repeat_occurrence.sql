-- Context: ensure repeating planned activities keep appearing at their cadence.
-- Run this in Supabase so scheduled cleanup creates due repeat occurrences
-- before old pending rows are marked abandoned.

create or replace function ensure_repeat_occurrences_for_date(target_date date default current_date)
returns integer
language plpgsql
security definer
as $$
declare
  series record;
  anchor_row planned_activities%rowtype;
  template_row planned_activities%rowtype;
  created_count integer := 0;
  inserted_count integer;
  due_today boolean;
begin
  for series in
    select coalesce(series_id, id) as series_id
    from planned_activities
    where repeat_rule <> 'none'
      and planned_for <= target_date
    group by coalesce(series_id, id)
  loop
    select *
    into anchor_row
    from planned_activities
    where coalesce(series_id, id) = series.series_id
      and repeat_rule <> 'none'
      and planned_for <= target_date
    order by planned_for asc, created_at asc
    limit 1;

    if not found then
      continue;
    end if;

    if exists (
      select 1
      from planned_activities
      where coalesce(series_id, id) = series.series_id
        and planned_for = target_date
    ) then
      continue;
    end if;

    due_today :=
      case anchor_row.repeat_rule
        when 'daily' then true
        when 'weekdays' then extract(isodow from target_date) between 1 and 5
        when 'weekly' then mod((target_date - anchor_row.planned_for), 7) = 0
        else false
      end;

    if not due_today then
      continue;
    end if;

    select *
    into template_row
    from planned_activities
    where coalesce(series_id, id) = series.series_id
      and repeat_rule <> 'none'
      and planned_for <= target_date
    order by planned_for desc, created_at desc
    limit 1;

    insert into planned_activities (
      household_id,
      created_by,
      assigned_to,
      category,
      label,
      note,
      expected_period,
      expected_time,
      planned_for,
      repeat_rule,
      series_id,
      source
    ) values (
      template_row.household_id,
      template_row.created_by,
      template_row.assigned_to,
      template_row.category,
      template_row.label,
      template_row.note,
      template_row.expected_period,
      template_row.expected_time,
      target_date,
      anchor_row.repeat_rule,
      series.series_id,
      template_row.source
    )
    on conflict do nothing;

    get diagnostics inserted_count = row_count;
    created_count := created_count + inserted_count;
  end loop;

  return created_count;
end;
$$;

create or replace function abandon_past_planned_activities()
returns integer
language plpgsql
security definer
as $$
declare
  updated_count integer;
begin
  perform ensure_repeat_occurrences_for_date(current_date);

  update planned_activities
  set status = 'abandoned',
      updated_at = now()
  where status in ('planned', 'not_now')
    and planned_for < current_date;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function ensure_repeat_occurrences_for_date(date) to service_role;
grant execute on function abandon_past_planned_activities() to service_role;
