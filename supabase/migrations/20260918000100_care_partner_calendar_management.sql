alter table public.profiles
  add column if not exists care_partner_calendar_management boolean not null default false;

-- A care partner may always view the household schedule. Schedule writes are
-- allowed only when the participant has explicitly enabled management.
drop policy if exists "household planned activities" on public.planned_activities;
create policy "household planned activities read"
  on public.planned_activities for select
  using (
    household_id in (
      select household_id from public.profiles where user_id = auth.uid()
    )
  );
create policy "participant or permitted care partner creates plans"
  on public.planned_activities for insert
  with check (
    exists (
      select 1
      from public.profiles actor
      where actor.user_id = auth.uid()
        and actor.household_id = planned_activities.household_id
        and (
          actor.role = 'mci_user'
          or exists (
            select 1 from public.profiles participant
            where participant.household_id = actor.household_id
              and participant.role = 'mci_user'
              and participant.care_partner_calendar_management = true
          )
        )
    )
  );
create policy "participant or permitted care partner changes plans"
  on public.planned_activities for update
  using (
    exists (
      select 1
      from public.profiles actor
      where actor.user_id = auth.uid()
        and actor.household_id = planned_activities.household_id
        and (
          actor.role = 'mci_user'
          or exists (
            select 1 from public.profiles participant
            where participant.household_id = actor.household_id
              and participant.role = 'mci_user'
              and participant.care_partner_calendar_management = true
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles actor
      where actor.user_id = auth.uid()
        and actor.household_id = planned_activities.household_id
        and (
          actor.role = 'mci_user'
          or exists (
            select 1 from public.profiles participant
            where participant.household_id = actor.household_id
              and participant.role = 'mci_user'
              and participant.care_partner_calendar_management = true
          )
        )
    )
  );
create policy "participant or permitted care partner deletes plans"
  on public.planned_activities for delete
  using (
    exists (
      select 1
      from public.profiles actor
      where actor.user_id = auth.uid()
        and actor.household_id = planned_activities.household_id
        and (
          actor.role = 'mci_user'
          or exists (
            select 1 from public.profiles participant
            where participant.household_id = actor.household_id
              and participant.role = 'mci_user'
              and participant.care_partner_calendar_management = true
          )
        )
    )
  );
