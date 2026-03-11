-- ============================================================
-- AGENCY Bristol Client Review Portal - Database Schema
-- ============================================================

-- Companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  spokesperson_name text,
  logo_url text,
  brand_color text,
  created_at timestamptz default now()
);

-- Users (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('admin', 'client')),
  company_id uuid references public.companies(id),
  created_at timestamptz default now()
);

-- Weeks
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  week_number integer not null,
  year integer not null default 2026,
  date_start date not null,
  date_end date not null,
  title text,
  pillar text,
  theme text,
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'approved', 'changes_requested')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, week_number, year)
);

-- Content Pieces
create table public.content_pieces (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  content_type text not null check (content_type in ('social_post', 'blog_article', 'linkedin_article', 'pdf_guide')),
  title text not null,
  day_of_week text,
  scheduled_time text,
  markdown_body text not null,
  first_comment text,
  pillar text,
  audience_theme text,
  topic_bank_ref text,
  word_count integer,
  post_type text,
  sort_order integer not null default 0,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'changes_requested')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Content Images
create table public.content_images (
  id uuid primary key default gen_random_uuid(),
  content_piece_id uuid not null references public.content_pieces(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  public_url text not null,
  archetype text,
  dimensions text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Comments
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  content_piece_id uuid not null references public.content_pieces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('content_ready', 'piece_approved', 'changes_requested', 'comment_added')),
  week_id uuid references public.weeks(id) on delete cascade,
  content_piece_id uuid references public.content_pieces(id) on delete cascade,
  message text not null,
  read boolean default false,
  email_sent boolean default false,
  created_at timestamptz default now()
);

-- Indexes
create index idx_weeks_company on public.weeks(company_id);
create index idx_weeks_status on public.weeks(status);
create index idx_content_pieces_week on public.content_pieces(week_id);
create index idx_content_pieces_company on public.content_pieces(company_id);
create index idx_comments_piece on public.comments(content_piece_id);
create index idx_notifications_recipient on public.notifications(recipient_user_id);
create index idx_notifications_unread on public.notifications(recipient_user_id) where read = false;

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger weeks_updated_at before update on public.weeks
  for each row execute function update_updated_at();

create trigger content_pieces_updated_at before update on public.content_pieces
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.weeks enable row level security;
alter table public.content_pieces enable row level security;
alter table public.content_images enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

-- Helper: get current user's role
create or replace function public.get_user_role()
returns text as $$
  select role from public.users where id = auth.uid();
$$ language sql security definer stable;

-- Helper: get current user's company_id
create or replace function public.get_user_company_id()
returns uuid as $$
  select company_id from public.users where id = auth.uid();
$$ language sql security definer stable;

-- Companies: admin sees all, client sees own
create policy "Admin reads all companies" on public.companies
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own company" on public.companies
  for select using (id = public.get_user_company_id());
create policy "Admin manages companies" on public.companies
  for all using (public.get_user_role() = 'admin');

-- Users: admin sees all, users see themselves
create policy "Admin reads all users" on public.users
  for select using (public.get_user_role() = 'admin');
create policy "User reads self" on public.users
  for select using (id = auth.uid());
create policy "Admin manages users" on public.users
  for all using (public.get_user_role() = 'admin');

-- Weeks: admin sees all, client sees own company
create policy "Admin reads all weeks" on public.weeks
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own weeks" on public.weeks
  for select using (company_id = public.get_user_company_id());
create policy "Admin manages weeks" on public.weeks
  for all using (public.get_user_role() = 'admin');

-- Content Pieces: admin manages, client reads own company
create policy "Admin reads all pieces" on public.content_pieces
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own pieces" on public.content_pieces
  for select using (company_id = public.get_user_company_id());
create policy "Admin manages pieces" on public.content_pieces
  for all using (public.get_user_role() = 'admin');
-- Client can update approval_status on their own pieces
create policy "Client updates approval" on public.content_pieces
  for update using (company_id = public.get_user_company_id());

-- Content Images: follow parent piece access
create policy "Read images via piece access" on public.content_images
  for select using (
    exists (
      select 1 from public.content_pieces
      where id = content_images.content_piece_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );
create policy "Admin manages images" on public.content_images
  for all using (public.get_user_role() = 'admin');

-- Comments: read on accessible pieces, create on accessible pieces, edit/delete own
create policy "Read comments on accessible pieces" on public.comments
  for select using (
    exists (
      select 1 from public.content_pieces
      where id = comments.content_piece_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );
create policy "Create comments on accessible pieces" on public.comments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.content_pieces
      where id = comments.content_piece_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );
create policy "Delete own comments" on public.comments
  for delete using (user_id = auth.uid());

-- Notifications: own only
create policy "Read own notifications" on public.notifications
  for select using (recipient_user_id = auth.uid());
create policy "Update own notifications" on public.notifications
  for update using (recipient_user_id = auth.uid());
create policy "Admin creates notifications" on public.notifications
  for insert with check (public.get_user_role() = 'admin' or true);

-- ============================================================
-- Seed data: companies
-- ============================================================

insert into public.companies (name, slug, spokesperson_name, brand_color) values
  ('AGENCY Bristol', 'agency-bristol', 'Michael Colling-Tuck', '#0ea5e9'),
  ('Star Linen UK', 'star-linen-uk', 'Stephen Broadhurst', '#41CDA9');
