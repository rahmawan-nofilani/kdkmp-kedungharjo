-- Phase 4E-3: Kontrak Pinjaman & Jadwal Angsuran
-- REVIEW ONLY. File ini sengaja belum diterapkan ke Supabase production.
-- Source of truth jadwal berada di RPC database; authenticated tidak mendapat INSERT langsung ke tabel.

insert into public.permissions (code,module,name,description)
values
  ('LOAN_CONTRACT_VIEW','LOANS','Lihat Kontrak Pinjaman','Melihat kontrak dan jadwal angsuran pinjaman.'),
  ('LOAN_CONTRACT_MANAGE','LOANS','Kelola Kontrak Pinjaman','Membentuk kontrak dari pengajuan pinjaman yang sudah disetujui.')
on conflict (code) do update set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_CONTRACT_VIEW' and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS','PENGAWAS','ADMIN_UNIT','TELLER')
on conflict do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where p.code='LOAN_CONTRACT_MANAGE' and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT','TELLER')
on conflict do nothing;

create table if not exists public.loan_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contract_number text not null unique,
  application_id uuid not null unique references public.loan_applications(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  product_id uuid not null references public.loan_products(id) on delete restrict,
  product_version_id uuid not null references public.loan_product_versions(id) on delete restrict,
  status text not null default 'READY' check (status in ('READY','DISBURSED','CLOSED','CANCELLED')),
  principal_amount bigint not null check (principal_amount > 0),
  tenor_months integer not null check (tenor_months between 1 and 360),
  agreement_date date not null,
  first_due_date date not null,
  installment_frequency text not null check (installment_frequency in ('WEEKLY','BIWEEKLY','MONTHLY')),
  interest_method text not null check (interest_method in ('FLAT','EFFECTIVE','ANNUITY')),
  interest_rate_bps integer not null check (interest_rate_bps >= 0),
  admin_fee_amount bigint not null default 0 check (admin_fee_amount >= 0),
  provision_fee_bps integer not null default 0 check (provision_fee_bps >= 0),
  provision_fee_amount bigint not null default 0 check (provision_fee_amount >= 0),
  total_interest_amount bigint not null check (total_interest_amount >= 0),
  total_installment_amount bigint not null check (total_installment_amount >= principal_amount),
  product_snapshot jsonb not null,
  schedule_snapshot jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists loan_contracts_org_created_idx on public.loan_contracts(organization_id,created_at desc);
create index if not exists loan_contracts_member_idx on public.loan_contracts(organization_id,member_id);

create table if not exists public.loan_installment_schedule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contract_id uuid not null references public.loan_contracts(id) on delete restrict,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  opening_principal_amount bigint not null check (opening_principal_amount >= 0),
  principal_amount bigint not null check (principal_amount >= 0),
  interest_amount bigint not null check (interest_amount >= 0),
  installment_amount bigint not null check (installment_amount = principal_amount + interest_amount),
  closing_principal_amount bigint not null check (closing_principal_amount >= 0),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','DUE','PAID','PARTIAL','WAIVED')),
  created_at timestamptz not null default now(),
  unique(contract_id,installment_number)
);

create index if not exists loan_installment_schedule_org_due_idx on public.loan_installment_schedule(organization_id,due_date);

alter table public.loan_contracts enable row level security;
alter table public.loan_installment_schedule enable row level security;

create policy loan_contracts_select on public.loan_contracts for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_CONTRACT_VIEW')));

create policy loan_installment_schedule_select on public.loan_installment_schedule for select to authenticated
using ((select private.has_org_permission(organization_id,'LOAN_CONTRACT_VIEW')));

-- Tabel bersifat append-only untuk fase ini. Penulisan hanya melalui RPC terproteksi di bawah.
revoke all on table public.loan_contracts from anon,authenticated;
revoke all on table public.loan_installment_schedule from anon,authenticated;
grant select on table public.loan_contracts to authenticated;
grant select on table public.loan_installment_schedule to authenticated;

