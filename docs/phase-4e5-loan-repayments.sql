-- Phase 4E-5: Penerimaan Angsuran Pinjaman
-- Supabase owns repayment workflow/allocation state. Actual cash/bank journal posting is performed in D1
-- with deterministic idempotency key loan-repayment:<repayment_id>.
-- Core 4E-5 allocates unpaid INTEREST first, then PRINCIPAL, oldest installment first.
-- Late-penalty accrual/waiver is intentionally deferred to the next hardening phase; penalty_amount remains 0 here.

insert into public.permissions (code,module,name,description)
values
  ('LOAN_REPAYMENT_VIEW','LOANS','Lihat Angsuran Pinjaman','Melihat pembayaran, alokasi, dan status angsuran pinjaman.'),
  ('LOAN_REPAYMENT_POST','LOANS','Post Angsuran Pinjaman','Membuat dan memposting penerimaan angsuran pinjaman ke kas/bank.')
on conflict (code) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_REPAYMENT_VIEW' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS','PENGAWAS','ADMIN_UNIT','TELLER')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_REPAYMENT_POST' and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT','TELLER')
on conflict do nothing;

alter table public.loan_installment_schedule
  add column if not exists paid_principal_amount bigint not null default 0,
  add column if not exists paid_interest_amount bigint not null default 0,
  add column if not exists paid_penalty_amount bigint not null default 0,
  add column if not exists last_payment_at timestamptz;

do $block$
begin
  if not exists(select 1 from pg_constraint where conname='loan_installment_paid_principal_guard') then
    alter table public.loan_installment_schedule
      add constraint loan_installment_paid_principal_guard
      check (paid_principal_amount >= 0 and paid_principal_amount <= principal_amount);
  end if;
  if not exists(select 1 from pg_constraint where conname='loan_installment_paid_interest_guard') then
    alter table public.loan_installment_schedule
      add constraint loan_installment_paid_interest_guard
      check (paid_interest_amount >= 0 and paid_interest_amount <= interest_amount);
  end if;
  if not exists(select 1 from pg_constraint where conname='loan_installment_paid_penalty_guard') then
    alter table public.loan_installment_schedule
      add constraint loan_installment_paid_penalty_guard check (paid_penalty_amount >= 0);
  end if;
end;
$block$;

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repayment_number text not null unique,
  contract_id uuid not null references public.loan_contracts(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT','PROCESSING','POSTED','CANCELLED')),
  channel text not null check (channel in ('CASH','BANK_TRANSFER','QRIS')),
  treasury_account_id text not null,
  total_amount bigint not null check (total_amount > 0),
  principal_amount bigint not null default 0 check (principal_amount >= 0),
  interest_amount bigint not null default 0 check (interest_amount >= 0),
  penalty_amount bigint not null default 0 check (penalty_amount >= 0),
  payment_reference text not null,
  request_note text,
  cancel_note text,
  principal_accounting_event_code text not null,
  interest_accounting_event_code text not null,
  penalty_accounting_event_code text not null,
  allocation_snapshot jsonb not null,
  idempotency_key text not null unique,
  d1_journal_entry_id text,
  created_by uuid not null references auth.users(id) on delete restrict,
  execution_started_by uuid references auth.users(id) on delete restrict,
  posted_by uuid references auth.users(id) on delete restrict,
  cancelled_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  execution_started_at timestamptz,
  posted_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (total_amount = principal_amount + interest_amount + penalty_amount)
);

create unique index if not exists loan_repayments_contract_open_uq
  on public.loan_repayments(contract_id)
  where status in ('DRAFT','PROCESSING');
