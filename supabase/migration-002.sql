-- ============================================================================
-- LIFT — migration 002
-- Configurable splits · exercise notes · app config · orphan cleanup
--
-- Run this ONCE in Supabase → SQL Editor.
-- Safe to re-run: every statement is guarded.
-- Run it while NOT mid-workout (step 5 sweeps empty session_exercises rows).
-- ============================================================================


-- ── 1. Drop the hardcoded Pull/Push/Legs constraints ────────────────────────
-- session_type stays a plain text column so every existing session and
-- division row keeps working untouched. Renaming a split rewrites the string
-- in both tables (the app does this for you in Settings).

alter table sessions  drop constraint if exists sessions_session_type_check;
alter table divisions drop constraint if exists divisions_session_type_check;

-- Division count was capped at 5, then hand-patched to 6. Remove the cap.
alter table divisions drop constraint if exists divisions_division_number_check;
alter table divisions add  constraint divisions_division_number_check
  check (division_number between 1 and 12);


-- ── 2. Splits table ─────────────────────────────────────────────────────────
create table if not exists splits (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  color           text not null default '#3b82f6',
  subtitle        text,
  division_count  int  not null default 5 check (division_count between 1 and 12),
  sort_order      int  not null default 0,
  is_archived     boolean not null default false,
  created_at      timestamptz default now()
);

-- Seed from the three you already use, preserving their existing accent colors.
insert into splits (name, color, subtitle, division_count, sort_order) values
  ('Pull', '#3b82f6', 'Deadlifts · Rows · Lat work · Curls',   5, 0),
  ('Push', '#a855f7', 'Bench · Shoulders · Triceps · Cables',  5, 1),
  ('Legs', '#22c55e', 'Squats · Hip Thrust · Lunges · Calves', 5, 2)
on conflict (name) do nothing;


-- ── 3. Exercise notes ───────────────────────────────────────────────────────
-- Your own running log per exercise, separate from the static coaching cues
-- in exercises.coaching_notes.

create table if not exists exercise_notes (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid references exercises(id) on delete cascade,
  session_id   uuid references sessions(id)  on delete set null,
  body         text not null,
  created_at   timestamptz default now()
);

create index if not exists exercise_notes_exercise_idx
  on exercise_notes (exercise_id, created_at desc);


-- ── 4. App config (key → JSON) ──────────────────────────────────────────────
-- Cross-device settings: which lifts the dashboard tracks, timer defaults.

create table if not exists app_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);


-- ── 5. Clean up orphaned session_exercises ──────────────────────────────────
-- These are the phantom duplicates in History: rows written the instant you
-- tapped an exercise, then abandoned via "change" or by leaving the screen.
-- The app no longer creates them (rows are now written on first logged set).

delete from session_exercises se
where not exists (
  select 1 from sets s where s.session_exercise_id = se.id
);


-- ── 6. Index for the last-session lookup ────────────────────────────────────
create index if not exists session_exercises_exercise_idx
  on session_exercises (exercise_id);

create index if not exists sets_se_idx
  on sets (session_exercise_id, set_number);


-- ── 7. RLS (single-user app — permissive, matching your existing tables) ────
alter table splits         enable row level security;
alter table exercise_notes enable row level security;
alter table app_config     enable row level security;

drop policy if exists "allow_all" on splits;
drop policy if exists "allow_all" on exercise_notes;
drop policy if exists "allow_all" on app_config;

create policy "allow_all" on splits         for all using (true) with check (true);
create policy "allow_all" on exercise_notes for all using (true) with check (true);
create policy "allow_all" on app_config     for all using (true) with check (true);
