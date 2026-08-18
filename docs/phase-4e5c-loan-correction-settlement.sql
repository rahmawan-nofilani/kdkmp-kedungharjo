-- Phase 4E-5C: posted repayment reversal + contractual full settlement.
-- Reversal is append-only: original repayment/journal remain intact, D1 receives an opposite journal,
-- then Supabase restores schedule balances. Only the latest financial state may be reversed.
-- Full settlement pays current contractual outstanding (penalty + interest + principal) with NO interest rebate.

insert into public.permissions(code,module,name,description)
values
 ('LOAN_CORRECTION_VIEW','LOANS','Lihat Koreksi Pinjaman','Melihat reversal angsuran dan status koreksi.'),
 ('LOAN_CORRECTION_REQUEST','LOANS','Ajukan Koreksi Pinjaman','Mengajukan reversal angsuran posted.'),
 ('LOAN_CORRECTION_APPROVE','LOANS','Setujui Koreksi Pinjaman','Menyetujui/menolak reversal dengan maker-checker.'),
 ('LOAN_CORRECTION_EXECUTE','LOANS','Eksekusi Koreksi Pinjaman','Memposting jurnal reversal dan memulihkan saldo jadwal.')
on conflict(code) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_CORRECTION_VIEW' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS','PENGAWAS','ADMIN_UNIT','TELLER')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_CORRECTION_REQUEST' and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT','TELLER')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_CORRECTION_APPROVE' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_CORRECTION_EXECUTE' and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT')
on conflict do nothing;

