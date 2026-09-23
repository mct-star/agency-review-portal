-- Create a weeks row for every calendar week that only exists in calendar_slots,
-- then point the slots at it. The Week Board, Slot Planner and Content Review
-- all key on weeks, so a calendar-only week is invisible until this runs.
-- Idempotent: re-running adds nothing for weeks that already exist.
-- First run 23 Sept 2026 (17 weeks, 37 to 53, for AGENCY Bristol).

with w as (
  select company_id, year, week_number,
         min(week_start_date) as date_start,
         min(week_start_date) + 6 as date_end,
         max(case when day_of_week = 'monday' then left(topic, 70) end) as monday_topic,
         max(case when day_of_week = 'monday' then pillar end) as pillar,
         max(case when day_of_week = 'monday' then theme end) as theme
  from calendar_slots
  group by 1, 2, 3
)
insert into weeks (company_id, year, week_number, date_start, date_end, title, pillar, theme, status)
select w.company_id, w.year, w.week_number, w.date_start, w.date_end,
       coalesce(w.monday_topic, 'Week ' || w.week_number), w.pillar, w.theme, 'draft'
from w
where not exists (
  select 1 from weeks x
  where x.company_id = w.company_id and x.year = w.year and x.week_number = w.week_number
);

update calendar_slots s
set week_id = w.id
from weeks w
where w.company_id = s.company_id and w.year = s.year and w.week_number = s.week_number
  and s.week_id is null;
