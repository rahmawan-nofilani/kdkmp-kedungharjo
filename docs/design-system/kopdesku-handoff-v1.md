# KopdesKu Design System — legacy handoff notice

This file originally documented the early v1.0 repository integration and temporary-logo policy.

## Superseded

The canonical source of truth is now **`KopdesKu_Integration_Pack_v1.2_FINAL.zip`** and the repository execution record at `docs/design-system/kopdesku-integration-v1.2.md`.

The former temporary/reference-logo policy is no longer applicable. Production KopdesKu master assets approved by the v1.2 resolution addendum are already stored under `public/brand/kopdesku/` and used by the shared brand component and PWA presentation.

## Boundary retained from the original handoff

Design-system work may refine presentation only:

- design tokens and typography
- branding and production logo assets
- shared UI components
- AppShell/navigation
- responsive page composition and visual states

It must not intentionally change:

- routes or authentication contracts
- RBAC business semantics
- Supabase/D1 schema or API contracts
- server actions and transaction state machines
- idempotency and maker-checker rules
- audit trails
- inventory/procurement/savings/loan/accounting posting logic

For current migration status, CI evidence, and release boundary, use `kopdesku-integration-v1.2.md` and PR #54.
