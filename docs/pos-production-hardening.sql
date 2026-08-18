-- POS production hardening: controlled sale void/refund authorization.
-- Actual sale/payment/stock/journal reversal remains an atomic D1 transaction.

insert into public.permissions(code,module,name,description)
values (
  'POS_VOID',
  'POS',
  'Void Penjualan',
  'Melakukan void/refund penjualan tunai dengan reversal stok dan jurnal; pelaku tidak boleh sama dengan teller transaksi asal.'
)
on conflict(code) do update
set module=excluded.module,name=excluded.name,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
cross join public.permissions p
where p.code='POS_VOID'
  and r.code in ('SUPER_ADMIN','MANAGER','ADMIN_UNIT')
on conflict do nothing;
