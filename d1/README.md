# D1 Transaction Database — KDKMP Kedungharjo

This directory contains the transactional database schema for the Cloudflare D1 layer.

## Data boundary

- **Supabase**: authentication, user profiles, organization, roles, permissions, unit scopes, member registry/control plane.
- **Cloudflare D1**: products, warehouses, inventory movements, teller shifts, sales, payments, journals, transaction audit, idempotency.
- **Cloudflare R2**: documents, images, APK releases, backup exports.

The current development Worker must not post real financial transactions until the D1 binding and migration are active.

## Development database naming

Use:

`kdkmp-kedungharjo-dev`

Binding name in the Worker:

`DB`

After the database is created and bound, apply migrations in numeric order from `d1/migrations/`.

## Accounting and stock invariants

1. Monetary values are integer rupiah amounts. Do not use floating point for posted money.
2. Stock is derived from `inventory_movements`; never directly edit a mutable stock number.
3. Sale commit must be idempotent.
4. Sale, payment, inventory movement, and accounting journal must be committed as one application-level transaction.
5. Journal debit and credit totals must balance before a journal can be posted.
6. Voids are reversals, not destructive deletes.
7. Member IDs reference the Supabase member registry by UUID string; business transactions retain snapshots needed for audit.