create table if not exists public.loan_repayment_reversals(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 reversal_number text not null unique,
 repayment_id uuid not null unique references public.loan_repayments(id) on delete restrict,
 contract_id uuid not null references public.loan_contracts(id) on delete restrict,
 member_id uuid not null references public.members(id) on delete restrict,
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','PROCESSING','REVERSED','CANCELLED')),
 reason text not null,
 decision_note text,
 treasury_account_id text not null,
 original_d1_journal_entry_id text not null,
 reversal_d1_journal_entry_id text,
 idempotency_key text not null unique,
 created_by uuid not null references auth.users(id) on delete restrict,
 submitted_by uuid references auth.users(id) on delete restrict,
 approved_by uuid references auth.users(id) on delete restrict,
 rejected_by uuid references auth.users(id) on delete restrict,
 execution_started_by uuid references auth.users(id) on delete restrict,
 reversed_by uuid references auth.users(id) on delete restrict,
 cancelled_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 submitted_at timestamptz,
 approved_at timestamptz,
 rejected_at timestamptz,
 execution_started_at timestamptz,
 reversed_at timestamptz,
 cancelled_at timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists loan_repayment_reversals_org_status_idx on public.loan_repayment_reversals(organization_id,status,created_at desc);
create index if not exists loan_repayment_reversals_contract_idx on public.loan_repayment_reversals(contract_id,created_at desc);
create index if not exists loan_repayment_reversals_member_idx on public.loan_repayment_reversals(member_id);
create index if not exists loan_repayment_reversals_created_by_idx on public.loan_repayment_reversals(created_by);
create index if not exists loan_repayment_reversals_submitted_by_idx on public.loan_repayment_reversals(submitted_by) where submitted_by is not null;
create index if not exists loan_repayment_reversals_approved_by_idx on public.loan_repayment_reversals(approved_by) where approved_by is not null;
create index if not exists loan_repayment_reversals_execution_by_idx on public.loan_repayment_reversals(execution_started_by) where execution_started_by is not null;

create table if not exists public.loan_repayment_reversal_events(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 reversal_id uuid not null references public.loan_repayment_reversals(id) on delete restrict,
 event_type text not null,
 from_status text,
 to_status text not null,
 note text,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now()
);
create index if not exists loan_repayment_reversal_events_reversal_idx on public.loan_repayment_reversal_events(reversal_id,created_at);
create index if not exists loan_repayment_reversal_events_org_idx on public.loan_repayment_reversal_events(organization_id,created_at desc);
create index if not exists loan_repayment_reversal_events_actor_idx on public.loan_repayment_reversal_events(actor_user_id);

alter table public.loan_repayment_reversals enable row level security;
alter table public.loan_repayment_reversal_events enable row level security;
create policy loan_repayment_reversals_select on public.loan_repayment_reversals for select to authenticated
using((select private.has_org_permission(organization_id,'LOAN_CORRECTION_VIEW')));
create policy loan_repayment_reversal_events_select on public.loan_repayment_reversal_events for select to authenticated
using((select private.has_org_permission(organization_id,'LOAN_CORRECTION_VIEW')));
revoke all on table public.loan_repayment_reversals from anon,authenticated;
revoke all on table public.loan_repayment_reversal_events from anon,authenticated;
grant select on table public.loan_repayment_reversals to authenticated;
grant select on table public.loan_repayment_reversal_events to authenticated;

create or replace function private.loan_reversal_is_stale(p_repayment_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_row public.loan_repayments%rowtype;
begin
 select * into v_row from public.loan_repayments where id=p_repayment_id;
 if v_row.id is null or v_row.status<>'POSTED' or v_row.posted_at is null then return true; end if;
 if exists(
   select 1 from public.loan_repayments r2
   where r2.contract_id=v_row.contract_id and r2.status='POSTED' and r2.posted_at>v_row.posted_at
     and not exists(select 1 from public.loan_repayment_reversals rr where rr.repayment_id=r2.id and rr.status='REVERSED')
 ) then return true; end if;
 if exists(select 1 from public.loan_penalty_assessment_events e where e.contract_id=v_row.contract_id and e.created_at>v_row.posted_at) then return true; end if;
 if exists(select 1 from public.loan_penalty_waivers w where w.contract_id=v_row.contract_id and w.status='APPROVED' and w.approved_at>v_row.posted_at) then return true; end if;
 return false;
end;
$function$;
revoke all on function private.loan_reversal_is_stale(uuid) from public,anon,authenticated;

create or replace function public.create_loan_repayment_reversal(p_repayment_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid:=(select auth.uid()); v_repayment public.loan_repayments%rowtype; v_contract public.loan_contracts%rowtype;
 v_id uuid:=gen_random_uuid(); v_number text; v_reason text:=trim(coalesce(p_reason,''));
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 if length(v_reason)<8 or length(v_reason)>500 then raise exception 'LOAN_REVERSAL_REASON_INVALID'; end if;
 select * into v_repayment from public.loan_repayments where id=p_repayment_id and status='POSTED' for update;
 if v_repayment.id is null or v_repayment.d1_journal_entry_id is null then raise exception 'LOAN_REVERSAL_REPAYMENT_NOT_POSTED'; end if;
 select * into v_contract from public.loan_contracts where id=v_repayment.contract_id and status in ('DISBURSED','CLOSED') for update;
 if v_contract.id is null then raise exception 'LOAN_REVERSAL_CONTRACT_INVALID'; end if;
 if not private.has_org_permission(v_repayment.organization_id,'LOAN_CORRECTION_REQUEST') then raise exception 'LOAN_REVERSAL_REQUEST_FORBIDDEN'; end if;
 if exists(select 1 from public.loan_repayment_reversals where repayment_id=v_repayment.id) then raise exception 'LOAN_REVERSAL_ALREADY_EXISTS'; end if;
 if exists(select 1 from public.loan_repayments where contract_id=v_contract.id and status in ('DRAFT','PROCESSING')) then raise exception 'LOAN_REVERSAL_REPAYMENT_PENDING'; end if;
 if exists(select 1 from public.loan_penalty_waivers where contract_id=v_contract.id and status in ('DRAFT','SUBMITTED')) then raise exception 'LOAN_REVERSAL_WAIVER_PENDING'; end if;
 if private.loan_reversal_is_stale(v_repayment.id) then raise exception 'LOAN_REVERSAL_NOT_LATEST_STATE'; end if;
 v_number:='REV-'||to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
 insert into public.loan_repayment_reversals(id,organization_id,reversal_number,repayment_id,contract_id,member_id,status,reason,treasury_account_id,original_d1_journal_entry_id,idempotency_key,created_by)
 values(v_id,v_repayment.organization_id,v_number,v_repayment.id,v_repayment.contract_id,v_repayment.member_id,'DRAFT',v_reason,v_repayment.treasury_account_id,v_repayment.d1_journal_entry_id,'loan-repayment-reversal:'||v_id::text,v_user);
 insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,note,actor_user_id)
 values(v_repayment.organization_id,v_id,'CREATED',null,'DRAFT',v_reason,v_user);
 return v_id;
end;$function$;

create or replace function public.submit_loan_repayment_reversal(p_reversal_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid()); v_row public.loan_repayment_reversals%rowtype;
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into v_row from public.loan_repayment_reversals where id=p_reversal_id and status='DRAFT' for update;
 if v_row.id is null then raise exception 'LOAN_REVERSAL_NOT_DRAFT'; end if;
 if v_row.created_by<>v_user then raise exception 'LOAN_REVERSAL_CREATOR_REQUIRED'; end if;
 if not private.has_org_permission(v_row.organization_id,'LOAN_CORRECTION_REQUEST') then raise exception 'LOAN_REVERSAL_REQUEST_FORBIDDEN'; end if;
 if private.loan_reversal_is_stale(v_row.repayment_id) then raise exception 'LOAN_REVERSAL_NOT_LATEST_STATE'; end if;
 update public.loan_repayment_reversals set status='SUBMITTED',submitted_by=v_user,submitted_at=now(),updated_at=now() where id=v_row.id;
 insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,actor_user_id)
 values(v_row.organization_id,v_row.id,'SUBMITTED','DRAFT','SUBMITTED',v_user);
end;$function$;

create or replace function public.cancel_loan_repayment_reversal(p_reversal_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid()); v_row public.loan_repayment_reversals%rowtype; v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into v_row from public.loan_repayment_reversals where id=p_reversal_id and status in ('DRAFT','SUBMITTED') for update;
 if v_row.id is null then raise exception 'LOAN_REVERSAL_NOT_CANCELLABLE'; end if;
 if v_row.created_by<>v_user then raise exception 'LOAN_REVERSAL_CREATOR_REQUIRED'; end if;
 update public.loan_repayment_reversals set status='CANCELLED',cancelled_by=v_user,cancelled_at=now(),updated_at=now(),decision_note=coalesce(v_note,decision_note) where id=v_row.id;
 insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,note,actor_user_id)
 values(v_row.organization_id,v_row.id,'CANCELLED',v_row.status,'CANCELLED',v_note,v_user);
