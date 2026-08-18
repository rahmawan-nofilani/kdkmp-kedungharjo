-- Phase 4E-4 hardening: covering index untuk FK member_id.
-- Diterapkan setelah Supabase Performance Advisor mendeteksi loan_disbursements_member_id_fkey belum memiliki covering index langsung.

create index if not exists loan_disbursements_member_fk_idx
  on public.loan_disbursements(member_id);