create index if not exists loan_repayments_org_status_idx on public.loan_repayments(organization_id,status,created_at desc);
create index if not exists loan_repayments_contract_idx on public.loan_repayments(contract_id,created_at desc);
create index if not exists loan_repayments_member_fk_idx on public.loan_repayments(member_id);
create index if not exists loan_repayments_created_by_idx on public.loan_repayments(created_by);
create index if not exists loan_repayments_execution_started_by_idx on public.loan_repayments(execution_started_by) where execution_started_by is not null;
create index if not exists loan_repayments_posted_by_idx on public.loan_repayments(posted_by) where posted_by is not null;
create index if not exists loan_repayments_cancelled_by_idx on public.loan_repayments(cancelled_by) where cancelled_by is not null;

create table if not exists public.loan_repayment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repayment_id uuid not null references public.loan_repayments(id) on delete restrict,
  installment_id uuid not null references public.loan_installment_schedule(id) on delete restrict,
  installment_number integer not null check (installment_number > 0),
  principal_amount bigint not null default 0 check (principal_amount >= 0),
  interest_amount bigint not null default 0 check (interest_amount >= 0),
  penalty_amount bigint not null default 0 check (penalty_amount >= 0),
  created_at timestamptz not null default now(),
  unique(repayment_id,installment_id),
  check (principal_amount + interest_amount + penalty_amount > 0)
);

create index if not exists loan_repayment_allocations_repayment_idx on public.loan_repayment_allocations(repayment_id,installment_number);
create index if not exists loan_repayment_allocations_installment_idx on public.loan_repayment_allocations(installment_id);
create index if not exists loan_repayment_allocations_org_idx on public.loan_repayment_allocations(organization_id,created_at desc);

