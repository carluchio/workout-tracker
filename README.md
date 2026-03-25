# LIFT — Workout Tracker

A mobile-first workout logging app built with React + Vite + Supabase.

## Stack
- **Frontend**: React 18, React Router, Vite
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Fonts**: Bebas Neue (headings), DM Sans (body), DM Mono (numbers)

## Setup

### 1. Supabase — run this SQL in your SQL Editor

```sql
-- Exercises library
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null default 'Other',
  coaching_notes text,
  default_sets int default 3,
  default_reps text default '8-10',
  is_archived boolean default false,
  created_at timestamptz default now()
);

-- Divisions config
create table divisions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('Pull','Push','Legs')),
  division_number int not null check (division_number between 1 and 5),
  label text,
  exercise_ids uuid[] default '{}',
  created_at timestamptz default now(),
  unique(session_type, division_number)
);

-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('Pull','Push','Legs')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  notes text
);

-- Session exercises
create table session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  exercise_id uuid references exercises(id),
  division_number int,
  order_index int default 0,
  created_at timestamptz default now()
);

-- Sets
create table sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid references session_exercises(id) on delete cascade,
  set_number int not null,
  reps int,
  weight_lbs numeric(6,2),
  notes text,
  logged_at timestamptz default now()
);

-- Personal records view
create or replace view personal_records as
select
  e.id as exercise_id,
  e.name as exercise_name,
  e.muscle_group,
  s.weight_lbs as pr_weight,
  s.reps as pr_reps,
  sess.started_at as achieved_at
from sets s
join session_exercises se on se.id = s.session_exercise_id
join sessions sess on sess.id = se.session_id
join exercises e on e.id = se.exercise_id
where s.weight_lbs = (
  select max(s2.weight_lbs)
  from sets s2
  join session_exercises se2 on se2.id = s2.session_exercise_id
  where se2.exercise_id = se.exercise_id
);

-- RLS policies
alter table exercises enable row level security;
alter table divisions enable row level security;
alter table sessions enable row level security;
alter table session_exercises enable row level security;
alter table sets enable row level security;

create policy "allow_all" on exercises for all using (true) with check (true);
create policy "allow_all" on divisions for all using (true) with check (true);
create policy "allow_all" on sessions for all using (true) with check (true);
create policy "allow_all" on session_exercises for all using (true) with check (true);
create policy "allow_all" on sets for all using (true) with check (true);
```

### 2. Install and run locally
```bash
npm install
npm run dev
```

### 3. Deploy to Vercel
1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import your GitHub repo
3. Framework preset: **Vite**
4. Click Deploy — done

## First-time app setup
1. Go to **Library** → add your exercises
2. Go to **Settings** → assign exercises to each division for Pull / Push / Legs
3. Tap **Log** → select session type → start training

## Features
- **Log** — select Pull/Push/Legs, work through 5 divisions, log sets with reps/weight steppers
- **Last session ghost** — see previous performance before each set
- **Rest timer** — floating button, 60s default, ±15s adjustable
- **Dashboard** — 6 key lifts with PR, last session, and sparkline trend
- **History** — chronological sessions with expandable set detail
- **PRs** — all-time bests grouped by Pull/Push/Legs
- **Library** — full exercise catalogue with history and PR highlight
- **Settings** — customize which exercises appear in each division slot