create or replace function public.create_loan_contract(
  p_application_id uuid,
  p_agreement_date date
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_application public.loan_applications%rowtype;
  v_contract_id uuid := gen_random_uuid();
  v_contract_number text;
  v_product_snapshot jsonb;
  v_frequency text;
  v_method text;
  v_rate integer;
  v_admin_fee bigint;
  v_provision_bps integer;
  v_provision_fee bigint;
  v_periods_per_year integer;
  v_periods integer;
  v_period_rate numeric;
  v_flat_interest_total bigint := 0;
  v_annuity_payment bigint := 0;
  v_opening_principal bigint;
  v_principal_part bigint;
  v_interest_part bigint;
  v_installment bigint;
  v_closing_principal bigint;
  v_due_date date;
  v_first_due date;
  v_total_interest bigint := 0;
  v_total_installment bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_period integer;
begin
  if v_user is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_agreement_date is null then raise exception 'LOAN_CONTRACT_AGREEMENT_DATE_REQUIRED'; end if;

  select * into v_application
  from public.loan_applications
  where id=p_application_id and status='APPROVED'
  for update;
  if v_application.id is null then raise exception 'LOAN_CONTRACT_APPLICATION_NOT_APPROVED'; end if;
  if not private.has_org_permission(v_application.organization_id,'LOAN_CONTRACT_MANAGE') then
    raise exception 'LOAN_CONTRACT_MANAGE_FORBIDDEN';
  end if;
  if exists(select 1 from public.loan_contracts where application_id=p_application_id) then
    raise exception 'LOAN_CONTRACT_ALREADY_EXISTS';
  end if;

  v_product_snapshot := coalesce(v_application.product_snapshot,'{}'::jsonb);
  if coalesce(v_product_snapshot->>'schema_version','') <> 'loan_product_snapshot_v1'
     or coalesce(v_product_snapshot->>'product_version_id','') <> v_application.product_version_id::text then
    raise exception 'LOAN_CONTRACT_PRODUCT_SNAPSHOT_INVALID';
  end if;

  v_frequency := coalesce(v_product_snapshot->>'installment_frequency','');
  v_method := coalesce(v_product_snapshot->>'interest_method','');
  v_rate := coalesce((v_product_snapshot->>'interest_rate_bps')::integer,0);
  v_admin_fee := coalesce((v_product_snapshot->>'admin_fee_amount')::bigint,0);
  v_provision_bps := coalesce((v_product_snapshot->>'provision_fee_bps')::integer,0);

  if v_frequency not in ('WEEKLY','BIWEEKLY','MONTHLY')
     or v_method not in ('FLAT','EFFECTIVE','ANNUITY')
     or v_rate < 0 or v_admin_fee < 0 or v_provision_bps < 0 then
    raise exception 'LOAN_CONTRACT_PRODUCT_SNAPSHOT_INVALID';
  end if;

  v_periods_per_year := case v_frequency when 'WEEKLY' then 52 when 'BIWEEKLY' then 26 else 12 end;
  v_periods := ceil(v_application.requested_tenor_months::numeric * v_periods_per_year / 12)::integer;
  if v_periods < 1 then raise exception 'LOAN_CONTRACT_SCHEDULE_INVALID'; end if;

  v_period_rate := (v_rate::numeric / 10000) / v_periods_per_year;
  v_provision_fee := round(v_application.requested_principal_amount::numeric * v_provision_bps / 10000)::bigint;
  v_opening_principal := v_application.requested_principal_amount;

  if v_method='FLAT' then
    v_flat_interest_total := round(
      v_application.requested_principal_amount::numeric * (v_rate::numeric / 10000)
      * (v_application.requested_tenor_months::numeric / 12)
    )::bigint;
  elsif v_method='ANNUITY' then
    v_annuity_payment := case
      when v_period_rate > 0 then round(
        v_application.requested_principal_amount::numeric * v_period_rate
        / (1 - power(1 + v_period_rate,-v_periods))
      )::bigint
      else round(v_application.requested_principal_amount::numeric / v_periods)::bigint
    end;
  end if;

  for v_period in 1..v_periods loop
    if v_frequency='WEEKLY' then
      v_due_date := p_agreement_date + (v_period * 7);
    elsif v_frequency='BIWEEKLY' then
      v_due_date := p_agreement_date + (v_period * 14);
    else
      v_due_date := (p_agreement_date + make_interval(months => v_period))::date;
    end if;
    if v_period=1 then v_first_due := v_due_date; end if;

    if v_method='FLAT' then
      v_principal_part := (v_application.requested_principal_amount / v_periods)
        + case when v_period <= (v_application.requested_principal_amount % v_periods) then 1 else 0 end;
      v_interest_part := (v_flat_interest_total / v_periods)
        + case when v_period <= (v_flat_interest_total % v_periods) then 1 else 0 end;
    elsif v_method='EFFECTIVE' then
      v_principal_part := case
        when v_period=v_periods then v_opening_principal
        else least(
          v_opening_principal,
          (v_application.requested_principal_amount / v_periods)
            + case when v_period <= (v_application.requested_principal_amount % v_periods) then 1 else 0 end
        )
      end;
      v_interest_part := round(v_opening_principal::numeric * v_period_rate)::bigint;
    else
      v_interest_part := round(v_opening_principal::numeric * v_period_rate)::bigint;
      v_principal_part := case
        when v_period=v_periods then v_opening_principal
        else least(v_opening_principal,greatest(0::bigint,v_annuity_payment-v_interest_part))
      end;
      if v_principal_part <= 0 and v_opening_principal > 0 then
        v_principal_part := least(
          v_opening_principal,
          (v_application.requested_principal_amount / v_periods)
            + case when v_period <= (v_application.requested_principal_amount % v_periods) then 1 else 0 end
        );
      end if;
    end if;

    v_principal_part := least(v_opening_principal,greatest(0::bigint,v_principal_part));
    v_interest_part := greatest(0::bigint,v_interest_part);
    v_installment := v_principal_part + v_interest_part;
    v_closing_principal := greatest(0::bigint,v_opening_principal-v_principal_part);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'installment_number',v_period,
      'due_date',v_due_date,
      'opening_principal_amount',v_opening_principal,
      'principal_amount',v_principal_part,
      'interest_amount',v_interest_part,
      'installment_amount',v_installment,
      'closing_principal_amount',v_closing_principal
    ));

    v_total_interest := v_total_interest + v_interest_part;
    v_total_installment := v_total_installment + v_installment;
    v_opening_principal := v_closing_principal;
  end loop;

  if v_opening_principal <> 0 or v_first_due is null then
    raise exception 'LOAN_CONTRACT_SCHEDULE_INVALID';
  end if;

  v_contract_number := 'KON-' || to_char(clock_timestamp() at time zone 'Asia/Jakarta','YYYYMMDD')
    || '-' || upper(substr(replace(v_contract_id::text,'-',''),1,8));

  insert into public.loan_contracts(
    id,organization_id,contract_number,application_id,member_id,product_id,product_version_id,status,
    principal_amount,tenor_months,agreement_date,first_due_date,installment_frequency,interest_method,
    interest_rate_bps,admin_fee_amount,provision_fee_bps,provision_fee_amount,total_interest_amount,
    total_installment_amount,product_snapshot,schedule_snapshot,created_by
  ) values (
    v_contract_id,v_application.organization_id,v_contract_number,v_application.id,v_application.member_id,
    v_application.product_id,v_application.product_version_id,'READY',v_application.requested_principal_amount,
    v_application.requested_tenor_months,p_agreement_date,v_first_due,v_frequency,v_method,v_rate,v_admin_fee,
    v_provision_bps,v_provision_fee,v_total_interest,v_total_installment,v_product_snapshot,
    jsonb_build_object(
      'schema_version','loan_schedule_v1',
      'periods',v_periods,
      'periods_per_year',v_periods_per_year,
      'first_due_date',v_first_due,
      'principal_amount',v_application.requested_principal_amount,
      'total_principal_amount',v_application.requested_principal_amount,
      'total_interest_amount',v_total_interest,
      'total_installment_amount',v_total_installment,
      'admin_fee_amount',v_admin_fee,
      'provision_fee_amount',v_provision_fee,
      'total_upfront_fee_amount',v_admin_fee+v_provision_fee,
      'rows',v_rows
    ),v_user
  );

  insert into public.loan_installment_schedule(
    organization_id,contract_id,installment_number,due_date,opening_principal_amount,principal_amount,
    interest_amount,installment_amount,closing_principal_amount
  )
  select v_application.organization_id,v_contract_id,x.installment_number,x.due_date,x.opening_principal_amount,
    x.principal_amount,x.interest_amount,x.installment_amount,x.closing_principal_amount
  from jsonb_to_recordset(v_rows) as x(
    installment_number integer,due_date date,opening_principal_amount bigint,principal_amount bigint,
    interest_amount bigint,installment_amount bigint,closing_principal_amount bigint
  )
  order by x.installment_number;

  return v_contract_id;
end;
$function$;

revoke execute on function public.create_loan_contract(uuid,date) from public;
revoke execute on function public.create_loan_contract(uuid,date) from anon;
grant execute on function public.create_loan_contract(uuid,date) to authenticated;
