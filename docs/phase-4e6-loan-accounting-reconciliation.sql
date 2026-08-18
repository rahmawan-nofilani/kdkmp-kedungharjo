-- Phase 4E-6: loan accounting/reconciliation reporting permission only.
-- Financial balances remain sourced live from Supabase loan state + D1 posted journals.
-- No duplicate loan ledger/report snapshot tables are introduced.

insert into public.permissions(code,module,name,description)
values (
  'LOAN_REPORT_VIEW',
  'LOANS',
  'Lihat Laporan & Rekonsiliasi Pinjaman',
  'Melihat aging, outstanding, dan rekonsiliasi state pinjaman Supabase terhadap jurnal D1.'
)
on conflict(code) do update
set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
cross join public.permissions p
where p.code='LOAN_REPORT_VIEW'
  and r.code in ('SUPER_ADMIN','MANAGER','PENGURUS','PENGAWAS','ADMIN_UNIT')
on conflict do nothing;
