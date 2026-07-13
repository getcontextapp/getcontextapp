-- Context: keep repeated tasks canonical at the database function layer.
-- Run this in Supabase after repeat-occurrence-backfill.sql.

create or replace function normalize_repeat_task_text(input_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(input_text, '')),
          '[^a-z0-9\s]', ' ', 'g'
        ),
        '\m(please|remind me to|i need to|i want to|i plan to|i will|go to the|go to|finish|complete|do|work on|start|continue|respond to)\M',
        ' ',
        'g'
      ),
      '\m(the|a|an|my|today|tomorrow)\M',
      ' ',
      'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

create or replace function repeat_task_family_key(row planned_activities)
returns text
language sql
stable
as $$
  select concat_ws(
    '|',
    coalesce(row.assigned_to::text, row.created_by::text),
    row.repeat_rule,
    normalize_repeat_task_text(coalesce(row.note, row.label))
  );
$$;

create or replace function skip_duplicate_repeat_occurrences_for_date(target_date date default current_date)
returns integer
language plpgsql
security definer
as $$
declare
  updated_count integer;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by repeat_task_family_key(planned_activities)
        order by
          case status when 'confirmed' then 0 when 'planned' then 1 else 2 end,
          case when expected_time is not null then 0 when expected_period <> 'anytime' then 1 else 2 end,
          updated_at desc,
          created_at asc
      ) as family_rank
    from planned_activities
    where planned_for = target_date
      and repeat_rule <> 'none'
      and status in ('planned', 'not_now', 'confirmed')
      and normalize_repeat_task_text(coalesce(note, label)) <> ''
  )
  update planned_activities
  set status = 'skipped',
      updated_at = now()
  where id in (
    select id
    from ranked
    where family_rank > 1
  )
    and status in ('planned', 'not_now');

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function ensure_repeat_occurrences_for_date(target_date date default current_date)
returns integer
language plpgsql
security definer
as $$
declare
  repeat_family record;
  anchor_row planned_activities%rowtype;
  template_row planned_activities%rowtype;
  created_count integer := 0;
  inserted_count integer;
  due_today boolean;
begin
  perform skip_duplicate_repeat_occurrences_for_date(target_date);

  for repeat_family in
    select repeat_task_family_key(planned_activities) as family_key
    from planned_activities
    where repeat_rule <> 'none'
      and planned_for <= target_date
      and status not in ('skipped', 'abandoned')
      and normalize_repeat_task_text(coalesce(note, label)) <> ''
    group by repeat_task_family_key(planned_activities)
  loop
    select *
    into anchor_row
    from planned_activities
    where repeat_task_family_key(planned_activities) = repeat_family.family_key
      and repeat_rule <> 'none'
      and planned_for <= target_date
      and status not in ('skipped', 'abandoned')
    order by planned_for asc, created_at asc
    limit 1;

    if not found then
      continue;
    end if;

    if exists (
      select 1
      from planned_activities
      where repeat_task_family_key(planned_activities) = repeat_family.family_key
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
    where repeat_task_family_key(planned_activities) = repeat_family.family_key
      and repeat_rule <> 'none'
      and planned_for <= target_date
      and status not in ('skipped', 'abandoned')
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
      coalesce(anchor_row.series_id, anchor_row.id),
      template_row.source
    )
    on conflict do nothing;

    get diagnostics inserted_count = row_count;
    created_count := created_count + inserted_count;
  end loop;

  perform skip_duplicate_repeat_occurrences_for_date(target_date);
  return created_count;
end;
$$;

grant execute on function normalize_repeat_task_text(text) to service_role;
grant execute on function repeat_task_family_key(planned_activities) to service_role;
grant execute on function skip_duplicate_repeat_occurrences_for_date(date) to service_role;
grant execute on function ensure_repeat_occurrences_for_date(date) to service_role;
