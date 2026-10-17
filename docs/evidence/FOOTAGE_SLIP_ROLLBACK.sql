-- Rollback of supabase/migrations/20261017210000_footage_slip.sql.
-- Run in the Lovable SQL editor only if the slip has to come out. It drops every hand alignment made with it.
-- 1. duplicate_variation(): back to the body of 20261008230000 (re-run that file's create or replace function).
-- 2. the column and its check:
alter table public.shot_asset_assignments drop constraint if exists shot_asset_assignments_slip_check;
alter table public.shot_asset_assignments drop column if exists slip_seconds;