create table if not exists public.loan_repayment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  repayment_id uuid not null references public.loan_repayments(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null,
  note text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists loan_repayment_events_repayment_idx on public.loan_repayment_events(repayment_id,created_at);
create index if not exists loan_repayment_events_org_idx on public.loan_repayment_events(organization_id,created_at desc);
create index if not exists loan_repayment_events_actor_idx on public.loan_repayment_events(actor_user_id);

alter table public.loan_repayments enable row level security;
alter table public.loan_repayment_allocations enable row level security;
alter table public.loan_repayment_events enable row level security;

create policy loan_repayments_select on public.loan_repayments for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_REPAYMENT_VIEW')));

create policy loan_repayment_allocations_select on public.loan_repayment_allocations for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_REPAYMENT_VIEW')));

create policy loan_repayment_events_select on public.loan_repayment_events for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_REPAYMENT_VIEW')));

revoke all on table public.loan_repayments from anon,authenticated;
revoke all on table public.loan_repayment_allocations from anon,authenticated;
revoke all on table public.loan_repayment_events from anon,authenticated;
grant select on table public.loan_repayments to authenticated;
grant select on table public.loan_repayment_allocations to authenticated;
grant select on table public.loan_repayment_events to authenticated;

create or replace function public.create_loan_repayment(
  p_contract_id uuid,
  p_channel text,
  p_treasury_account_id text,
  p_amount bigint,
  p_reference text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_contract public.loan_contracts%rowtype;
  v_id uuid := gen_random_uuid();
  v_number text;
  v_channel text := upper(trim(coalesce(p_channel,'')));
  v_treasury text := trim(coalesce(p_treasury_account_id,''));
  v_reference text := trim(coalesce(p_reference,''));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_channels jsonb;
  v_principal_event text;
  v_interest_event text;
  v_penalty_event text;
  v_remaining bigint := coalesce(p_amount,0);
  v_interest_due bigint;
  v_principal_due bigint;
  v_interest_alloc bigint;
  v_principal_alloc bigint;
  v_total_interest bigint := 0;
  v_total_principal bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_schedule record;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'LOAN_REPAYMENT_AMOUNT_INVALID'; end if;
  if v_channel not in ('CASH','BANK_TRANSFER','QRIS') then raise exception 'LOAN_REPAYMENT_CHANNEL_INVALID'; end if;
  if length(v_treasury) < 3 or length(v_treasury) > 180 then raise exception 'LOAN_REPAYMENT_TREASURY_REQUIRED'; end if;
  if length(v_reference) < 3 or length(v_reference) > 120 then raise exception 'LOAN_REPAYMENT_REFERENCE_INVALID'; end if;
  if v_note is not null and length(v_note) > 500 then raise exception 'LOAN_REPAYMENT_NOTE_INVALID'; end if;

  select * into v_contract
  from public.loan_contracts
  where id=p_contract_id and status='DISBURSED'
  for update;
  if v_contract.id is null then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;
  if not private.has_org_permission(v_contract.organization_id,'LOAN_REPAYMENT_POST') then
    raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN';
  end if;
  if exists(
    select 1 from public.loan_repayments
    where contract_id=v_contract.id and status in ('DRAFT','PROCESSING')
  ) then
    raise exception 'LOAN_REPAYMENT_PENDING_EXISTS';
  end if;

  v_channels := v_contract.product_snapshot->'repayment_channels';
  v_principal_event := trim(coalesce(v_contract.product_snapshot->>'principal_accounting_event_code',''));
  v_interest_event := trim(coalesce(v_contract.product_snapshot->>'interest_accounting_event_code',''));
  v_penalty_event := trim(coalesce(v_contract.product_snapshot->>'penalty_accounting_event_code',''));
  if jsonb_typeof(v_channels) <> 'array'
     or not exists(select 1 from jsonb_array_elements_text(v_channels) x(value) where upper(x.value)=v_channel)
     or v_principal_event !~ '^[A-Z0-9_]{3,80}$'
     or v_interest_event !~ '^[A-Z0-9_]{3,80}$'
     or v_penalty_event !~ '^[A-Z0-9_]{3,80}$' then
    raise exception 'LOAN_REPAYMENT_PRODUCT_SNAPSHOT_INVALID';
  end if;

  for v_schedule in
    select id,installment_number,principal_amount,interest_amount,paid_principal_amount,paid_interest_amount
    from public.loan_installment_schedule
    where contract_id=v_contract.id and organization_id=v_contract.organization_id
    order by installment_number
    for update
  loop
    exit when v_remaining <= 0;
    v_interest_due := greatest(0::bigint,v_schedule.interest_amount-v_schedule.paid_interest_amount);
    v_interest_alloc := least(v_remaining,v_interest_due);
    v_remaining := v_remaining-v_interest_alloc;

    v_principal_due := greatest(0::bigint,v_schedule.principal_amount-v_schedule.paid_principal_amount);
    v_principal_alloc := least(v_remaining,v_principal_due);
    v_remaining := v_remaining-v_principal_alloc;

    if v_interest_alloc+v_principal_alloc > 0 then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'installment_id',v_schedule.id,
        'installment_number',v_schedule.installment_number,
        'principal_amount',v_principal_alloc,
        'interest_amount',v_interest_alloc,
        'penalty_amount',0
      ));
      v_total_interest := v_total_interest+v_interest_alloc;
      v_total_principal := v_total_principal+v_principal_alloc;
    end if;
  end loop;

  if v_remaining <> 0 then raise exception 'LOAN_REPAYMENT_EXCEEDS_OUTSTANDING'; end if;
  if v_total_interest+v_total_principal <> p_amount or jsonb_array_length(v_rows)=0 then
    raise exception 'LOAN_REPAYMENT_ALLOCATION_INVALID';
  end if;

  v_number := 'ANG-' || to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')
    || '-' || upper(substr(replace(v_id::text,'-',''),1,8));

  insert into public.loan_repayments(
    id,organization_id,repayment_number,contract_id,member_id,status,channel,treasury_account_id,
    total_amount,principal_amount,interest_amount,penalty_amount,payment_reference,request_note,
    principal_accounting_event_code,interest_accounting_event_code,penalty_accounting_event_code,
    allocation_snapshot,idempotency_key,created_by
  ) values (
    v_id,v_contract.organization_id,v_number,v_contract.id,v_contract.member_id,'DRAFT',v_channel,v_treasury,
    p_amount,v_total_principal,v_total_interest,0,v_reference,v_note,
    v_principal_event,v_interest_event,v_penalty_event,
    jsonb_build_object(
      'schema_version','loan_repayment_allocation_v1',
      'allocation_order','INTEREST_THEN_PRINCIPAL_OLDEST_FIRST',
      'total_amount',p_amount,
      'principal_amount',v_total_principal,
      'interest_amount',v_total_interest,
      'penalty_amount',0,
      'rows',v_rows
    ),
    'loan-repayment:'||v_id::text,v_user
  );

  insert into public.loan_repayment_allocations(
    organization_id,repayment_id,installment_id,installment_number,principal_amount,interest_amount,penalty_amount
  )
  select v_contract.organization_id,v_id,x.installment_id,x.installment_number,
    x.principal_amount,x.interest_amount,x.penalty_amount
  from jsonb_to_recordset(v_rows) as x(
    installment_id uuid,installment_number integer,principal_amount bigint,interest_amount bigint,penalty_amount bigint
  )
  order by x.installment_number;

  insert into public.loan_repayment_events(
    organization_id,repayment_id,event_type,from_status,to_status,note,actor_user_id
  ) values(v_contract.organization_id,v_id,'CREATED',null,'DRAFT',v_note,v_user);

  return v_id;
