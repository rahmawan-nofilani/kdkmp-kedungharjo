# KopdesKu Design System v1.0 — Repository Integration

## Source of truth

Implementation is based on the user-provided `KopdesKu_Design_System_v1.0_Handoff` package.

Canonical foundation:

- Product brand: **KopdesKu**
- Descriptor: **Integrated Platform**
- Organization remains: **KDKMP Kedungharjo**
- Brand red: `#D92323`
- Deep navy: `#0F172A`
- Page background: `#F8FAFC`
- Surface: `#FFFFFF`
- Primary text: `#0F172A`
- Muted text: `#64748B`
- Typography: Poppins 400/500/600/700
- Spacing base: 4 px
- Minimum touch target: 44 px
- Comfortable control height: 48 px

## Reference logo policy

`public/brand/kopdesku/kopdesku-mark-reference.svg` is **not** the production master vector.
It is a temporary SVG container around a raster crop taken from the approved handoff reference board so the real KopdesKu identity can be used during integration.

When the final master SVG is supplied, replace the reference asset without changing the component API.
Do not trace/rebuild the reference raster and call it the official master.

## Migration boundary

KEEP:

- routes and URLs
- authentication and RBAC
- Supabase/D1 contracts
- server actions
- idempotency
- maker-checker rules
- audit trails
- transaction state machines
- accounting and financial posting

REFINE/REPLACE only in the presentation layer:

- design tokens
- typography
- logo/branding
- core UI components
- application shell
- menu/submenu hierarchy
- responsive navigation
- page composition and visual states

## Parallel rollout

Production UAT remains on the stable production deployment while this branch evolves independently.
Validated business modules are migrated visually in a rolling sequence, followed by regression UAT before production release.
