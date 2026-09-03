-- ============================================================================
-- Fix Supabase security linter warnings
-- 1. monthly_totals view: SECURITY DEFINER -> security_invoker (ERROR)
-- 2. set_updated_at: pin search_path (WARN)
-- 3. rls_auto_enable: drop the dashboard-created RLS safety net (WARN x2)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Recreate monthly_totals with security_invoker so RLS on receipts applies
--    to queries against the view. Body is unchanged.
-- ----------------------------------------------------------------------------

drop view if exists public.monthly_totals;

create view public.monthly_totals
with (security_invoker = true)
as
select
  user_id,
  extract(year from purchase_date)::integer as year,
  extract(month from purchase_date)::integer as month,
  currency,
  sum(total) as total,
  count(*) as receipt_count
from public.receipts
where status = 'confirmed'::text
  and purchase_date is not null
group by
  user_id,
  extract(year from purchase_date)::integer,
  extract(month from purchase_date)::integer,
  currency;

grant select on public.monthly_totals to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Pin search_path on set_updated_at.
--    Empty search_path forces fully qualified references inside the function.
--    now() resolves regardless: pg_catalog is always searched implicitly.
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. Drop the rls_auto_enable safety net.
--
--    The function and its 'ensure_rls' event trigger were created through the
--    Supabase dashboard and are not captured in any migration here, so the
--    schema in this repo does not describe the database. Rather than adopt
--    them, drop them: both tables in this schema enable RLS explicitly in
--    20260902073325_create_receipts_schema.sql, so the net guards nothing that
--    is not already guarded. Dropping also closes the /rest/v1/rpc endpoint
--    outright, which is stronger than revoking EXECUTE on it.
--
--    Trade-off accepted: a table added later no longer gets RLS enabled
--    automatically. New tables must enable it in their own migration.
--
--    Guarded because a fresh environment (db reset, CI, a new project) never
--    had these objects, and unguarded DROPs would abort the migration there.
--    The event trigger is dropped first — the function cannot be dropped while
--    a trigger still depends on it.
-- ----------------------------------------------------------------------------

drop event trigger if exists ensure_rls;

drop function if exists public.rls_auto_enable();
