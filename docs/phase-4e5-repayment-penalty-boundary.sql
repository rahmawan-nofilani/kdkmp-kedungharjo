-- Phase 4E-5 hardening: do not silently waive configured late penalties.
-- If a product snapshot has late_penalty_bps_per_day > 0 and an unpaid installment is already
-- beyond its grace period, core 4E-5 refuses to create a repayment until the penalty engine exists.

create or replace function private.guard_loan_repayment_penalty_boundary()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_contract public.loan_contracts%rowtype;
  v_penalty_bps integer;
  v_grace_days integer;
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
begin
  select * into v_contract from public.loan_contracts where id=new.contract_id;
  if v_contract.id is null then raise exception 'LOAN_REPAYMENT_CONTRACT_NOT_ACTIVE'; end if;

  v_penalty_bps := coalesce((v_contract.product_snapshot->>'late_penalty_bps_per_day')::integer,0);
  v_grace_days := greatest(0,coalesce((v_contract.product_snapshot->>'grace_period_days')::integer,0));

  if v_penalty_bps > 0 and exists(
    select 1
    from public.loan_installment_schedule s
    where s.contract_id=v_contract.id
      and s.organization_id=v_contract.organization_id
      and (
        s.paid_principal_amount < s.principal_amount
        or s.paid_interest_amount < s.interest_amount
      )
      and v_today > (s.due_date + v_grace_days)
  ) then
    raise exception 'LOAN_REPAYMENT_PENALTY_ENGINE_REQUIRED';
  end if;

  return new;
end;
$function$;

drop trigger if exists loan_repayment_penalty_boundary on public.loan_repayments;
create trigger loan_repayment_penalty_boundary
before insert on public.loan_repayments
for each row execute function private.guard_loan_repayment_penalty_boundary();

revoke all on function private.guard_loan_repayment_penalty_boundary() from public;
revoke all on function private.guard_loan_repayment_penalty_boundary() from anon;
revoke all on function private.guard_loan_repayment_penalty_boundary() from authenticated;
