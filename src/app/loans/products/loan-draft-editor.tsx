import { PendingSubmitButton } from "@/components/pending-submit-button";
import { updateLoanDraftAction } from "./actions";
import styles from "@/app/savings/products/products.module.css";

type Version = Record<string, unknown> & { id: string; repayment_channels: string[]; disbursement_channels: string[] };
const stringValue = (version: Version, key: string) => version[key] === null || version[key] === undefined ? "" : String(version[key]);
const booleanValue = (version: Version, key: string) => Boolean(version[key]);
const percentValue = (version: Version, key: string) => String(Number(version[key] || 0) / 100);

export function LoanDraftEditor({ productId, version }: { productId: string; version: Version }) {
  return <form action={updateLoanDraftAction} className={styles.formGrid}>
    <input type="hidden" name="product_id" value={productId} /><input type="hidden" name="version_id" value={version.id} />
    <label>Nama produk<input name="display_name" required minLength={3} maxLength={120} defaultValue={stringValue(version, "display_name")} /></label>
    <label className={styles.wide}>Penjelasan<textarea name="description" rows={3} maxLength={1000} defaultValue={stringValue(version, "description")} /></label>

    <fieldset className={styles.wide}><legend>Plafon dan tenor</legend>
      <label>Pinjaman minimum<input name="min_principal_amount" inputMode="numeric" required defaultValue={stringValue(version, "min_principal_amount")} /></label>
      <label>Pinjaman maksimum<input name="max_principal_amount" inputMode="numeric" required defaultValue={stringValue(version, "max_principal_amount")} /></label>
      <label>Tenor minimum (bulan)<input name="min_tenor_months" type="number" min={1} max={360} required defaultValue={stringValue(version, "min_tenor_months")} /></label>
      <label>Tenor maksimum (bulan)<input name="max_tenor_months" type="number" min={1} max={360} required defaultValue={stringValue(version, "max_tenor_months")} /></label>
      <label>Frekuensi angsuran<select name="installment_frequency" required defaultValue={stringValue(version, "installment_frequency")}><option value="WEEKLY">Mingguan</option><option value="BIWEEKLY">Dua mingguan</option><option value="MONTHLY">Bulanan</option></select></label>
    </fieldset>

    <fieldset className={styles.wide}><legend>Bunga, biaya, dan denda</legend>
      <label>Metode bunga<select name="interest_method" required defaultValue={stringValue(version, "interest_method")}><option value="FLAT">Flat</option><option value="EFFECTIVE">Efektif</option><option value="ANNUITY">Anuitas</option></select></label>
      <label>Bunga per tahun (%)<input name="interest_rate_percent" type="number" min={0} max={100} step="0.01" required defaultValue={percentValue(version, "interest_rate_bps")} /></label>
      <label>Biaya administrasi<input name="admin_fee_amount" inputMode="numeric" defaultValue={stringValue(version, "admin_fee_amount")} /></label>
      <label>Provisi (%)<input name="provision_fee_percent" type="number" min={0} max={100} step="0.01" defaultValue={percentValue(version, "provision_fee_bps")} /></label>
      <label>Masa tenggang (hari)<input name="grace_period_days" type="number" min={0} defaultValue={stringValue(version, "grace_period_days")} /></label>
      <label>Denda per hari (%)<input name="late_penalty_percent_per_day" type="number" min={0} max={100} step="0.01" defaultValue={percentValue(version, "late_penalty_bps_per_day")} /></label>
      <label>Denda minimum<input name="late_penalty_min_amount" inputMode="numeric" defaultValue={stringValue(version, "late_penalty_min_amount")} /></label>
    </fieldset>

    <fieldset className={styles.wide}><legend>Kelayakan dan mitigasi risiko</legend>
      <label>Minimal lama anggota (bulan)<input name="min_membership_months" type="number" min={0} defaultValue={stringValue(version, "min_membership_months")} /></label>
      <label>Minimal saldo simpanan<input name="min_savings_balance_amount" inputMode="numeric" defaultValue={stringValue(version, "min_savings_balance_amount")} /></label>
      <label>Maksimal pinjaman aktif<input name="max_active_loans" type="number" min={1} max={10} required defaultValue={stringValue(version, "max_active_loans")} /></label>
      <label>Batas DSR (%)<input name="max_dsr_percent" type="number" min={0.01} max={100} step="0.01" required defaultValue={percentValue(version, "max_dsr_bps")} /></label>
      <label className={styles.check}><input type="checkbox" name="collateral_required" defaultChecked={booleanValue(version, "collateral_required")} /> Agunan wajib</label>
      <label className={styles.check}><input type="checkbox" name="guarantor_required" defaultChecked={booleanValue(version, "guarantor_required")} /> Penjamin wajib</label>
    </fieldset>

    <fieldset className={styles.wide}><legend>Kanal pencairan</legend>
      <label className={styles.check}><input type="checkbox" name="disbursement_cash" defaultChecked={version.disbursement_channels?.includes("CASH")} /> Tunai</label>
      <label className={styles.check}><input type="checkbox" name="disbursement_bank" defaultChecked={version.disbursement_channels?.includes("BANK_TRANSFER")} /> Transfer bank</label>
    </fieldset>
    <fieldset className={styles.wide}><legend>Kanal pembayaran angsuran</legend>
      <label className={styles.check}><input type="checkbox" name="repayment_cash" defaultChecked={version.repayment_channels?.includes("CASH")} /> Tunai</label>
      <label className={styles.check}><input type="checkbox" name="repayment_bank" defaultChecked={version.repayment_channels?.includes("BANK_TRANSFER")} /> Transfer bank</label>
      <label className={styles.check}><input type="checkbox" name="repayment_qris" defaultChecked={version.repayment_channels?.includes("QRIS")} /> QRIS — hanya jika integrasi tersedia</label>
    </fieldset>

    <fieldset className={styles.wide}><legend>Kode peristiwa akuntansi</legend>
      <label>Pencairan<input name="disbursement_accounting_event_code" required pattern="[A-Z][A-Z0-9_]{2,59}" defaultValue={stringValue(version, "disbursement_accounting_event_code")} /></label>
      <label>Pokok angsuran<input name="principal_accounting_event_code" required pattern="[A-Z][A-Z0-9_]{2,59}" defaultValue={stringValue(version, "principal_accounting_event_code")} /></label>
      <label>Bunga angsuran<input name="interest_accounting_event_code" required pattern="[A-Z][A-Z0-9_]{2,59}" defaultValue={stringValue(version, "interest_accounting_event_code")} /></label>
      <label>Denda<input name="penalty_accounting_event_code" required pattern="[A-Z][A-Z0-9_]{2,59}" defaultValue={stringValue(version, "penalty_accounting_event_code")} /></label>
    </fieldset>

    <label>Mulai berlaku<input name="effective_from" type="date" defaultValue={stringValue(version, "effective_from")} /></label>
    <label>Sampai tanggal (opsional)<input name="effective_to" type="date" defaultValue={stringValue(version, "effective_to")} /></label>
    <label className={styles.wide}>Dasar aturan / regulasi<textarea name="regulatory_basis" rows={3} maxLength={1500} defaultValue={stringValue(version, "regulatory_basis")} placeholder="Keputusan RAT, kebijakan koperasi, atau dasar hukum setelah diverifikasi" /></label>
    <label className={styles.wide}>Ketentuan produk<textarea name="terms_text" rows={5} maxLength={5000} defaultValue={stringValue(version, "terms_text")} /></label>
    <label className={styles.wide}>Catatan perubahan<textarea name="change_note" rows={2} maxLength={500} defaultValue={stringValue(version, "change_note")} /></label>
    <div className={`${styles.actions} ${styles.wide}`}><PendingSubmitButton pendingLabel="Menyimpan…">Simpan Draft</PendingSubmitButton></div>
  </form>;
}
