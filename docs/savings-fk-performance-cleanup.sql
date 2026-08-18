-- Performance cleanup for legacy savings_accounts foreign keys.
-- Existing organization-first composite indexes remain useful for org-scoped queries,
-- but PostgreSQL FK delete/update checks need the referenced FK column as the leading key.

create index if not exists savings_accounts_member_fk_idx
  on public.savings_accounts(member_id);

create index if not exists savings_accounts_product_fk_idx
  on public.savings_accounts(product_id);

create index if not exists savings_accounts_product_version_fk_idx
  on public.savings_accounts(product_version_id);