end;$function$;

create or replace function public.decide_loan_repayment_reversal(p_reversal_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid()); v_row public.loan_repayment_reversals%rowtype; v_decision text:=upper(trim(coalesce(p_decision,''))); v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_decision not in ('APPROVE','REJECT') then raise exception 'LOAN_REVERSAL_DECISION_INVALID'; end if;
 select * into v_row from public.loan_repayment_reversals where id=p_reversal_id and status='SUBMITTED' for update;
 if v_row.id is null then raise exception 'LOAN_REVERSAL_NOT_SUBMITTED'; end if;
 if v_row.created_by=v_user then raise exception 'LOAN_REVERSAL_MAKER_CHECKER_REQUIRED'; end if;
 if not private.has_org_permission(v_row.organization_id,'LOAN_CORRECTION_APPROVE') then raise exception 'LOAN_REVERSAL_APPROVE_FORBIDDEN'; end if;
 if v_decision='APPROVE' and private.loan_reversal_is_stale(v_row.repayment_id) then raise exception 'LOAN_REVERSAL_NOT_LATEST_STATE'; end if;
 if v_decision='APPROVE' then
  update public.loan_repayment_reversals set status='APPROVED',approved_by=v_user,approved_at=now(),decision_note=v_note,updated_at=now() where id=v_row.id;
  insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,note,actor_user_id) values(v_row.organization_id,v_row.id,'APPROVED','SUBMITTED','APPROVED',v_note,v_user);
 else
  update public.loan_repayment_reversals set status='REJECTED',rejected_by=v_user,rejected_at=now(),decision_note=v_note,updated_at=now() where id=v_row.id;
  insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,note,actor_user_id) values(v_row.organization_id,v_row.id,'REJECTED','SUBMITTED','REJECTED',v_note,v_user);
 end if;
end;$function$;

create or replace function public.prepare_loan_repayment_reversal_execution(p_reversal_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid:=(select auth.uid()); v_row public.loan_repayment_reversals%rowtype; v_repayment public.loan_repayments%rowtype;
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into v_row from public.loan_repayment_reversals where id=p_reversal_id and status in ('APPROVED','PROCESSING') for update;
 if v_row.id is null then raise exception 'LOAN_REVERSAL_NOT_EXECUTABLE'; end if;
 if not private.has_org_permission(v_row.organization_id,'LOAN_CORRECTION_EXECUTE') then raise exception 'LOAN_REVERSAL_EXECUTE_FORBIDDEN'; end if;
 if private.loan_reversal_is_stale(v_row.repayment_id) then raise exception 'LOAN_REVERSAL_NOT_LATEST_STATE'; end if;
 select * into v_repayment from public.loan_repayments where id=v_row.repayment_id and status='POSTED' for update;
 if v_repayment.id is null then raise exception 'LOAN_REVERSAL_REPAYMENT_NOT_POSTED'; end if;
 if v_row.status='APPROVED' then
  update public.loan_repayment_reversals set status='PROCESSING',execution_started_by=v_user,execution_started_at=now(),updated_at=now() where id=v_row.id;
  insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,actor_user_id) values(v_row.organization_id,v_row.id,'EXECUTION_STARTED','APPROVED','PROCESSING',v_user);
 end if;
 return jsonb_build_object('organization_id',v_row.organization_id,'reversal_id',v_row.id,'repayment_id',v_row.repayment_id,'contract_id',v_row.contract_id,'treasury_account_id',v_row.treasury_account_id,'original_journal_entry_id',v_row.original_d1_journal_entry_id,'reason',v_row.reason,'idempotency_key',v_row.idempotency_key);
