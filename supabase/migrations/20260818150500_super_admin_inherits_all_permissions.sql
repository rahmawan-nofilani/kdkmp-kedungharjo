-- Keep SUPER_ADMIN aligned with the complete permission catalog.
-- Idempotent: safe when permissions already exist or when future permissions are added
-- and this migration is replayed in a fresh environment.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'SUPER_ADMIN'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );
