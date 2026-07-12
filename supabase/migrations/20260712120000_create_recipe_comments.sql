create extension if not exists pgcrypto;

create type public.comment_status as enum ('pending', 'approved', 'rejected');

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null check (recipe_id ~ '^[a-z0-9-]{1,64}$'),
  author_name text not null check (char_length(author_name) between 2 and 60),
  body text not null check (char_length(body) between 3 and 1200),
  language text not null default 'de' check (language in ('de', 'en')),
  status public.comment_status not null default 'pending',
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null
);

create index comments_recipe_approved_idx
  on public.comments (recipe_id, created_at desc)
  where status = 'approved';

create index comments_moderation_queue_idx
  on public.comments (status, created_at asc);

create table public.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.comment_rate_limits (
  client_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0)
);

alter table public.comments enable row level security;
alter table public.moderators enable row level security;
alter table public.comment_rate_limits enable row level security;

create or replace function public.is_moderator(candidate uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select candidate is not null
    and exists (select 1 from public.moderators where user_id = candidate);
$$;

revoke all on function public.is_moderator(uuid) from public;
grant execute on function public.is_moderator(uuid) to anon, authenticated;

create policy "Approved comments are public"
on public.comments for select
to anon, authenticated
using (status = 'approved' or public.is_moderator());

create policy "Moderators can update comments"
on public.comments for update
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "Moderators can delete comments"
on public.comments for delete
to authenticated
using (public.is_moderator());

create policy "Moderators can view their role"
on public.moderators for select
to authenticated
using (user_id = auth.uid() or public.is_moderator());

grant select on public.comments to anon, authenticated;
grant update (status, moderated_at, moderated_by) on public.comments to authenticated;
grant delete on public.comments to authenticated;
grant select on public.moderators to authenticated;

comment on table public.moderators is
  'Bootstrap the first moderator in the SQL editor: insert into public.moderators (user_id) select id from auth.users where email = ''moderator@example.com'';';

