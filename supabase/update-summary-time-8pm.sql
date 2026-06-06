-- Context MVP: move existing daily summaries from 9 PM to 8 PM.
-- Run once in Supabase SQL editor before participant testing.

update profiles
set daily_summary_time = '20:00'
where daily_summary_time = '21:00';
