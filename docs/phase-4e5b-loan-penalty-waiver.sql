-- Phase 4E-5B: overdue, grace period, incremental late penalty, and maker-checker waiver.
-- Penalty formula policy:
--   base = currently unpaid principal + interest for the overdue installment
--   incremental penalty = base * late_penalty_bps_per_day / 10,000 * newly elapsed late days
--   rounding carry is retained so sub-rupiah fractions are not lost across daily assessments
--   late_penalty_min_amount applies only on the first positive assessment for an installment
-- Allocation order for repayments becomes PENALTY -> INTEREST -> PRINCIPAL, oldest installment first.

insert into public.permissions (code,module,name,description)
values
  ('LOAN_PENALTY_VIEW','LOANS','Lihat Denda Pinjaman','Melihat denda keterlambatan, assessment, dan waiver.'),
  ('LOAN_PENALTY_WAIVE_REQUEST','LOANS','Ajukan Waiver Denda','Mengajukan pembebasan sebagian/seluruh denda yang sudah dinilai.'),
  ('LOAN_PENALTY_WAIVE_APPROVE','LOANS','Setujui Waiver Denda','Menyetujui atau menolak waiver denda dengan maker-checker.')
on conflict (code) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_PENALTY_VIEW' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS','PENGAWAS','ADMIN_UNIT','TELLER')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_PENALTY_WAIVE_REQUEST' and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_PENALTY_WAIVE_APPROVE' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS')
on conflict do nothing;

alter table public.loan_installment_schedule
  add column if not exists penalty_assessed_amount bigint not null default 0,
  add column if not exists penalty_waived_amount bigint not null default 0,
  add column if not exists penalty_assessed_through date,
  add column if not exists penalty_fraction_carry numeric(18,6) not null default 0;

do $block$
begin
  if not exists(select 1 from pg_constraint where conname='loan_installment_penalty_assessed_guard') then
    alter table public.loan_installment_schedule add constraint loan_installment_penalty_assessed_guard
      check (penalty_assessed_amount >= 0);
  end if;
  if not exists(select 1 from pg_constraint where conname='loan_installment_penalty_waived_guard') then
    alter table public.loan_installment_schedule add constraint loan_installment_penalty_waived_guard
      check (penalty_waived_amount >= 0 and penalty_waived_amount <= penalty_assessed_amount);
  end if;
  if not exists(select 1 from pg_constraint where conname='loan_installment_penalty_paid_guard_v2') then
    alter table public.loan_installment_schedule add constraint loan_installment_penalty_paid_guard_v2
      check (paid_penalty_amount >= 0 and paid_penalty_amount + penalty_waived_amount <= penalty_assessed_amount);
  end if;
  if not exists(select 1 from pg_constraint where conname='loan_installment_penalty_carry_guard') then
    alter table public.loan_installment_schedule add constraint loan_installment_penalty_carry_guard
      check (penalty_fraction_carry >= 0 and penalty_fraction_carry < 1);
  end if;
end;
$block$;

