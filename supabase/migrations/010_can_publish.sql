-- Migration 010: Add can_publish permission to users
-- Gives individual users the ability to access the Publish/Post section
-- independently of the admin role, enabling a "publisher" capability.

alter table public.users
  add column if not exists can_publish boolean not null default false;

comment on column public.users.can_publish is
  'Grants access to the Publish section. Admins always have this. Set true for client users who should be able to post content.';
