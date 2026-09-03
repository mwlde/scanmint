-- ============================================================================
-- Fix Supabase security linter warnings
-- 1. monthly_totals view: SECURITY DEFINER -> security_invoker (ERROR)
-- 2. set_updated_at: pin search_path (WARN)
-- 3. rls_auto_enable: revoke public API execute grants (WARN x2)
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
-- 3. Revoke API execute on rls_auto_enable.
--    The event trigger 'ensure_rls' still fires on DDL (event triggers do not
--    require EXECUTE grants), but the /rest/v1/rpc endpoint is now closed.
-- ----------------------------------------------------------------------------

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;