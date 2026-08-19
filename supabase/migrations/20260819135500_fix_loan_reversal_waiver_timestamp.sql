-- Production hotfix: loan repayment reversal stale-state guard.
-- loan_penalty_waivers records the approval/rejection timestamp in decided_at,
-- not approved_at. The previous reference caused reversal creation to fail at runtime.

create or replace function private.loan_reversal_is_stale(p_repayment_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.loan_repayments%rowtype;
begin
  select * into v_row
  from public.loan_repayments
  where id = p_repayment_id;

  if v_row.id is null or v_row.status <> 'POSTED' or v_row.posted_at is null then
    return true;
  end if;

  if exists(
    select 1
    from public.loan_repayments r2
    where r2.contract_id = v_row.contract_id
      and r2.status = 'POSTED'
      and r2.posted_at > v_row.posted_at
      and not exists(
        select 1
        from public.loan_repayment_reversals rr
        where rr.repayment_id = r2.id
          and rr.status = 'REVERSED'
      )
  ) then
    return true;
  end if;

  if exists(
    select 1
    from public.loan_penalty_assessment_events e
    where e.contract_id = v_row.contract_id
      and e.created_at > v_row.posted_at
  ) then
    return true;
  end if;

  if exists(
    select 1
    from public.loan_penalty_waivers w
    where w.contract_id = v_row.contract_id
      and w.status = 'APPROVED'
      and w.decided_at > v_row.posted_at
  ) then
    return true;
  end if;

  return false;
end;
$function$;

revoke all on function private.loan_reversal_is_stale(uuid) from public, anon, authenticated;