end;$function$;

create or replace function public.complete_loan_repayment_reversal_execution(p_reversal_id uuid,p_d1_journal_entry_id text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid:=(select auth.uid()); v_row public.loan_repayment_reversals%rowtype; v_journal text:=trim(coalesce(p_d1_journal_entry_id,'')); v_alloc record;
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 if length(v_journal)<8 or length(v_journal)>180 then raise exception 'LOAN_REVERSAL_JOURNAL_INVALID'; end if;
 select * into v_row from public.loan_repayment_reversals where id=p_reversal_id and status in ('PROCESSING','REVERSED') for update;
 if v_row.id is null then raise exception 'LOAN_REVERSAL_NOT_PROCESSING'; end if;
 if not private.has_org_permission(v_row.organization_id,'LOAN_CORRECTION_EXECUTE') then raise exception 'LOAN_REVERSAL_EXECUTE_FORBIDDEN'; end if;
 if v_row.status='REVERSED' then
  if coalesce(v_row.reversal_d1_journal_entry_id,'')=v_journal then return; end if;
  raise exception 'LOAN_REVERSAL_JOURNAL_MISMATCH';
 end if;
 if private.loan_reversal_is_stale(v_row.repayment_id) then raise exception 'LOAN_REVERSAL_NOT_LATEST_STATE'; end if;
 for v_alloc in select * from public.loan_repayment_allocations where repayment_id=v_row.repayment_id order by installment_number for update loop
  if not exists(select 1 from public.loan_installment_schedule s where s.id=v_alloc.installment_id and s.paid_principal_amount>=v_alloc.principal_amount and s.paid_interest_amount>=v_alloc.interest_amount and s.paid_penalty_amount>=v_alloc.penalty_amount) then
    raise exception 'LOAN_REVERSAL_ALLOCATION_STALE';
  end if;
 end loop;
 update public.loan_installment_schedule s
 set paid_principal_amount=s.paid_principal_amount-a.principal_amount,
     paid_interest_amount=s.paid_interest_amount-a.interest_amount,
     paid_penalty_amount=s.paid_penalty_amount-a.penalty_amount,
     status=case
       when s.paid_principal_amount-a.principal_amount>=s.principal_amount
        and s.paid_interest_amount-a.interest_amount>=s.interest_amount
        and s.paid_penalty_amount-a.penalty_amount+s.penalty_waived_amount>=s.penalty_assessed_amount then 'PAID'
       when s.paid_principal_amount-a.principal_amount>0 or s.paid_interest_amount-a.interest_amount>0 or s.paid_penalty_amount-a.penalty_amount>0 then 'PARTIAL'
       else 'SCHEDULED' end
 from public.loan_repayment_allocations a
 where a.repayment_id=v_row.repayment_id and s.id=a.installment_id and s.organization_id=v_row.organization_id;
 update public.loan_contracts set status='DISBURSED' where id=v_row.contract_id and status='CLOSED';
 update public.loan_repayment_reversals set status='REVERSED',reversal_d1_journal_entry_id=v_journal,reversed_by=v_user,reversed_at=now(),updated_at=now() where id=v_row.id;
 insert into public.loan_repayment_reversal_events(organization_id,reversal_id,event_type,from_status,to_status,note,actor_user_id)
 values(v_row.organization_id,v_row.id,'REVERSED','PROCESSING','REVERSED','D1 journal '||v_journal,v_user);
 insert into public.loan_repayment_events(organization_id,repayment_id,event_type,from_status,to_status,note,actor_user_id)
 values(v_row.organization_id,v_row.repayment_id,'REVERSED','POSTED','POSTED','Reversal '||v_row.reversal_number||' · D1 '||v_journal,v_user);
end;$function$;

create or replace function public.get_loan_settlement_quote(p_contract_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid:=(select auth.uid()); v_contract public.loan_contracts%rowtype; v_principal bigint; v_interest bigint; v_penalty bigint; v_as_of date:=(clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into v_contract from public.loan_contracts where id=p_contract_id and status='DISBURSED' for update;
 if v_contract.id is null then raise exception 'LOAN_SETTLEMENT_CONTRACT_NOT_ACTIVE'; end if;
 if not(private.has_org_permission(v_contract.organization_id,'LOAN_REPAYMENT_VIEW') or private.has_org_permission(v_contract.organization_id,'LOAN_REPAYMENT_POST')) then raise exception 'LOAN_SETTLEMENT_FORBIDDEN'; end if;
 perform private.assess_loan_penalties(v_contract.id,v_as_of);
 select coalesce(sum(greatest(0::bigint,principal_amount-paid_principal_amount)),0),coalesce(sum(greatest(0::bigint,interest_amount-paid_interest_amount)),0),coalesce(sum(greatest(0::bigint,penalty_assessed_amount-paid_penalty_amount-penalty_waived_amount)),0)
 into v_principal,v_interest,v_penalty from public.loan_installment_schedule where contract_id=v_contract.id and organization_id=v_contract.organization_id;
 return jsonb_build_object('contract_id',v_contract.id,'contract_number',v_contract.contract_number,'as_of',v_as_of,'principal_amount',v_principal,'interest_amount',v_interest,'penalty_amount',v_penalty,'total_amount',v_principal+v_interest+v_penalty,'policy','CONTRACTUAL_OUTSTANDING_NO_INTEREST_REBATE');
end;$function$;

create or replace function public.create_loan_full_settlement(p_contract_id uuid,p_channel text,p_treasury_account_id text,p_reference text,p_note text default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid:=(select auth.uid()); v_contract public.loan_contracts%rowtype; v_principal bigint; v_interest bigint; v_penalty bigint; v_total bigint; v_as_of date:=(clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
 if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into v_contract from public.loan_contracts where id=p_contract_id and status='DISBURSED' for update;
 if v_contract.id is null then raise exception 'LOAN_SETTLEMENT_CONTRACT_NOT_ACTIVE'; end if;
 if not private.has_org_permission(v_contract.organization_id,'LOAN_REPAYMENT_POST') then raise exception 'LOAN_SETTLEMENT_FORBIDDEN'; end if;
 if exists(select 1 from public.loan_repayment_reversals where contract_id=v_contract.id and status in ('DRAFT','SUBMITTED','APPROVED','PROCESSING')) then raise exception 'LOAN_SETTLEMENT_CORRECTION_PENDING'; end if;
 perform private.assess_loan_penalties(v_contract.id,v_as_of);
 select coalesce(sum(greatest(0::bigint,principal_amount-paid_principal_amount)),0),coalesce(sum(greatest(0::bigint,interest_amount-paid_interest_amount)),0),coalesce(sum(greatest(0::bigint,penalty_assessed_amount-paid_penalty_amount-penalty_waived_amount)),0)
 into v_principal,v_interest,v_penalty from public.loan_installment_schedule where contract_id=v_contract.id and organization_id=v_contract.organization_id;
 v_total:=v_principal+v_interest+v_penalty;
 if v_total<=0 then raise exception 'LOAN_SETTLEMENT_NOTHING_DUE'; end if;
 return public.create_loan_repayment(p_contract_id,p_channel,p_treasury_account_id,v_total,p_reference,concat_ws(' · ',nullif(trim(coalesce(p_note,'')),''),'FULL_SETTLEMENT_NO_REBATE'));
end;$function$;

revoke execute on function public.create_loan_repayment_reversal(uuid,text) from public,anon;
grant execute on function public.create_loan_repayment_reversal(uuid,text) to authenticated;
revoke execute on function public.submit_loan_repayment_reversal(uuid) from public,anon;
grant execute on function public.submit_loan_repayment_reversal(uuid) to authenticated;
revoke execute on function public.cancel_loan_repayment_reversal(uuid,text) from public,anon;
grant execute on function public.cancel_loan_repayment_reversal(uuid,text) to authenticated;
revoke execute on function public.decide_loan_repayment_reversal(uuid,text,text) from public,anon;
grant execute on function public.decide_loan_repayment_reversal(uuid,text,text) to authenticated;
revoke execute on function public.prepare_loan_repayment_reversal_execution(uuid) from public,anon;
grant execute on function public.prepare_loan_repayment_reversal_execution(uuid) to authenticated;
revoke execute on function public.complete_loan_repayment_reversal_execution(uuid,text) from public,anon;
grant execute on function public.complete_loan_repayment_reversal_execution(uuid,text) to authenticated;
revoke execute on function public.get_loan_settlement_quote(uuid) from public,anon;
grant execute on function public.get_loan_settlement_quote(uuid) to authenticated;
revoke execute on function public.create_loan_full_settlement(uuid,text,text,text,text) from public,anon;
grant execute on function public.create_loan_full_settlement(uuid,text,text,text,text) to authenticated;
