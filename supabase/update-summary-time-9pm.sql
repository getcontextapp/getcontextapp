-- Context MVP: move existing daily summaries from 8 PM to 9 PM.
-- Run once in Supabase SQL Editor if existing profiles still show 08:00 PM.

update profiles
set daily_summary_time = '21:00'
where daily_summary_time = '20:00';

