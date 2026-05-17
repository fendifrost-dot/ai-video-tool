-- Phase A — Drift detection feedback hook
-- Add drift_flags JSONB column to clip_reviews so the AVT save path can record
-- which features came in low (< 7) on each review. Feeds the future drift
-- auto-reinforcement loop.
-- Idempotent: safe to re-run.

alter table public.clip_reviews
  add column if not exists drift_flags jsonb not null default '[]'::jsonb;
