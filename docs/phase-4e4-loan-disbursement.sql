-- Phase 4E-4: Pencairan Pinjaman
-- Supabase operational workflow. Actual cash/bank posting is performed in D1 by the application
-- with deterministic idempotency key loan-disbursement:<disbursement_id>.

insert into public.permissions (code,module,name,description)
values
  ('LOAN_DISBURSEMENT_VIEW','LOANS','Lihat Pencairan Pinjaman','Melihat permintaan, keputusan, dan status pencairan pinjaman.'),
  ('LOAN_DISBURSEMENT_MANAGE','LOANS','Kelola Pencairan Pinjaman','Membuat dan mengajukan permintaan pencairan pinjaman.'),
  ('LOAN_DISBURSEMENT_APPROVE','LOANS','Setujui Pencairan Pinjaman','Menyetujui atau menolak pencairan dengan maker-checker.'),
  ('LOAN_DISBURSEMENT_EXECUTE','LOANS','Eksekusi Pencairan Pinjaman','Memposting pencairan yang sudah disetujui ke kas/bank D1.')
on conflict (code) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_DISBURSEMENT_VIEW' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS','PENGAWAS','ADMIN_UNIT','TELLER')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_DISBURSEMENT_MANAGE' and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT','TELLER')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_DISBURSEMENT_APPROVE' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_DISBURSEMENT_EXECUTE' and r.code in ('SUPER_ADMIN','MANAGER','TELLER')
on conflict do nothing;

create table if not exists public.loan_disbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  disbursement_number text not null unique,
  contract_id uuid not null unique references public.loan_contracts(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','PROCESSING','DISBURSED','CANCELLED')),
  channel text not null check (channel in ('CASH','BANK_TRANSFER')),
  treasury_account_id text not null,
  gross_amount bigint not null check (gross_amount > 0),
  net_disbursement_amount bigint not null check (net_disbursement_amount > 0 and net_disbursement_amount <= gross_amount),
  recipient_name text not null,
  bank_name text,
  bank_account_number text,
  accounting_event_code text not null,
  request_note text,
  decision_note text,
  execution_reference text,
  idempotency_key text not null unique,
  d1_journal_entry_id text,
  created_by uuid not null references auth.users(id) on delete restrict,
  submitted_by uuid references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  rejected_by uuid references auth.users(id) on delete restrict,
  execution_started_by uuid references auth.users(id) on delete restrict,
  disbursed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  execution_started_at timestamptz,
  disbursed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (channel='CASH' and bank_name is null and bank_account_number is null)
    or
    (channel='BANK_TRANSFER' and bank_name is not null and bank_account_number is not null)
  )
);

create index if not exists loan_disbursements_org_status_idx on public.loan_disbursements(organization_id,status,created_at desc);
create index if not exists loan_disbursements_member_idx on public.loan_disbursements(organization_id,member_id,created_at desc);
create index if not exists loan_disbursements_created_by_idx on public.loan_disbursements(created_by);
create index if not exists loan_disbursements_submitted_by_idx on public.loan_disbursements(submitted_by) where submitted_by is not null;
create index if not exists loan_disbursements_approved_by_idx on public.loan_disbursements(approved_by) where approved_by is not null;
create index if not exists loan_disbursements_rejected_by_idx on public.loan_disbursements(rejected_by) where rejected_by is not null;
create index if not exists loan_disbursements_execution_started_by_idx on public.loan_disbursements(execution_started_by) where execution_started_by is not null;
create index if not exists loan_disbursements_disbursed_by_idx on public.loan_disbursements(disbursed_by) where disbursed_by is not null;