end;
$function$;

create or replace function public.cancel_loan_repayment(
  p_repayment_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_repayments%rowtype;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.loan_repayments where id=p_repayment_id and status='DRAFT' for update;
  if v_row.id is null then raise exception 'LOAN_REPAYMENT_NOT_DRAFT'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN'; end if;
  if v_note is not null and length(v_note) > 500 then raise exception 'LOAN_REPAYMENT_NOTE_INVALID'; end if;

  update public.loan_repayments
  set status='CANCELLED',cancel_note=v_note,cancelled_by=v_user,cancelled_at=now(),updated_at=now()
  where id=v_row.id;

  insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'CANCELLED','DRAFT','CANCELLED',v_note,v_user);
end;
$function$;

create or replace function public.prepare_loan_repayment_execution(
  p_repayment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_repayments%rowtype;
  v_contract public.loan_contracts%rowtype;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row
  from public.loan_repayments
  where id=p_repayment_id and status in ('DRAFT','PROCESSING')
  for update;
  if v_row.id is null then raise exception 'LOAN_REPAYMENT_NOT_EXECUTABLE'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN'; end if;

  select * into v_contract from public.loan_contracts where id=v_row.contract_id for update;
  if v_contract.id is null or v_contract.status <> 'DISBURSED' then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;

  if v_row.status='DRAFT' then
    update public.loan_repayments
      set status='PROCESSING',execution_started_by=v_user,execution_started_at=now(),updated_at=now()
      where id=v_row.id;
    insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,actor_user_id)
      values(v_row.organization_id,v_row.id,'EXECUTION_STARTED','DRAFT','PROCESSING',v_user);
  end if;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,
    'repayment_id',v_row.id,
    'contract_id',v_contract.id,
    'contract_number',v_contract.contract_number,
    'member_id',v_row.member_id,
    'channel',v_row.channel,
    'treasury_account_id',v_row.treasury_account_id,
    'total_amount',v_row.total_amount,
    'principal_amount',v_row.principal_amount,
    'interest_amount',v_row.interest_amount,
    'penalty_amount',v_row.penalty_amount,
    'payment_reference',v_row.payment_reference,
    'principal_accounting_event_code',v_row.principal_accounting_event_code,
    'interest_accounting_event_code',v_row.interest_accounting_event_code,
    'penalty_accounting_event_code',v_row.penalty_accounting_event_code,
    'idempotency_key',v_row.idempotency_key
  );
end;
$function$;