create table if not exists public.loan_penalty_assessment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contract_id uuid not null references public.loan_contracts(id) on delete restrict,
  installment_id uuid not null references public.loan_installment_schedule(id) on delete restrict,
  assessed_from date not null,
  assessed_through date not null,
  late_days integer not null check (late_days > 0),
  penalty_base_amount bigint not null check (penalty_base_amount > 0),
  penalty_rate_bps_per_day integer not null check (penalty_rate_bps_per_day > 0),
  minimum_penalty_amount bigint not null default 0 check (minimum_penalty_amount >= 0),
  assessed_amount bigint not null check (assessed_amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists loan_penalty_assessment_installment_idx on public.loan_penalty_assessment_events(installment_id,assessed_through);
create index if not exists loan_penalty_assessment_contract_idx on public.loan_penalty_assessment_events(contract_id,assessed_through);
create index if not exists loan_penalty_assessment_org_idx on public.loan_penalty_assessment_events(organization_id,created_at desc);

create table if not exists public.loan_penalty_waivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  waiver_number text not null unique,
  contract_id uuid not null references public.loan_contracts(id) on delete restrict,
  installment_id uuid not null references public.loan_installment_schedule(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
  requested_amount bigint not null check (requested_amount > 0),
  reason text not null,
  decision_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  submitted_by uuid references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  rejected_by uuid references auth.users(id) on delete restrict,
  cancelled_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists loan_penalty_waiver_installment_open_uq on public.loan_penalty_waivers(installment_id)
  where status in ('DRAFT','SUBMITTED');
create index if not exists loan_penalty_waiver_org_status_idx on public.loan_penalty_waivers(organization_id,status,created_at desc);
create index if not exists loan_penalty_waiver_contract_idx on public.loan_penalty_waivers(contract_id,created_at desc);
create index if not exists loan_penalty_waiver_member_idx on public.loan_penalty_waivers(member_id);
create index if not exists loan_penalty_waiver_created_by_idx on public.loan_penalty_waivers(created_by);
create index if not exists loan_penalty_waiver_submitted_by_idx on public.loan_penalty_waivers(submitted_by) where submitted_by is not null;
create index if not exists loan_penalty_waiver_approved_by_idx on public.loan_penalty_waivers(approved_by) where approved_by is not null;
create index if not exists loan_penalty_waiver_rejected_by_idx on public.loan_penalty_waivers(rejected_by) where rejected_by is not null;
create index if not exists loan_penalty_waiver_cancelled_by_idx on public.loan_penalty_waivers(cancelled_by) where cancelled_by is not null;

create table if not exists public.loan_penalty_waiver_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  waiver_id uuid not null references public.loan_penalty_waivers(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null,
  note text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists loan_penalty_waiver_events_waiver_idx on public.loan_penalty_waiver_events(waiver_id,created_at);
create index if not exists loan_penalty_waiver_events_org_idx on public.loan_penalty_waiver_events(organization_id,created_at desc);
create index if not exists loan_penalty_waiver_events_actor_idx on public.loan_penalty_waiver_events(actor_user_id);

alter table public.loan_penalty_assessment_events enable row level security;
alter table public.loan_penalty_waivers enable row level security;
alter table public.loan_penalty_waiver_events enable row level security;

create policy loan_penalty_assessment_select on public.loan_penalty_assessment_events for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_PENALTY_VIEW')));
create policy loan_penalty_waivers_select on public.loan_penalty_waivers for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_PENALTY_VIEW')));
create policy loan_penalty_waiver_events_select on public.loan_penalty_waiver_events for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_PENALTY_VIEW')));

revoke all on table public.loan_penalty_assessment_events from anon,authenticated;
revoke all on table public.loan_penalty_waivers from anon,authenticated;
revoke all on table public.loan_penalty_waiver_events from anon,authenticated;
grant select on table public.loan_penalty_assessment_events to authenticated;
grant select on table public.loan_penalty_waivers to authenticated;
grant select on table public.loan_penalty_waiver_events to authenticated;

-- Replaces the temporary 4E-5 boundary that blocked penalty-enabled overdue repayments.
drop trigger if exists loan_repayment_penalty_boundary on public.loan_repayments;
drop function if exists private.guard_loan_repayment_penalty_boundary();

create or replace function private.assess_loan_penalties(p_contract_id uuid,p_as_of date)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_contract public.loan_contracts%rowtype;
  v_as_of date := coalesce(p_as_of,(clock_timestamp() at time zone 'Asia/Jakarta')::date);
  v_bps integer;
  v_grace integer;
  v_min bigint;
  v_schedule record;
  v_base bigint;
  v_grace_end date;
  v_from date;
  v_days integer;
  v_raw numeric;
  v_increment bigint;
  v_carry numeric;
  v_total bigint;
begin
  select * into v_contract from public.loan_contracts where id=p_contract_id and status='DISBURSED' for update;
  if v_contract.id is null then raise exception 'LOAN_PENALTY_CONTRACT_NOT_ACTIVE'; end if;

  v_bps := greatest(0,coalesce((v_contract.product_snapshot->>'late_penalty_bps_per_day')::integer,0));
  v_grace := greatest(0,coalesce((v_contract.product_snapshot->>'grace_period_days')::integer,0));
  v_min := greatest(0::bigint,coalesce((v_contract.product_snapshot->>'late_penalty_min_amount')::bigint,0));

  if v_bps > 0 then
    for v_schedule in
      select * from public.loan_installment_schedule
      where contract_id=v_contract.id and organization_id=v_contract.organization_id
      order by installment_number
      for update
    loop
      v_base := greatest(0::bigint,v_schedule.principal_amount-v_schedule.paid_principal_amount)
        + greatest(0::bigint,v_schedule.interest_amount-v_schedule.paid_interest_amount);
      v_grace_end := v_schedule.due_date + v_grace;
      v_from := coalesce(v_schedule.penalty_assessed_through,v_grace_end);

      if v_base > 0 and v_as_of > v_grace_end and v_as_of > v_from then
        v_days := v_as_of-v_from;
        v_raw := coalesce(v_schedule.penalty_fraction_carry,0)
          + (v_base::numeric * v_bps::numeric * v_days::numeric / 10000);
        v_increment := floor(v_raw)::bigint;
        v_carry := v_raw-v_increment;
        if v_schedule.penalty_assessed_amount=0 and v_raw>0 and v_min>0 and v_increment<v_min then
          v_increment := v_min;
          v_carry := 0;
        end if;

        update public.loan_installment_schedule
        set penalty_assessed_amount=penalty_assessed_amount+v_increment,
            penalty_assessed_through=v_as_of,
            penalty_fraction_carry=v_carry
        where id=v_schedule.id;

        insert into public.loan_penalty_assessment_events(
          organization_id,contract_id,installment_id,assessed_from,assessed_through,late_days,
          penalty_base_amount,penalty_rate_bps_per_day,minimum_penalty_amount,assessed_amount
        ) values(
          v_contract.organization_id,v_contract.id,v_schedule.id,v_from,v_as_of,v_days,
          v_base,v_bps,v_min,v_increment
        );
      end if;
    end loop;
  end if;

  select coalesce(sum(greatest(0::bigint,penalty_assessed_amount-paid_penalty_amount-penalty_waived_amount)),0)
  into v_total from public.loan_installment_schedule
  where contract_id=v_contract.id and organization_id=v_contract.organization_id;
  return v_total;
end;
$function$;

revoke all on function private.assess_loan_penalties(uuid,date) from public,anon,authenticated;

create or replace function public.assess_loan_penalties(p_contract_id uuid)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_contract public.loan_contracts%rowtype;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_contract from public.loan_contracts where id=p_contract_id and status='DISBURSED';
  if v_contract.id is null then raise exception 'LOAN_PENALTY_CONTRACT_NOT_ACTIVE'; end if;
  if not (
    private.has_org_permission(v_contract.organization_id,'LOAN_REPAYMENT_POST')
    or private.has_org_permission(v_contract.organization_id,'LOAN_PENALTY_WAIVE_REQUEST')
  ) then raise exception 'LOAN_PENALTY_ASSESS_FORBIDDEN'; end if;
  return private.assess_loan_penalties(v_contract.id,(clock_timestamp() at time zone 'Asia/Jakarta')::date);
end;
$function$;

create or replace function public.create_loan_penalty_waiver(
  p_installment_id uuid,p_amount bigint,p_reason text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_schedule public.loan_installment_schedule%rowtype;
  v_contract public.loan_contracts%rowtype;
  v_id uuid := gen_random_uuid();
  v_number text;
  v_reason text := trim(coalesce(p_reason,''));
  v_due bigint;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'LOAN_PENALTY_WAIVER_AMOUNT_INVALID'; end if;
  if length(v_reason)<8 or length(v_reason)>500 then raise exception 'LOAN_PENALTY_WAIVER_REASON_INVALID'; end if;

  select * into v_schedule from public.loan_installment_schedule where id=p_installment_id for update;
  if v_schedule.id is null then raise exception 'LOAN_PENALTY_INSTALLMENT_NOT_FOUND'; end if;
  select * into v_contract from public.loan_contracts where id=v_schedule.contract_id and status='DISBURSED' for update;
  if v_contract.id is null then raise exception 'LOAN_PENALTY_CONTRACT_NOT_ACTIVE'; end if;
  if not private.has_org_permission(v_contract.organization_id,'LOAN_PENALTY_WAIVE_REQUEST') then
    raise exception 'LOAN_PENALTY_WAIVER_REQUEST_FORBIDDEN';
  end if;
  if exists(select 1 from public.loan_repayments where contract_id=v_contract.id and status in ('DRAFT','PROCESSING')) then
    raise exception 'LOAN_PENALTY_REPAYMENT_PENDING';
  end if;
  if exists(select 1 from public.loan_penalty_waivers where installment_id=v_schedule.id and status in ('DRAFT','SUBMITTED')) then
    raise exception 'LOAN_PENALTY_WAIVER_PENDING';
  end if;

  perform private.assess_loan_penalties(v_contract.id,(clock_timestamp() at time zone 'Asia/Jakarta')::date);
  select * into v_schedule from public.loan_installment_schedule where id=p_installment_id for update;
  v_due := greatest(0::bigint,v_schedule.penalty_assessed_amount-v_schedule.paid_penalty_amount-v_schedule.penalty_waived_amount);
  if p_amount>v_due then raise exception 'LOAN_PENALTY_WAIVER_EXCEEDS_DUE'; end if;

  v_number := 'WVD-'||to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')
    ||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
  insert into public.loan_penalty_waivers(
    id,organization_id,waiver_number,contract_id,installment_id,member_id,status,requested_amount,reason,created_by
  ) values(v_id,v_contract.organization_id,v_number,v_contract.id,v_schedule.id,v_contract.member_id,'DRAFT',p_amount,v_reason,v_user);
  insert into public.loan_penalty_waiver_events(organization_id,waiver_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_contract.organization_id,v_id,'CREATED',null,'DRAFT',v_reason,v_user);
  return v_id;
end;
$function$;

create or replace function public.submit_loan_penalty_waiver(p_waiver_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_penalty_waivers%rowtype;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.loan_penalty_waivers where id=p_waiver_id and status='DRAFT' for update;
  if v_row.id is null then raise exception 'LOAN_PENALTY_WAIVER_NOT_DRAFT'; end if;
  if v_row.created_by<>v_user then raise exception 'LOAN_PENALTY_WAIVER_CREATOR_REQUIRED'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_PENALTY_WAIVE_REQUEST') then raise exception 'LOAN_PENALTY_WAIVER_REQUEST_FORBIDDEN'; end if;
  update public.loan_penalty_waivers set status='SUBMITTED',submitted_by=v_user,submitted_at=now(),updated_at=now() where id=v_row.id;
  insert into public.loan_penalty_waiver_events(organization_id,waiver_id,event_type,from_status,to_status,actor_user_id)
  values(v_row.organization_id,v_row.id,'SUBMITTED','DRAFT','SUBMITTED',v_user);
end;
$function$;

create or replace function public.cancel_loan_penalty_waiver(p_waiver_id uuid,p_note text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_penalty_waivers%rowtype;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.loan_penalty_waivers where id=p_waiver_id and status in ('DRAFT','SUBMITTED') for update;
  if v_row.id is null then raise exception 'LOAN_PENALTY_WAIVER_NOT_CANCELLABLE'; end if;
  if v_row.created_by<>v_user then raise exception 'LOAN_PENALTY_WAIVER_CREATOR_REQUIRED'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_PENALTY_WAIVE_REQUEST') then raise exception 'LOAN_PENALTY_WAIVER_REQUEST_FORBIDDEN'; end if;
  if v_note is not null and length(v_note)>500 then raise exception 'LOAN_PENALTY_WAIVER_NOTE_INVALID'; end if;
  update public.loan_penalty_waivers set status='CANCELLED',cancelled_by=v_user,cancelled_at=now(),updated_at=now() where id=v_row.id;
  insert into public.loan_penalty_waiver_events(organization_id,waiver_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'CANCELLED',v_row.status,'CANCELLED',v_note,v_user);
end;
$function$;

create or replace function public.decide_loan_penalty_waiver(
  p_waiver_id uuid,p_decision text,p_note text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_penalty_waivers%rowtype;
  v_schedule public.loan_installment_schedule%rowtype;
  v_contract public.loan_contracts%rowtype;
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_due bigint;
  v_outstanding bigint;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'LOAN_PENALTY_WAIVER_DECISION_INVALID'; end if;
  if v_decision='REJECT' and coalesce(length(v_note),0)<5 then raise exception 'LOAN_PENALTY_WAIVER_REJECTION_REASON_REQUIRED'; end if;

  select * into v_row from public.loan_penalty_waivers where id=p_waiver_id and status='SUBMITTED' for update;
  if v_row.id is null then raise exception 'LOAN_PENALTY_WAIVER_NOT_SUBMITTED'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_PENALTY_WAIVE_APPROVE') then raise exception 'LOAN_PENALTY_WAIVER_APPROVE_FORBIDDEN'; end if;
  if v_row.created_by=v_user or v_row.submitted_by=v_user then raise exception 'LOAN_PENALTY_WAIVER_MAKER_CANNOT_APPROVE'; end if;
  if exists(select 1 from public.loan_repayments where contract_id=v_row.contract_id and status in ('DRAFT','PROCESSING')) then
    raise exception 'LOAN_PENALTY_REPAYMENT_PENDING';
  end if;

  if v_decision='REJECT' then
    update public.loan_penalty_waivers set status='REJECTED',decision_note=v_note,rejected_by=v_user,decided_at=now(),updated_at=now() where id=v_row.id;
    insert into public.loan_penalty_waiver_events(organization_id,waiver_id,event_type,from_status,to_status,note,actor_user_id)
    values(v_row.organization_id,v_row.id,'REJECTED','SUBMITTED','REJECTED',v_note,v_user);
    return;
  end if;

  select * into v_contract from public.loan_contracts where id=v_row.contract_id and status='DISBURSED' for update;
  if v_contract.id is null then raise exception 'LOAN_PENALTY_CONTRACT_NOT_ACTIVE'; end if;
  perform private.assess_loan_penalties(v_contract.id,(clock_timestamp() at time zone 'Asia/Jakarta')::date);
  select * into v_schedule from public.loan_installment_schedule where id=v_row.installment_id for update;
  v_due := greatest(0::bigint,v_schedule.penalty_assessed_amount-v_schedule.paid_penalty_amount-v_schedule.penalty_waived_amount);
  if v_row.requested_amount>v_due then raise exception 'LOAN_PENALTY_WAIVER_EXCEEDS_DUE'; end if;

  update public.loan_installment_schedule
  set penalty_waived_amount=penalty_waived_amount+v_row.requested_amount,
      status=case
        when paid_principal_amount>=principal_amount
         and paid_interest_amount>=interest_amount
         and paid_penalty_amount+penalty_waived_amount+v_row.requested_amount>=penalty_assessed_amount then 'PAID'
        when paid_principal_amount>0 or paid_interest_amount>0 or paid_penalty_amount>0 then 'PARTIAL'
        else status end
  where id=v_schedule.id;

  update public.loan_penalty_waivers set status='APPROVED',decision_note=v_note,approved_by=v_user,decided_at=now(),updated_at=now() where id=v_row.id;
  insert into public.loan_penalty_waiver_events(organization_id,waiver_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'APPROVED','SUBMITTED','APPROVED',v_note,v_user);

  select coalesce(sum(
    greatest(0::bigint,principal_amount-paid_principal_amount)
    + greatest(0::bigint,interest_amount-paid_interest_amount)
    + greatest(0::bigint,penalty_assessed_amount-paid_penalty_amount-penalty_waived_amount)
  ),0) into v_outstanding
  from public.loan_installment_schedule
  where contract_id=v_contract.id and organization_id=v_contract.organization_id;
  if v_outstanding=0 then update public.loan_contracts set status='CLOSED' where id=v_contract.id and status='DISBURSED'; end if;
end;
$function$;

-- Repayment v2: assess penalties first, then allocate PENALTY -> INTEREST -> PRINCIPAL.
create or replace function public.create_loan_repayment(
  p_contract_id uuid,p_channel text,p_treasury_account_id text,p_amount bigint,p_reference text,p_note text default null
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
  v_as_of date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_remaining bigint := coalesce(p_amount,0);
  v_penalty_due bigint;
  v_interest_due bigint;
  v_principal_due bigint;
  v_penalty_alloc bigint;
  v_interest_alloc bigint;
  v_principal_alloc bigint;
  v_total_penalty bigint := 0;
  v_total_interest bigint := 0;
  v_total_principal bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_schedule record;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'LOAN_REPAYMENT_AMOUNT_INVALID'; end if;
  if v_channel not in ('CASH','BANK_TRANSFER','QRIS') then raise exception 'LOAN_REPAYMENT_CHANNEL_INVALID'; end if;
  if length(v_treasury)<3 or length(v_treasury)>180 then raise exception 'LOAN_REPAYMENT_TREASURY_REQUIRED'; end if;
  if length(v_reference)<3 or length(v_reference)>120 then raise exception 'LOAN_REPAYMENT_REFERENCE_INVALID'; end if;
  if v_note is not null and length(v_note)>500 then raise exception 'LOAN_REPAYMENT_NOTE_INVALID'; end if;

  select * into v_contract from public.loan_contracts where id=p_contract_id and status='DISBURSED' for update;
  if v_contract.id is null then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;
  if not private.has_org_permission(v_contract.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN'; end if;
  if exists(select 1 from public.loan_repayments where contract_id=v_contract.id and status in ('DRAFT','PROCESSING')) then raise exception 'LOAN_REPAYMENT_PENDING_EXISTS'; end if;
  if exists(select 1 from public.loan_penalty_waivers where contract_id=v_contract.id and status in ('DRAFT','SUBMITTED')) then raise exception 'LOAN_REPAYMENT_WAIVER_PENDING'; end if;

  v_channels := v_contract.product_snapshot->'repayment_channels';
  v_principal_event := trim(coalesce(v_contract.product_snapshot->>'principal_accounting_event_code',''));
  v_interest_event := trim(coalesce(v_contract.product_snapshot->>'interest_accounting_event_code',''));
  v_penalty_event := trim(coalesce(v_contract.product_snapshot->>'penalty_accounting_event_code',''));
  if jsonb_typeof(v_channels)<>'array'
     or not exists(select 1 from jsonb_array_elements_text(v_channels) x(value) where upper(x.value)=v_channel)
     or v_principal_event !~ '^[A-Z0-9_]{3,80}$'
     or v_interest_event !~ '^[A-Z0-9_]{3,80}$'
     or v_penalty_event !~ '^[A-Z0-9_]{3,80}$' then raise exception 'LOAN_REPAYMENT_PRODUCT_SNAPSHOT_INVALID'; end if;

  perform private.assess_loan_penalties(v_contract.id,v_as_of);

  for v_schedule in
    select id,installment_number,principal_amount,interest_amount,paid_principal_amount,paid_interest_amount,
      paid_penalty_amount,penalty_assessed_amount,penalty_waived_amount
    from public.loan_installment_schedule
    where contract_id=v_contract.id and organization_id=v_contract.organization_id
    order by installment_number
    for update
  loop
    exit when v_remaining<=0;
    v_penalty_due := greatest(0::bigint,v_schedule.penalty_assessed_amount-v_schedule.paid_penalty_amount-v_schedule.penalty_waived_amount);
    v_penalty_alloc := least(v_remaining,v_penalty_due); v_remaining := v_remaining-v_penalty_alloc;
    v_interest_due := greatest(0::bigint,v_schedule.interest_amount-v_schedule.paid_interest_amount);
    v_interest_alloc := least(v_remaining,v_interest_due); v_remaining := v_remaining-v_interest_alloc;
    v_principal_due := greatest(0::bigint,v_schedule.principal_amount-v_schedule.paid_principal_amount);
    v_principal_alloc := least(v_remaining,v_principal_due); v_remaining := v_remaining-v_principal_alloc;

    if v_penalty_alloc+v_interest_alloc+v_principal_alloc>0 then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'installment_id',v_schedule.id,'installment_number',v_schedule.installment_number,
        'principal_amount',v_principal_alloc,'interest_amount',v_interest_alloc,'penalty_amount',v_penalty_alloc
      ));
      v_total_penalty:=v_total_penalty+v_penalty_alloc;
      v_total_interest:=v_total_interest+v_interest_alloc;
      v_total_principal:=v_total_principal+v_principal_alloc;
    end if;
  end loop;

  if v_remaining<>0 then raise exception 'LOAN_REPAYMENT_EXCEEDS_OUTSTANDING'; end if;
  if v_total_penalty+v_total_interest+v_total_principal<>p_amount or jsonb_array_length(v_rows)=0 then raise exception 'LOAN_REPAYMENT_ALLOCATION_INVALID'; end if;

  v_number := 'ANG-'||to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
  insert into public.loan_repayments(
    id,organization_id,repayment_number,contract_id,member_id,status,channel,treasury_account_id,
    total_amount,principal_amount,interest_amount,penalty_amount,payment_reference,request_note,
    principal_accounting_event_code,interest_accounting_event_code,penalty_accounting_event_code,
    allocation_snapshot,idempotency_key,created_by
  ) values(
    v_id,v_contract.organization_id,v_number,v_contract.id,v_contract.member_id,'DRAFT',v_channel,v_treasury,
    p_amount,v_total_principal,v_total_interest,v_total_penalty,v_reference,v_note,
    v_principal_event,v_interest_event,v_penalty_event,
    jsonb_build_object(
      'schema_version','loan_repayment_allocation_v2','allocation_order','PENALTY_THEN_INTEREST_THEN_PRINCIPAL_OLDEST_FIRST',
      'penalty_assessed_as_of',v_as_of,'total_amount',p_amount,'principal_amount',v_total_principal,
      'interest_amount',v_total_interest,'penalty_amount',v_total_penalty,'rows',v_rows
    ),'loan-repayment:'||v_id::text,v_user
  );

  insert into public.loan_repayment_allocations(
    organization_id,repayment_id,installment_id,installment_number,principal_amount,interest_amount,penalty_amount
  ) select v_contract.organization_id,v_id,x.installment_id,x.installment_number,x.principal_amount,x.interest_amount,x.penalty_amount
    from jsonb_to_recordset(v_rows) as x(installment_id uuid,installment_number integer,principal_amount bigint,interest_amount bigint,penalty_amount bigint)
    order by x.installment_number;
  insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_contract.organization_id,v_id,'CREATED',null,'DRAFT',v_note,v_user);
  return v_id;
end;
$function$;

create or replace function public.prepare_loan_repayment_execution(p_repayment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_repayments%rowtype;
  v_contract public.loan_contracts%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_as_of date;
  v_bps integer;
  v_grace integer;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.loan_repayments where id=p_repayment_id and status in ('DRAFT','PROCESSING') for update;
  if v_row.id is null then raise exception 'LOAN_REPAYMENT_NOT_EXECUTABLE'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN'; end if;
  select * into v_contract from public.loan_contracts where id=v_row.contract_id for update;
  if v_contract.id is null or v_contract.status<>'DISBURSED' then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;

  v_bps:=greatest(0,coalesce((v_contract.product_snapshot->>'late_penalty_bps_per_day')::integer,0));
  v_grace:=greatest(0,coalesce((v_contract.product_snapshot->>'grace_period_days')::integer,0));
  v_as_of:=coalesce((v_row.allocation_snapshot->>'penalty_assessed_as_of')::date,v_row.created_at::date);
  if v_bps>0 and v_today>v_as_of and exists(
    select 1 from public.loan_installment_schedule s
    where s.contract_id=v_contract.id and s.organization_id=v_contract.organization_id
      and (s.paid_principal_amount<s.principal_amount or s.paid_interest_amount<s.interest_amount)
      and v_today>(s.due_date+v_grace)
  ) then raise exception 'LOAN_REPAYMENT_PENALTY_STALE'; end if;

  if v_row.status='DRAFT' then
    update public.loan_repayments set status='PROCESSING',execution_started_by=v_user,execution_started_at=now(),updated_at=now() where id=v_row.id;
    insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,actor_user_id)
    values(v_row.organization_id,v_row.id,'EXECUTION_STARTED','DRAFT','PROCESSING',v_user);
  end if;

  return jsonb_build_object(
    'organization_id',v_row.organization_id,'repayment_id',v_row.id,'contract_id',v_contract.id,'contract_number',v_contract.contract_number,
    'member_id',v_row.member_id,'channel',v_row.channel,'treasury_account_id',v_row.treasury_account_id,'total_amount',v_row.total_amount,
    'principal_amount',v_row.principal_amount,'interest_amount',v_row.interest_amount,'penalty_amount',v_row.penalty_amount,
    'payment_reference',v_row.payment_reference,'principal_accounting_event_code',v_row.principal_accounting_event_code,
    'interest_accounting_event_code',v_row.interest_accounting_event_code,'penalty_accounting_event_code',v_row.penalty_accounting_event_code,
    'idempotency_key',v_row.idempotency_key
  );
end;
$function$;

create or replace function public.complete_loan_repayment_execution(p_repayment_id uuid,p_d1_journal_entry_id text)
returns void
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
  if length(v_journal)<8 or length(v_journal)>180 then raise exception 'LOAN_REPAYMENT_JOURNAL_INVALID'; end if;
  select * into v_row from public.loan_repayments where id=p_repayment_id and status in ('PROCESSING','POSTED') for update;
  if v_row.id is null then raise exception 'LOAN_REPAYMENT_NOT_PROCESSING'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_REPAYMENT_POST_FORBIDDEN'; end if;
  if v_row.status='POSTED' then
    if coalesce(v_row.d1_journal_entry_id,'')=v_journal then return; end if;
    raise exception 'LOAN_REPAYMENT_JOURNAL_MISMATCH';
  end if;
  select * into v_contract from public.loan_contracts where id=v_row.contract_id for update;
  if v_contract.id is null or v_contract.status<>'DISBURSED' then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;

  if exists(
    select 1 from public.loan_repayment_allocations a join public.loan_installment_schedule s on s.id=a.installment_id
    where a.repayment_id=v_row.id and (
      a.principal_amount>(s.principal_amount-s.paid_principal_amount)
      or a.interest_amount>(s.interest_amount-s.paid_interest_amount)
      or a.penalty_amount>(s.penalty_assessed_amount-s.paid_penalty_amount-s.penalty_waived_amount)
    )
  ) then raise exception 'LOAN_REPAYMENT_ALLOCATION_STALE'; end if;

  update public.loan_installment_schedule s
  set paid_principal_amount=s.paid_principal_amount+a.principal_amount,
      paid_interest_amount=s.paid_interest_amount+a.interest_amount,
      paid_penalty_amount=s.paid_penalty_amount+a.penalty_amount,
      last_payment_at=now(),
      status=case
        when s.paid_principal_amount+a.principal_amount>=s.principal_amount
         and s.paid_interest_amount+a.interest_amount>=s.interest_amount
         and s.paid_penalty_amount+a.penalty_amount+s.penalty_waived_amount>=s.penalty_assessed_amount then 'PAID'
        else 'PARTIAL' end
  from public.loan_repayment_allocations a
  where a.repayment_id=v_row.id and s.id=a.installment_id and s.organization_id=v_row.organization_id;

  update public.loan_repayments set status='POSTED',d1_journal_entry_id=v_journal,posted_by=v_user,posted_at=now(),updated_at=now() where id=v_row.id;
  insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'POSTED','PROCESSING','POSTED','D1 journal '||v_journal,v_user);

  select coalesce(sum(
    greatest(0::bigint,principal_amount-paid_principal_amount)
    + greatest(0::bigint,interest_amount-paid_interest_amount)
    + greatest(0::bigint,penalty_assessed_amount-paid_penalty_amount-penalty_waived_amount)
  ),0) into v_outstanding from public.loan_installment_schedule
  where contract_id=v_contract.id and organization_id=v_contract.organization_id;
  if v_outstanding=0 then update public.loan_contracts set status='CLOSED' where id=v_contract.id and status='DISBURSED'; end if;
end;
$function$;

revoke execute on function public.assess_loan_penalties(uuid) from public,anon;
grant execute on function public.assess_loan_penalties(uuid) to authenticated;
revoke execute on function public.create_loan_penalty_waiver(uuid,bigint,text) from public,anon;
grant execute on function public.create_loan_penalty_waiver(uuid,bigint,text) to authenticated;
revoke execute on function public.submit_loan_penalty_waiver(uuid) from public,anon;
grant execute on function public.submit_loan_penalty_waiver(uuid) to authenticated;
revoke execute on function public.cancel_loan_penalty_waiver(uuid,text) from public,anon;
grant execute on function public.cancel_loan_penalty_waiver(uuid,text) to authenticated;
revoke execute on function public.decide_loan_penalty_waiver(uuid,text,text) from public,anon;
grant execute on function public.decide_loan_penalty_waiver(uuid,text,text) to authenticated;

revoke execute on function public.create_loan_repayment(uuid,text,text,bigint,text,text) from public,anon;
grant execute on function public.create_loan_repayment(uuid,text,text,bigint,text,text) to authenticated;
revoke execute on function public.prepare_loan_repayment_execution(uuid) from public,anon;
grant execute on function public.prepare_loan_repayment_execution(uuid) to authenticated;
revoke execute on function public.complete_loan_repayment_execution(uuid,text) from public,anon;
grant execute on function public.complete_loan_repayment_execution(uuid,text) to authenticated;