create table if not exists public.loan_disbursement_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  disbursement_id uuid not null references public.loan_disbursements(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null,
  note text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists loan_disbursement_events_disbursement_idx on public.loan_disbursement_events(disbursement_id,created_at);
create index if not exists loan_disbursement_events_org_idx on public.loan_disbursement_events(organization_id,created_at desc);
create index if not exists loan_disbursement_events_actor_idx on public.loan_disbursement_events(actor_user_id);

alter table public.loan_disbursements enable row level security;
alter table public.loan_disbursement_events enable row level security;

create policy loan_disbursements_select on public.loan_disbursements for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_DISBURSEMENT_VIEW')));

create policy loan_disbursement_events_select on public.loan_disbursement_events for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_DISBURSEMENT_VIEW')));

revoke all on table public.loan_disbursements from anon,authenticated;
revoke all on table public.loan_disbursement_events from anon,authenticated;
grant select on table public.loan_disbursements to authenticated;
grant select on table public.loan_disbursement_events to authenticated;

create or replace function public.create_loan_disbursement(
  p_contract_id uuid,
  p_channel text,
  p_treasury_account_id text,
  p_recipient_name text,
  p_bank_name text default null,
  p_bank_account_number text default null,
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
  v_recipient text := trim(coalesce(p_recipient_name,''));
  v_bank text := nullif(trim(coalesce(p_bank_name,'')),'');
  v_bank_account text := nullif(trim(coalesce(p_bank_account_number,'')),'');
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_event_code text;
  v_channels jsonb;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_contract from public.loan_contracts where id=p_contract_id and status='READY' for update;
  if v_contract.id is null then raise exception 'LOAN_DISBURSEMENT_CONTRACT_NOT_READY'; end if;
  if not private.has_org_permission(v_contract.organization_id,'LOAN_DISBURSEMENT_MANAGE') then
    raise exception 'LOAN_DISBURSEMENT_MANAGE_FORBIDDEN';
  end if;
  if exists(select 1 from public.loan_disbursements where contract_id=p_contract_id) then
    raise exception 'LOAN_DISBURSEMENT_ALREADY_EXISTS';
  end if;
  if v_channel not in ('CASH','BANK_TRANSFER') then raise exception 'LOAN_DISBURSEMENT_CHANNEL_INVALID'; end if;
  if length(v_treasury) < 3 or length(v_treasury) > 180 then raise exception 'LOAN_DISBURSEMENT_TREASURY_REQUIRED'; end if;
  if length(v_recipient) < 3 or length(v_recipient) > 160 then raise exception 'LOAN_DISBURSEMENT_RECIPIENT_INVALID'; end if;
  if v_note is not null and length(v_note) > 500 then raise exception 'LOAN_DISBURSEMENT_NOTE_INVALID'; end if;
  if v_channel='BANK_TRANSFER' and (v_bank is null or v_bank_account is null or length(v_bank_account) < 4) then
    raise exception 'LOAN_DISBURSEMENT_BANK_DESTINATION_REQUIRED';
  end if;
  if v_channel='CASH' then v_bank := null; v_bank_account := null; end if;

  v_channels := v_contract.product_snapshot->'disbursement_channels';
  v_event_code := trim(coalesce(v_contract.product_snapshot->>'disbursement_accounting_event_code',''));
  if jsonb_typeof(v_channels) <> 'array'
     or not exists(select 1 from jsonb_array_elements_text(v_channels) x(value) where upper(x.value)=v_channel)
     or v_event_code !~ '^[A-Z0-9_]{3,80}$' then
    raise exception 'LOAN_DISBURSEMENT_PRODUCT_SNAPSHOT_INVALID';
  end if;

  v_number := 'CAIR-' || to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')
    || '-' || upper(substr(replace(v_id::text,'-',''),1,8));

  insert into public.loan_disbursements(
    id,organization_id,disbursement_number,contract_id,member_id,status,channel,treasury_account_id,
    gross_amount,net_disbursement_amount,recipient_name,bank_name,bank_account_number,accounting_event_code,
    request_note,idempotency_key,created_by
  ) values (
    v_id,v_contract.organization_id,v_number,v_contract.id,v_contract.member_id,'DRAFT',v_channel,v_treasury,
    v_contract.principal_amount,v_contract.principal_amount,v_recipient,v_bank,v_bank_account,v_event_code,
    v_note,'loan-disbursement:'||v_id::text,v_user
  );

  insert into public.loan_disbursement_events(organization_id,disbursement_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_contract.organization_id,v_id,'CREATED',null,'DRAFT',v_note,v_user);
  return v_id;
end;
$function$;

create or replace function public.submit_loan_disbursement(p_disbursement_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_disbursements%rowtype;
begin
  select * into v_row from public.loan_disbursements where id=p_disbursement_id and status='DRAFT' for update;
  if v_row.id is null then raise exception 'LOAN_DISBURSEMENT_NOT_DRAFT'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_DISBURSEMENT_MANAGE') then raise exception 'LOAN_DISBURSEMENT_MANAGE_FORBIDDEN'; end if;
  update public.loan_disbursements set status='SUBMITTED',submitted_by=v_user,submitted_at=now(),updated_at=now() where id=v_row.id;
  insert into public.loan_disbursement_events(organization_id,disbursement_id,event_type,from_status,to_status,actor_user_id)
  values(v_row.organization_id,v_row.id,'SUBMITTED','DRAFT','SUBMITTED',v_user);
end;
$function$;

create or replace function public.cancel_loan_disbursement(p_disbursement_id uuid,p_note text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_disbursements%rowtype;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  select * into v_row from public.loan_disbursements where id=p_disbursement_id and status='DRAFT' for update;
  if v_row.id is null then raise exception 'LOAN_DISBURSEMENT_NOT_DRAFT'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_DISBURSEMENT_MANAGE') then raise exception 'LOAN_DISBURSEMENT_MANAGE_FORBIDDEN'; end if;
  update public.loan_disbursements set status='CANCELLED',updated_at=now() where id=v_row.id;
  insert into public.loan_disbursement_events(organization_id,disbursement_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'CANCELLED','DRAFT','CANCELLED',v_note,v_user);
end;
$function$;

create or replace function public.decide_loan_disbursement(
  p_disbursement_id uuid,
  p_decision text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_disbursements%rowtype;
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_target text;
begin
  select * into v_row from public.loan_disbursements where id=p_disbursement_id and status='SUBMITTED' for update;
  if v_row.id is null then raise exception 'LOAN_DISBURSEMENT_NOT_SUBMITTED'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_DISBURSEMENT_APPROVE') then raise exception 'LOAN_DISBURSEMENT_APPROVE_FORBIDDEN'; end if;
  if v_user=v_row.created_by or v_user=v_row.submitted_by then raise exception 'LOAN_DISBURSEMENT_MAKER_CANNOT_APPROVE'; end if;
  if v_decision not in ('APPROVE','REJECT') then raise exception 'LOAN_DISBURSEMENT_DECISION_INVALID'; end if;
  if v_decision='REJECT' and length(coalesce(v_note,'')) < 5 then raise exception 'LOAN_DISBURSEMENT_REJECTION_REASON_REQUIRED'; end if;
  if not exists(select 1 from public.loan_contracts where id=v_row.contract_id and status='READY') then raise exception 'LOAN_DISBURSEMENT_CONTRACT_NOT_READY'; end if;
  v_target := case when v_decision='APPROVE' then 'APPROVED' else 'REJECTED' end;
  update public.loan_disbursements
    set status=v_target,decision_note=v_note,approved_by=case when v_decision='APPROVE' then v_user else null end,
        rejected_by=case when v_decision='REJECT' then v_user else null end,decided_at=now(),updated_at=now()
    where id=v_row.id;
  insert into public.loan_disbursement_events(organization_id,disbursement_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,v_target,'SUBMITTED',v_target,v_note,v_user);
end;
$function$;

create or replace function public.prepare_loan_disbursement_execution(
  p_disbursement_id uuid,
  p_reference text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_disbursements%rowtype;
  v_reference text := trim(coalesce(p_reference,''));
  v_contract_number text;
begin
  if length(v_reference) < 3 or length(v_reference) > 120 then raise exception 'LOAN_DISBURSEMENT_REFERENCE_INVALID'; end if;
  select * into v_row from public.loan_disbursements where id=p_disbursement_id and status in ('APPROVED','PROCESSING') for update;
  if v_row.id is null then raise exception 'LOAN_DISBURSEMENT_NOT_EXECUTABLE'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_DISBURSEMENT_EXECUTE') then raise exception 'LOAN_DISBURSEMENT_EXECUTE_FORBIDDEN'; end if;
  if not exists(select 1 from public.loan_contracts where id=v_row.contract_id and status='READY') then raise exception 'LOAN_DISBURSEMENT_CONTRACT_NOT_READY'; end if;
  if v_row.status='PROCESSING' and v_row.execution_reference is not null and v_row.execution_reference<>v_reference then
    raise exception 'LOAN_DISBURSEMENT_REFERENCE_MISMATCH';
  end if;
  select contract_number into v_contract_number from public.loan_contracts where id=v_row.contract_id;
  if v_row.status='APPROVED' then
    update public.loan_disbursements
      set status='PROCESSING',execution_reference=v_reference,execution_started_by=v_user,execution_started_at=now(),updated_at=now()
      where id=v_row.id;
    insert into public.loan_disbursement_events(organization_id,disbursement_id,event_type,from_status,to_status,note,actor_user_id)
    values(v_row.organization_id,v_row.id,'EXECUTION_STARTED','APPROVED','PROCESSING',v_reference,v_user);
  end if;
  return jsonb_build_object(
    'disbursement_id',v_row.id,
    'organization_id',v_row.organization_id,
    'contract_id',v_row.contract_id,
    'contract_number',v_contract_number,
    'channel',v_row.channel,
    'treasury_account_id',v_row.treasury_account_id,
    'amount',v_row.net_disbursement_amount,
    'accounting_event_code',v_row.accounting_event_code,
    'reference',coalesce(v_row.execution_reference,v_reference),
    'recipient_name',v_row.recipient_name,
    'idempotency_key',v_row.idempotency_key
  );
end;
$function$;

create or replace function public.complete_loan_disbursement_execution(
  p_disbursement_id uuid,
  p_d1_journal_entry_id text
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.loan_disbursements%rowtype;
  v_journal text := trim(coalesce(p_d1_journal_entry_id,''));
  v_changed integer;
begin
  if length(v_journal) < 8 or length(v_journal) > 180 then raise exception 'LOAN_DISBURSEMENT_JOURNAL_INVALID'; end if;
  select * into v_row from public.loan_disbursements where id=p_disbursement_id for update;
  if v_row.id is null then raise exception 'LOAN_DISBURSEMENT_NOT_FOUND'; end if;
  if not private.has_org_permission(v_row.organization_id,'LOAN_DISBURSEMENT_EXECUTE') then raise exception 'LOAN_DISBURSEMENT_EXECUTE_FORBIDDEN'; end if;
  if v_row.status='DISBURSED' then
    if v_row.d1_journal_entry_id=v_journal then return; end if;
    raise exception 'LOAN_DISBURSEMENT_ALREADY_COMPLETED_DIFFERENT_JOURNAL';
  end if;
  if v_row.status<>'PROCESSING' then raise exception 'LOAN_DISBURSEMENT_NOT_PROCESSING'; end if;

  update public.loan_contracts set status='DISBURSED' where id=v_row.contract_id and status='READY';
  get diagnostics v_changed = row_count;
  if v_changed<>1 then raise exception 'LOAN_DISBURSEMENT_CONTRACT_NOT_READY'; end if;

  update public.loan_disbursements
    set status='DISBURSED',d1_journal_entry_id=v_journal,disbursed_by=v_user,disbursed_at=now(),updated_at=now()
    where id=v_row.id and status='PROCESSING';
  insert into public.loan_disbursement_events(organization_id,disbursement_id,event_type,from_status,to_status,note,actor_user_id)
  values(v_row.organization_id,v_row.id,'DISBURSED','PROCESSING','DISBURSED',v_journal,v_user);
end;
$function$;

revoke execute on function public.create_loan_disbursement(uuid,text,text,text,text,text,text) from public,anon;
revoke execute on function public.submit_loan_disbursement(uuid) from public,anon;
revoke execute on function public.cancel_loan_disbursement(uuid,text) from public,anon;
revoke execute on function public.decide_loan_disbursement(uuid,text,text) from public,anon;
revoke execute on function public.prepare_loan_disbursement_execution(uuid,text) from public,anon;
revoke execute on function public.complete_loan_disbursement_execution(uuid,text) from public,anon;

grant execute on function public.create_loan_disbursement(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.submit_loan_disbursement(uuid) to authenticated;
grant execute on function public.cancel_loan_disbursement(uuid,text) to authenticated;
grant execute on function public.decide_loan_disbursement(uuid,text,text) to authenticated;
grant execute on function public.prepare_loan_disbursement_execution(uuid,text) to authenticated;
grant execute on function public.complete_loan_disbursement_execution(uuid,text) to authenticated;
