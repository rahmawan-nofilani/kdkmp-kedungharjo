-- 4E-5C hardening: rejected/cancelled reversal requests are history, not permanent locks.
alter table public.loan_repayment_reversals
  drop constraint if exists loan_repayment_reversals_repayment_id_key;
create unique index if not exists loan_repayment_reversals_active_repayment_uq
  on public.loan_repayment_reversals(repayment_id)
  where status in ('DRAFT','SUBMITTED','APPROVED','PROCESSING','REVERSED');

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
 if exists(select 1 from public.loan_repayment_reversals where repayment_id=v_repayment.id and status in ('DRAFT','SUBMITTED','APPROVED','PROCESSING','REVERSED')) then raise exception 'LOAN_REVERSAL_ALREADY_EXISTS'; end if;
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

revoke execute on function public.create_loan_repayment_reversal(uuid,text) from public,anon;
grant execute on function public.create_loan_repayment_reversal(uuid,text) to authenticated;
