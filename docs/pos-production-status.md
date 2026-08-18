# POS Production Hardening Status

## Supabase
Applied migration:
- `20260818045103 pos_production_hardening_controlled_void`

Permission `POS_VOID` is active for:
- SUPER_ADMIN
- MANAGER
- ADMIN_UNIT

## Controlled CASH void
- Original sale, payment, stock movements, and SALE journal are never deleted.
- Teller who created the sale cannot void it themselves.
- Original teller shift must still be OPEN.
- Sale must remain COMMITTED/PAID with one confirmed CASH payment equal to receipt total.
- Cash account is identified from the original journal and must have enough posted balance for refund.
- Idempotency key is fixed as `pos-sale-void:<sale_id>`.
- Payment becomes REVERSED; sale becomes VOIDED/REFUNDED.
- Tracked inventory is restored with SALE_VOID movements.
- SALE_VOID journal swaps every debit/credit line from the original SALE journal.
- Audit event `SALE_VOIDED_CONTROLLED` records original teller, shift, journals, cash account, amount, and reason.
- Closed/locked accounting-period guard remains effective through D1 journal controls.

## Shift integrity
Shift reconciliation already excludes voided sales from confirmed cash and requires payment reversal, balanced void journal, and matching SALE/SALE_VOID stock quantities before a shift can close.

## Advisors
- No new Supabase performance/security finding was introduced by this permission-only migration.
- Existing unindexed foreign keys on `savings_accounts` remain legacy cleanup.
- Existing authenticated SECURITY DEFINER warnings belong to privileged loan RPCs.
- Leaked-password protection remains a global Supabase Auth warning.

## Boundary
- This hardening certifies the current CASH POS workflow.
- QRIS/BANK_TRANSFER provider settlement is not simulated or falsely marked operational.
- Historical sales from CLOSED shifts are not modified by sale void; they require a separate controlled finance correction policy.
