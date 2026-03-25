import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://uppyxizmamlbrmtjadia.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_kQNxpczeGG7DypedX7_89Q_qtzqN-Dd'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── SCHEMA SQL ─────────────────────────────────────────────────────────────
// Run this once in Supabase → SQL Editor
//
// -- 1. Exercises library
// create table exercises (
//   id uuid primary key default gen_random_uuid(),
//   name text not null,
//   muscle_group text not null default 'Other',
//   coaching_notes text,
//   default_sets int default 3,
//   default_reps text default '8-10',
//   is_archived boolean default false,
//   created_at timestamptz default now()
// );
//
// -- 2. Divisions config
// create table divisions (
//   id uuid primary key default gen_random_uuid(),
//   session_type text not null check (session_type in ('Pull','Push','Legs')),
//   division_number int not null check (division_number between 1 and 5),
//   label text,
//   exercise_ids uuid[] default '{}',
//   created_at timestamptz default now(),
//   unique(session_type, division_number)
// );
//
// -- 3. Sessions
// create table sessions (
//   id uuid primary key default gen_random_uuid(),
//   session_type text not null check (session_type in ('Pull','Push','Legs')),
//   started_at timestamptz default now(),
//   finished_at timestamptz,
//   notes text
// );
//
// -- 4. Session exercises (which exercise was done in which division)
// create table session_exercises (
//   id uuid primary key default gen_random_uuid(),
//   session_id uuid references sessions(id) on delete cascade,
//   exercise_id uuid references exercises(id),
//   division_number int,
//   order_index int default 0,
//   created_at timestamptz default now()
// );
//
// -- 5. Sets logged
// create table sets (
//   id uuid primary key default gen_random_uuid(),
//   session_exercise_id uuid references session_exercises(id) on delete cascade,
//   set_number int not null,
//   reps int,
//   weight_lbs numeric(6,2),
//   notes text,
//   logged_at timestamptz default now()
// );
//
// -- 6. Personal records view (auto-maintained)
// create or replace view personal_records as
// select
//   e.id as exercise_id,
//   e.name as exercise_name,
//   e.muscle_group,
//   s.weight_lbs as pr_weight,
//   s.reps as pr_reps,
//   sess.started_at as achieved_at
// from sets s
// join session_exercises se on se.id = s.session_exercise_id
// join sessions sess on sess.id = se.session_id
// join exercises e on e.id = se.exercise_id
// where s.weight_lbs = (
//   select max(s2.weight_lbs)
//   from sets s2
//   join session_exercises se2 on se2.id = s2.session_exercise_id
//   where se2.exercise_id = se.exercise_id
// );
//
// -- RLS: enable on all tables, add permissive policy for anon (single-user app)
// alter table exercises enable row level security;
// alter table divisions enable row level security;
// alter table sessions enable row level security;
// alter table session_exercises enable row level security;
// alter table sets enable row level security;
//
// create policy "allow_all" on exercises for all using (true) with check (true);
// create policy "allow_all" on divisions for all using (true) with check (true);
// create policy "allow_all" on sessions for all using (true) with check (true);
// create policy "allow_all" on session_exercises for all using (true) with check (true);
// create policy "allow_all" on sets for all using (true) with check (true);
