-- Run once in your Supabase SQL editor. All application data is server-only.
create table if not exists public.review_jobs (
 id uuid primary key,
 owner_hash text not null,
 created_at timestamptz not null default now(),
 files jsonb not null,
 context jsonb not null,
 status text not null default 'uploading',
 attempts integer not null default 0,
 reserved_bytes bigint not null,
 report jsonb,
 error text,
 lock_until timestamptz,
 share_hash text unique,
 share_expires_at timestamptz,
 shared_report jsonb
);
alter table public.review_jobs enable row level security;
revoke all on public.review_jobs from anon, authenticated;
grant all on public.review_jobs to service_role;
insert into storage.buckets(id,name,public,file_size_limit)
values('review-private','review-private',false,52428800)
on conflict(id) do update set public=false;
-- No public SELECT / INSERT policy on storage.objects. Use scoped signed upload URLs.
create or replace function public.reserve_review_job(p_job jsonb,p_daily_limit int,p_budget_bytes bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(73482915);
 if (select count(*) from public.review_jobs where created_at>now()-interval '24 hours')>=p_daily_limit
 or (select coalesce(sum(reserved_bytes),0) from public.review_jobs)+(p_job->>'reserved_bytes')::bigint>p_budget_bytes
 then raise exception 'DEMO_QUOTA'; end if;
 insert into public.review_jobs(id,owner_hash,created_at,files,context,status,attempts,reserved_bytes)
 values((p_job->>'id')::uuid,p_job->>'owner_hash',(p_job->>'created_at')::timestamptz,p_job->'files',p_job->'context','uploading',0,(p_job->>'reserved_bytes')::bigint);
end $$;
create or replace function public.claim_review_job(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.review_jobs set status='analyzing',attempts=attempts+1,lock_until=now()+interval '10 minutes'
 where id=p_id and report is null and attempts<3 and (status<>'analyzing' or lock_until<now());
 return found;
end $$;
revoke all on function public.reserve_review_job(jsonb,int,bigint) from public,anon,authenticated;
revoke all on function public.claim_review_job(uuid) from public,anon,authenticated;
grant execute on function public.reserve_review_job(jsonb,int,bigint) to service_role;
grant execute on function public.claim_review_job(uuid) to service_role;
