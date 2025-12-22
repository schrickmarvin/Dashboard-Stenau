-- =========================================================
-- RLS STARTPAKET (Multi-User, Bereiche, Aufgaben, Anleitungen)
-- Tabellen: profiles, profile_areas
-- Policies für: areas, tasks, subtasks, guides
-- =========================================================

-- 0) Extensions (falls noch nicht aktiv)
create extension if not exists "pgcrypto";

-- 1) PROFILES (Rolle pro User)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user', -- 'admin' oder 'user'
  display_name text,
  created_at timestamptz not null default now()
);

-- 2) USER <-> BEREICHE (ein User kann mehrere Bereiche haben)
create table if not exists public.profile_areas (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, area_id)
);

create index if not exists profile_areas_area_id_idx on public.profile_areas(area_id);

-- 3) Auto-Profil anlegen, wenn neuer Auth-User entsteht
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (user_id, role, display_name)
  values (new.id, 'user', null)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 4) RLS AKTIVIEREN
alter table public.profiles enable row level security;
alter table public.profile_areas enable row level security;

alter table public.areas enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.guides enable row level security;

-- 5) POLICIES: profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "profiles_admin_update_any" on public.profiles;
create policy "profiles_admin_update_any"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (true);

-- 6) POLICIES: profile_areas
drop policy if exists "profile_areas_select_own_or_admin" on public.profile_areas;
create policy "profile_areas_select_own_or_admin"
on public.profile_areas
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "profile_areas_admin_manage" on public.profile_areas;
create policy "profile_areas_admin_manage"
on public.profile_areas
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- 7) POLICIES: areas (sehen: Mitglieder/Admin | ändern: nur Admin)
drop policy if exists "areas_select_member_or_admin" on public.areas;
create policy "areas_select_member_or_admin"
on public.areas
for select
to authenticated
using (
  exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.areas.id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "areas_admin_all" on public.areas;
create policy "areas_admin_all"
on public.areas
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- 8) POLICIES: tasks (CRUD nur in eigenen Bereichen oder Admin)
drop policy if exists "tasks_select_member_or_admin" on public.tasks;
create policy "tasks_select_member_or_admin"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.tasks.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "tasks_insert_member_or_admin" on public.tasks;
create policy "tasks_insert_member_or_admin"
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.tasks.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "tasks_update_member_or_admin" on public.tasks;
create policy "tasks_update_member_or_admin"
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.tasks.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.tasks.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "tasks_delete_member_or_admin" on public.tasks;
create policy "tasks_delete_member_or_admin"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.tasks.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- 9) POLICIES: subtasks (Zugriff über Parent-Task Bereich)
drop policy if exists "subtasks_select_member_or_admin" on public.subtasks;
create policy "subtasks_select_member_or_admin"
on public.subtasks
for select
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    join public.profile_areas pa on pa.area_id = t.area_id
    where t.id = public.subtasks.task_id
      and pa.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "subtasks_insert_member_or_admin" on public.subtasks;
create policy "subtasks_insert_member_or_admin"
on public.subtasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tasks t
    join public.profile_areas pa on pa.area_id = t.area_id
    where t.id = public.subtasks.task_id
      and pa.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "subtasks_update_member_or_admin" on public.subtasks;
create policy "subtasks_update_member_or_admin"
on public.subtasks
for update
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    join public.profile_areas pa on pa.area_id = t.area_id
    where t.id = public.subtasks.task_id
      and pa.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.tasks t
    join public.profile_areas pa on pa.area_id = t.area_id
    where t.id = public.subtasks.task_id
      and pa.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "subtasks_delete_member_or_admin" on public.subtasks;
create policy "subtasks_delete_member_or_admin"
on public.subtasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    join public.profile_areas pa on pa.area_id = t.area_id
    where t.id = public.subtasks.task_id
      and pa.user_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

-- 10) POLICIES: guides (Anleitungen) - Zugriff über area_id
drop policy if exists "guides_select_member_or_admin" on public.guides;
create policy "guides_select_member_or_admin"
on public.guides
for select
to authenticated
using (
  public.guides.area_id is null
  or exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.guides.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "guides_insert_member_or_admin" on public.guides;
create policy "guides_insert_member_or_admin"
on public.guides
for insert
to authenticated
with check (
  public.guides.area_id is null
  or exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.guides.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "guides_update_member_or_admin" on public.guides;
create policy "guides_update_member_or_admin"
on public.guides
for update
to authenticated
using (
  public.guides.area_id is null
  or exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.guides.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
)
with check (
  public.guides.area_id is null
  or exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.guides.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "guides_delete_member_or_admin" on public.guides;
create policy "guides_delete_member_or_admin"
on public.guides
for delete
to authenticated
using (
  public.guides.area_id is null
  or exists (
    select 1
    from public.profile_areas pa
    where pa.user_id = auth.uid()
      and pa.area_id = public.guides.area_id
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  )
);