create or replace function public.complete_loan_repayment_execution(
  p_repayment_id uuid,
  p_d1_journal_entry_id text
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_repayments%rowtype;
  v_contract public.loan_contracts%rowtype;
  v_journal text := trim(coalesce(p_d1_journal_entry_id,''));
  v_outstanding bigint;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(v_journal) < 8 or length(v_journal) > 180 then raise exception 'LOAN_REPAYMENT_JOURNAL_INVALID'; end if;

  select * into v_row
  from public.loan_repayments
  where id=p_repayment_id and status in ('PROCESSING','POSTED')
  for update;
  if v_row.id is null then raise exception 'LOAN_REPAYMENT_NOT_PROCESSING'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN'; end if;

  if v_row.status='POSTED' then
    if coalesce(v_row.d1_journal_entry_id,'')=v_journal then return; end if;
    raise exception 'LOAN_REPAYMENT_JOURNAL_MISMATCH';
  end if;

  select * into v_contract from public.loan_contracts where id=v_row.contract_id for update;
  if v_contract.id is null or v_contract.status <> 'DISBURSED' then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;

  if exists(
    select 1
    from public.loan_repayment_allocations a
    join public.loan_installment_schedule s on s.id=a.installment_id
    where a.repayment_id=v_row.id
      and (
        a.principal_amount > (s.principal_amount-s.paid_principal_amount)
        or a.interest_amount > (s.interest_amount-s.paid_interest_amount)
      )
  ) then
    raise exception 'LOAN_REPAYMENT_ALLOCATION_STALE';
  end if;

  update public.loan_installment_schedule s
  set paid_principal_amount=s.paid_principal_amount+a.principal_amount,
      paid_interest_amount=s.paid_interest_amount+a.interest_amount,
      paid_penalty_amount=s.paid_penalty_amount+a.penalty_amount,
      last_payment_at=now(),
      status=case
        when s.paid_principal_amount+a.principal_amount >= s.principal_amount
         and s.paid_interest_amount+a.interest_amount >= s.interest_amount then 'PAID'
        else 'PARTIAL'
      end
  from public.loan_repayment_allocations a
  where a.repayment_id=v_row.id
    and s.id=a.installment_id
    and s.organization_id=v_row.organization_id;

  update public.loan_repayments
  set status='POSTED',d1_journal_entry_id=v_journal,posted_by=v_user,posted_at=now(),updated_at=now()
  where id=v_row.id;

  insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'POSTED','PROCESSING','POSTED','D1 journal '||v_journal,v_user);

  select coalesce(sum(
    greatest(0::bigint,principal_amount-paid_principal_amount)
    + greatest(0::bigint,interest_amount-paid_interest_amount)
  ),0)
  into v_outstanding
  from public.loan_installment_schedule
  where contract_id=v_contract.id and organization_id=v_contract.organization_id;

  if v_outstanding=0 then
    update public.loan_contracts set status='CLOSED' where id=v_contract.id and status='DISBURSED';
  end if;
end;
$function$;

revoke execute on function public.create_loan_repayment(uuid,text,text,bigint,text,text) from public;
revoke execute on function public.create_loan_repayment(uuid,text,text,bigint,text,text) from anon;
grant execute on function public.create_loan_repayment(uuid,text,text,bigint,text,text) to authenticated;

revoke execute on function public.cancel_loan_repayment(uuid,text) from public;
revoke execute on function public.cancel_loan_repayment(uuid,text) from anon;
grant execute on function public.cancel_loan_repayment(uuid,text) to authenticated;

revoke execute on function public.prepare_loan_repayment_execution(uuid) from public;
revoke execute on function public.prepare_loan_repayment_execution(uuid) from anon;
grant execute on function public.prepare_loan_repayment_execution(uuid) to authenticated;

revoke execute on function public.complete_loan_repayment_execution(uuid,text) from public;
revoke execute on function public.complete_loan_repayment_execution(uuid,text) from anon;
grant execute on function public.complete_loan_repayment_execution(uuid,text) to authenticated;
