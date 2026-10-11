-- Native Ops is an authenticated server facade over the existing content store.
-- Private state is accessible only through service-role scoped routes/workers.
create table public.ops_content_workflows (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 week_id uuid not null unique references public.weeks(id),
 revision integer not null default 1,
 legacy_week_label text,
 answers jsonb not null default '{}', messages jsonb not null default '[]',
 source_inventory jsonb not null default '[]',
 plan_json jsonb, plan_markdown text, plan_revision integer,
 plan_status text not null default 'interview' check(plan_status in ('interview','draft','approved')),
 approved_at timestamptz, approved_by uuid references public.users(id), approved_snapshot jsonb,
 last_job_id uuid references public.content_generation_jobs(id),
 model text not null, model_label text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ops_content_media (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 bucket text not null check(bucket in ('captures','content-drafts')),
 storage_path text not null, kind text not null check(kind in ('photo','video','document')),
 role text not null default 'source' check(role in ('source','final')),
 version text not null, filename text not null, mime_type text not null, size_bytes bigint not null,
 week_id uuid references public.weeks(id), content_piece_id uuid references public.content_pieces(id),
 source_context text, rights jsonb, registered boolean not null default false, has_burned_captions boolean not null default false, created_by uuid not null references public.users(id),
 created_at timestamptz not null default now(), unique(bucket,storage_path)
);
alter table public.content_pieces add column ops_content_metadata jsonb not null default '{}';
create unique index content_pieces_ops_slot_uniq on public.content_pieces
 (company_id,(ops_content_metadata->>'workflow_id'),(ops_content_metadata->>'workflow_revision'),(ops_content_metadata->>'slot_id'))
 where ops_content_metadata->>'slot_id' is not null;
create table public.ops_content_reviews (
 content_piece_id uuid primary key references public.content_pieces(id) on delete cascade,
 revision integer not null default 1, approved_revision integer, watched_revision integer,
 approved_snapshot jsonb, approved_by uuid references public.users(id), approved_at timestamptz,
 exported_at timestamptz, release_job_id uuid references public.content_generation_jobs(id),
 updated_at timestamptz not null default now()
);
create table public.ops_content_operations (
 company_id uuid not null references public.companies(id), operation_key uuid not null,
 request_hash text not null, state text not null default 'running' check(state in ('running','complete')),
 response jsonb, status integer, created_at timestamptz not null default now(),
 primary key(company_id,operation_key)
);
alter table public.ops_content_workflows enable row level security;
alter table public.ops_content_media enable row level security;
alter table public.ops_content_reviews enable row level security;
alter table public.ops_content_operations enable row level security;
revoke all on public.ops_content_workflows,public.ops_content_media,public.ops_content_reviews,public.ops_content_operations from anon,authenticated;
grant all on public.ops_content_workflows,public.ops_content_media,public.ops_content_reviews,public.ops_content_operations to service_role;

-- Approved snapshots/watch acknowledgements become invalid even when another
-- portal interface or the worker edits the authoritative piece/media rows.
create function public.ops_content_piece_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.ops_content_metadata='{}'::jsonb and (tg_op='INSERT' or old.ops_content_metadata='{}'::jsonb) then return new; end if;
 if tg_op='INSERT' then
  insert into ops_content_reviews(content_piece_id) values(new.id) on conflict do nothing;
 elsif row(new.markdown_body,new.first_comment,new.title,new.content_type,new.post_type,new.cover_image_url,new.scheduled_date,new.scheduled_time,new.ops_content_metadata)
    is distinct from row(old.markdown_body,old.first_comment,old.title,old.content_type,old.post_type,old.cover_image_url,old.scheduled_date,old.scheduled_time,old.ops_content_metadata) then
  if exists(select 1 from publishing_jobs where content_piece_id=new.id and publish_payload->>'native_ops'='true') then raise exception 'RELEASE_LOCKED'; end if;
  if exists(select 1 from content_generation_jobs where content_piece_id=new.id and job_type='ops_linkedin_publish' and status in ('queued','running')) then raise exception 'RELEASE_BUSY'; end if;
  insert into ops_content_reviews(content_piece_id,revision) values(new.id,2)
  on conflict(content_piece_id) do update set revision=ops_content_reviews.revision+1,
   approved_revision=null,watched_revision=null,approved_snapshot=null,approved_at=null,approved_by=null,updated_at=now();
  update content_pieces set approval_status='pending' where id=new.id and approval_status<>'pending';
 end if;
 return new;
end $$;
revoke execute on function public.ops_content_piece_revision() from public,anon,authenticated;
create trigger ops_content_piece_revision after insert or update on public.content_pieces for each row execute function public.ops_content_piece_revision();
create function public.ops_content_asset_revision() returns trigger language plpgsql security definer set search_path=public as $$
declare piece_id uuid; affected uuid[];
begin
 if tg_op='DELETE' then affected=array[old.content_piece_id]; elsif tg_op='UPDATE' then affected=array[new.content_piece_id,old.content_piece_id]; else affected=array[new.content_piece_id]; end if;
 for piece_id in select distinct unnest(affected) loop
 perform id from content_pieces where id=piece_id and ops_content_metadata<>'{}'::jsonb for update;
 if found then
  if exists(select 1 from publishing_jobs where content_piece_id=piece_id and publish_payload->>'native_ops'='true') then raise exception 'RELEASE_LOCKED'; end if;
  if exists(select 1 from content_generation_jobs where content_piece_id=piece_id and job_type='ops_linkedin_publish' and status in ('queued','running')) then raise exception 'RELEASE_BUSY'; end if;
  insert into ops_content_reviews(content_piece_id,revision) values(piece_id,2)
  on conflict(content_piece_id) do update set revision=ops_content_reviews.revision+1,
   approved_revision=null,watched_revision=null,approved_snapshot=null,approved_at=null,approved_by=null,updated_at=now();
  update content_pieces set approval_status='pending' where id=piece_id;
 end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke execute on function public.ops_content_asset_revision() from public,anon,authenticated;
create trigger ops_content_asset_revision after insert or update or delete on public.content_assets for each row execute function public.ops_content_asset_revision();
create trigger ops_content_image_revision after insert or update or delete on public.content_images for each row execute function public.ops_content_asset_revision();
insert into public.ops_content_reviews(content_piece_id) select id from public.content_pieces where ops_content_metadata<>'{}'::jsonb on conflict do nothing;

create function public.ops_content_update_workflow(p_id uuid,p_company uuid,p_revision integer,p_patch jsonb,p_increment boolean default true)
returns public.ops_content_workflows language plpgsql security invoker set search_path=public as $$
declare w ops_content_workflows;
begin
 select * into w from ops_content_workflows where id=p_id and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if w.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_increment and exists(select 1 from content_generation_jobs where week_id=w.week_id and job_type in ('ops_weekly_plan','ops_weekly_production') and status in ('queued','running')) then raise exception 'WORKFLOW_BUSY'; end if;
 update ops_content_workflows set revision=revision+case when p_increment then 1 else 0 end,
  answers=coalesce(p_patch->'answers',answers), messages=coalesce(p_patch->'messages',messages),
  source_inventory=coalesce(p_patch->'source_inventory',source_inventory),
  plan_json=case when p_patch?'plan_json' then p_patch->'plan_json' else plan_json end,
  plan_markdown=case when p_patch?'plan_markdown' then p_patch->>'plan_markdown' else plan_markdown end,
  plan_revision=case when p_patch?'plan_revision' then (p_patch->>'plan_revision')::integer else plan_revision end,
  plan_status=coalesce(p_patch->>'plan_status',plan_status),
  approved_snapshot=case when p_patch?'approved_snapshot' then nullif(p_patch->'approved_snapshot','null'::jsonb) else approved_snapshot end,
  approved_at=case when p_patch?'approved_at' then (p_patch->>'approved_at')::timestamptz else approved_at end,
  approved_by=case when p_patch?'approved_by' then (p_patch->>'approved_by')::uuid else approved_by end,
  last_job_id=case when p_patch?'last_job_id' then (p_patch->>'last_job_id')::uuid else last_job_id end,updated_at=now()
 where id=p_id returning * into w;
 return w;
end $$;
revoke execute on function public.ops_content_update_workflow(uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ops_content_update_workflow(uuid,uuid,integer,jsonb,boolean) to service_role;

create function public.ops_content_save_piece(p_id uuid,p_company uuid,p_revision integer,p_patch jsonb)
returns public.ops_content_reviews language plpgsql security invoker set search_path=public as $$
declare r ops_content_reviews;
begin
 perform id from content_pieces where id=p_id and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into r from ops_content_reviews where content_piece_id=p_id for update;
 if coalesce(r.revision,0) is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if r.release_job_id is not null and exists(select 1 from content_generation_jobs where id=r.release_job_id and status in ('queued','running')) then raise exception 'RELEASE_BUSY'; end if;
 update content_pieces set
  markdown_body=coalesce(p_patch->>'markdown_body',markdown_body),
  first_comment=case when p_patch?'first_comment' then p_patch->>'first_comment' else first_comment end,
  title=coalesce(p_patch->>'title',title),
  scheduled_date=case when p_patch?'scheduled_date' then (p_patch->>'scheduled_date')::date else scheduled_date end,
  scheduled_time=case when p_patch?'scheduled_time' then p_patch->>'scheduled_time' else scheduled_time end,
  ops_content_metadata=coalesce(p_patch->'ops_content_metadata',ops_content_metadata), updated_at=now()
 where id=p_id;
 select * into r from ops_content_reviews where content_piece_id=p_id;
 return r;
end $$;
revoke execute on function public.ops_content_save_piece(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ops_content_save_piece(uuid,uuid,integer,jsonb) to service_role;

create function public.ops_content_approve_piece(p_id uuid,p_company uuid,p_revision integer,p_snapshot jsonb,p_actor uuid,p_watched boolean)
returns public.ops_content_reviews language plpgsql security invoker set search_path=public as $$
declare r ops_content_reviews;
begin
 perform id from content_pieces where id=p_id and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into r from ops_content_reviews where content_piece_id=p_id for update;
 if not found or r.content_piece_id is null then raise exception 'NOT_FOUND'; end if;
 if r.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
 update ops_content_reviews set approved_revision=p_revision,approved_snapshot=p_snapshot,
 watched_revision=case when p_watched then p_revision else null end,approved_at=now(),approved_by=p_actor,updated_at=now()
 where content_piece_id=p_id returning * into r;
 update content_pieces set approval_status='approved' where id=p_id;
 return r;
end $$;
revoke execute on function public.ops_content_approve_piece(uuid,uuid,integer,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.ops_content_approve_piece(uuid,uuid,integer,jsonb,uuid,boolean) to service_role;

alter table public.content_generation_jobs drop constraint content_generation_jobs_job_type_check;
alter table public.content_generation_jobs add constraint content_generation_jobs_job_type_check check(job_type in (
 'content_generation','image_generation','video_rendering','transcription','pdf_generation','platform_adaptation',
 'weekly_production','single_post','video_post','linkedin_publish','ops_linkedin_publish','ops_weekly_plan','ops_weekly_production'));
create unique index content_generation_jobs_ops_week_active_uniq on public.content_generation_jobs(week_id)
 where status in ('queued','running') and job_type in ('ops_weekly_plan','ops_weekly_production');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('content-drafts','content-drafts',false,2147483648,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','application/pdf'])
on conflict(id) do nothing;

create function public.ops_content_queue_week(p_id uuid,p_company uuid,p_revision integer,p_type text,p_payload jsonb,p_actor uuid)
returns public.content_generation_jobs language plpgsql security invoker set search_path=public as $$
declare w ops_content_workflows; j content_generation_jobs;
begin
 select * into w from ops_content_workflows where id=p_id and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if w.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_type not in ('ops_weekly_plan','ops_weekly_production') then raise exception 'INVALID_JOB'; end if;
 if p_type='ops_weekly_production' and (w.plan_status<>'approved' or w.plan_revision is distinct from w.revision or w.approved_snapshot is null or p_payload->'approved_plan' is distinct from w.approved_snapshot) then raise exception 'APPROVAL_CONFLICT'; end if;
 insert into content_generation_jobs(company_id,week_id,job_type,provider,status,triggered_by,run_id,input_payload)
 values(p_company,w.week_id,p_type,'markey_platform','queued',p_actor,gen_random_uuid(),p_payload) returning * into j;
 update ops_content_workflows set last_job_id=j.id,updated_at=now() where id=w.id;
 return j;
end $$;
revoke execute on function public.ops_content_queue_week(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ops_content_queue_week(uuid,uuid,integer,text,jsonb,uuid) to service_role;

create function public.ops_content_release_piece(p_id uuid,p_company uuid,p_revision integer,p_snapshot jsonb,p_payload jsonb,p_actor uuid)
returns public.content_generation_jobs language plpgsql security invoker set search_path=public as $$
declare r ops_content_reviews; j content_generation_jobs;
begin
 perform id from content_pieces where id=p_id and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into r from ops_content_reviews where content_piece_id=p_id for update;
 if not found or r.content_piece_id is null then raise exception 'NOT_FOUND'; end if;
 if r.revision is distinct from p_revision or r.approved_revision is distinct from p_revision or r.approved_snapshot is null or r.approved_snapshot is distinct from p_snapshot then raise exception 'APPROVAL_CONFLICT'; end if;
 if exists(select 1 from publishing_jobs where content_piece_id=p_id and publish_payload->>'native_ops'='true')
 or exists(select 1 from publishing_jobs where content_piece_id=p_id and target_platform='linkedin_personal' and status='published')
 or exists(select 1 from content_generation_jobs where job_type='ops_linkedin_publish' and status in ('queued','running') and input_payload @> jsonb_build_object('piece_id',p_id::text)) then raise exception 'RELEASE_BUSY'; end if;
 insert into content_generation_jobs(company_id,content_piece_id,job_type,provider,status,triggered_by,run_id,input_payload)
 values(p_company,p_id,'ops_linkedin_publish','markey_platform','queued',p_actor,gen_random_uuid(),p_payload) returning * into j;
 update ops_content_reviews set release_job_id=j.id,updated_at=now() where content_piece_id=p_id;
 return j;
end $$;
revoke execute on function public.ops_content_release_piece(uuid,uuid,integer,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.ops_content_release_piece(uuid,uuid,integer,jsonb,jsonb,uuid) to service_role;

create unique index content_assets_ops_media_uniq on public.content_assets(content_piece_id,(asset_metadata->>'ops_media_id')) where asset_metadata->>'ops_media_id' is not null;
create function public.ops_content_attach_media(p_piece uuid,p_company uuid,p_revision integer,p_media uuid)
returns public.ops_content_reviews language plpgsql security invoker set search_path=public as $$
declare r ops_content_reviews; m ops_content_media;
begin
 perform id from content_pieces where id=p_piece and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into r from ops_content_reviews where content_piece_id=p_piece for update;
 if not found or r.content_piece_id is null then raise exception 'NOT_FOUND'; end if;
 if r.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if r.release_job_id is not null and exists(select 1 from content_generation_jobs where id=r.release_job_id and status in ('queued','running')) then raise exception 'RELEASE_BUSY'; end if;
 select * into m from ops_content_media where id=p_media and company_id=p_company and registered for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into content_assets(content_piece_id,asset_type,storage_path,file_url,text_content,asset_metadata,sort_order)
 values(p_piece,case when m.kind='photo' then 'featured_image' when m.kind='document' then 'pdf_file' else 'custom' end,m.storage_path,null,m.filename,
 jsonb_build_object('ops_media_id',m.id,'bucket',m.bucket,'storage_path',m.storage_path,'version',m.version,'type',case when m.kind='video' then case when m.role='final' then 'rendered_video' else 'raw_video' end else 'selected_photo' end),0);
 update ops_content_media set content_piece_id=p_piece,role=case when kind in ('photo','document') then 'final' else role end where id=m.id;
 select * into r from ops_content_reviews where content_piece_id=p_piece;return r;
end $$;
revoke execute on function public.ops_content_attach_media(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.ops_content_attach_media(uuid,uuid,integer,uuid) to service_role;

-- Atomic export acknowledgement locks the workflow and reviewed revisions.
create function public.ops_content_record_export(p_workflow uuid,p_company uuid,p_revision integer,p_plan jsonb,p_snapshots jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare w ops_content_workflows; s jsonb; r ops_content_reviews;
begin
 select * into w from ops_content_workflows where id=p_workflow and company_id=p_company for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if w.revision is distinct from p_revision or w.plan_status<>'approved' or w.plan_revision is distinct from p_revision or w.approved_snapshot is distinct from p_plan then raise exception 'APPROVAL_CONFLICT'; end if;
 for s in select value from jsonb_array_elements(p_snapshots) loop
  perform id from content_pieces where id=(s->>'piece_id')::uuid and company_id=p_company for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into r from ops_content_reviews where content_piece_id=(s->>'piece_id')::uuid for update;
  if r.approved_revision is distinct from (s->>'revision')::integer or r.revision is distinct from (s->>'revision')::integer or r.approved_snapshot->>'hash' is distinct from s->>'hash' then raise exception 'APPROVAL_CONFLICT'; end if;
 end loop;
 update ops_content_reviews set exported_at=now() where content_piece_id in (select (value->>'piece_id')::uuid from jsonb_array_elements(p_snapshots));
 return true;
end $$;
revoke execute on function public.ops_content_record_export(uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ops_content_record_export(uuid,uuid,integer,jsonb,jsonb) to service_role;

-- The native executor inserts this intent before the public post API. An
-- uncertain outcome keeps the intent and requires operator reconciliation.
create unique index publishing_jobs_native_ops_intent_uniq on public.publishing_jobs(content_piece_id)
 where publish_payload->>'native_ops'='true';
