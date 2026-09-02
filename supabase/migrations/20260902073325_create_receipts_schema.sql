-- ============================================================================
-- ScanMint: initial schema
-- Receipts, line items, monthly totals view, RLS policies, storage bucket.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- image references (paths in the receipt-images storage bucket)
  image_path text not null,              -- flattened image, post-OpenCV
  original_image_path text,              -- optional, pre-flatten original

  -- extracted fields (all nullable except total; user can edit before saving)
  vendor text,
  purchase_date date,
  subtotal numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2) not null,
  currency text not null default 'USD',
  category text,

  -- raw LLM response, kept for debugging + future evaluation set
  raw_extraction jsonb,
  extraction_provider text,              -- 'gemini', 'openai', 'groq', etc.
  extraction_model text,                 -- e.g. 'gemini-2.5-flash-lite'

  status text not null default 'confirmed'
    check (status in ('pending_review', 'confirmed', 'discarded')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index receipts_user_id_purchase_date_idx
  on public.receipts (user_id, purchase_date desc);

create index receipts_user_id_status_idx
  on public.receipts (user_id, status);


create table public.receipt_line_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,

  description text,
  quantity numeric(10,3) not null default 1,
  unit_price numeric(10,2),
  line_total numeric(10,2),
  position int not null default 0,       -- preserve order from receipt

  created_at timestamptz not null default now()
);

create index receipt_line_items_receipt_id_idx
  on public.receipt_line_items (receipt_id, position);


-- ----------------------------------------------------------------------------
-- Updated-at trigger for receipts
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row
  execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- Monthly totals view
-- ----------------------------------------------------------------------------

create or replace view public.monthly_totals as
select
  user_id,
  extract(year  from purchase_date)::int  as year,
  extract(month from purchase_date)::int  as month,
  currency,
  sum(total)  as total,
  count(*)    as receipt_count
from public.receipts
where status = 'confirmed'
  and purchase_date is not null
group by user_id, year, month, currency;


-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.receipts           enable row level security;
alter table public.receipt_line_items enable row level security;

-- receipts: users only see and modify their own
create policy "receipts_select_own"
  on public.receipts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "receipts_insert_own"
  on public.receipts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "receipts_update_own"
  on public.receipts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "receipts_delete_own"
  on public.receipts for delete
  to authenticated
  using (auth.uid() = user_id);

-- line items: access follows the parent receipt
create policy "line_items_select_own"
  on public.receipt_line_items for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_line_items.receipt_id
        and r.user_id = auth.uid()
    )
  );

create policy "line_items_insert_own"
  on public.receipt_line_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_line_items.receipt_id
        and r.user_id = auth.uid()
    )
  );

create policy "line_items_update_own"
  on public.receipt_line_items for update
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_line_items.receipt_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_line_items.receipt_id
        and r.user_id = auth.uid()
    )
  );

create policy "line_items_delete_own"
  on public.receipt_line_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_line_items.receipt_id
        and r.user_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------------------
-- Data API grants (project has "Automatically expose new tables" off)
-- ----------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.receipts           to authenticated;
grant select, insert, update, delete on public.receipt_line_items to authenticated;
grant select                          on public.monthly_totals    to authenticated;


-- ----------------------------------------------------------------------------
-- Storage bucket for receipt images
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('receipt-images', 'receipt-images', false)
on conflict (id) do nothing;

-- storage policies: users can only touch files under their own user_id/ prefix
create policy "receipt_images_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipt_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipt_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipt_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipt-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );