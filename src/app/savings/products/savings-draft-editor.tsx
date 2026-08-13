import { PendingSubmitButton } from "@/components/pending-submit-button";
import { updateSavingsDraftAction } from "./actions";
import styles from "./products.module.css";

type Version=Record<string,unknown>&{id:string;payment_channels:string[]};
const s=(v:Version,k:string)=>v[k]===null||v[k]===undefined?"":String(v[k]);
const b=(v:Version,k:string)=>Boolean(v[k]);

export function SavingsDraftEditor({productId,version}:{productId:string;version:Version}){
  return <form action={updateSavingsDraftAction} className={styles.formGrid}>
    <input type="hidden" name="product_id" value={productId}/><input type="hidden" name="version_id" value={version.id}/>
    <label>Nama produk<input name="display_name" required minLength={3} maxLength={120} defaultValue={s(version,"display_name")}/></label>
    <label className={styles.wide}>Penjelasan<textarea name="description" rows={3} maxLength={1000} defaultValue={s(version,"description")}/></label>
    <label>Setoran awal minimum<input name="min_opening_amount" inputMode="numeric" defaultValue={s(version,"min_opening_amount")}/></label>
    <label>Setoran minimum<input name="min_deposit_amount" inputMode="numeric" defaultValue={s(version,"min_deposit_amount")}/></label>
    <label>Penarikan minimum<input name="min_withdrawal_amount" inputMode="numeric" defaultValue={s(version,"min_withdrawal_amount")}/></label>
    <label>Saldo minimum<input name="min_balance_amount" inputMode="numeric" defaultValue={s(version,"min_balance_amount")}/></label>
    <label>Saldo maksimum (opsional)<input name="max_balance_amount" inputMode="numeric" defaultValue={s(version,"max_balance_amount")}/></label>
    <label>Masa kunci (hari)<input name="lock_days" type="number" min={0} defaultValue={s(version,"lock_days")}/></label>
    <label>Jatuh tempo (hari, opsional)<input name="maturity_days" type="number" min={1} defaultValue={s(version,"maturity_days")}/></label>
    <label>Target simpanan (opsional)<input name="target_amount" inputMode="numeric" defaultValue={s(version,"target_amount")}/></label>
    <label>Mulai berlaku<input name="effective_from" type="date" defaultValue={s(version,"effective_from")}/></label>
    <label>Sampai tanggal (opsional)<input name="effective_to" type="date" defaultValue={s(version,"effective_to")}/></label>

    <fieldset className={styles.wide}><legend>Layanan yang diperbolehkan</legend>
      <label className={styles.check}><input type="checkbox" name="deposit_enabled" defaultChecked={b(version,"deposit_enabled")}/> Bisa menerima setoran</label>
      <label className={styles.check}><input type="checkbox" name="withdrawal_enabled" defaultChecked={b(version,"withdrawal_enabled")}/> Bisa melakukan penarikan</label>
      <label className={styles.check}><input type="checkbox" name="early_withdrawal_allowed" defaultChecked={b(version,"early_withdrawal_allowed")}/> Boleh tarik sebelum jatuh tempo</label>
      <label className={`${styles.check} ${styles.dangerCheck}`}><input type="checkbox" name="allow_pos_spend" defaultChecked={b(version,"allow_pos_spend")}/> Boleh dipakai belanja POS — <b>belum aktif di transaksi</b></label>
    </fieldset>

    <fieldset className={styles.wide}><legend>Setoran rutin</legend>
      <label className={styles.check}><input type="checkbox" name="recurring_required" defaultChecked={b(version,"recurring_required")}/> Wajib setoran rutin</label>
      <label>Nominal rutin<input name="recurring_amount" inputMode="numeric" defaultValue={s(version,"recurring_amount")}/></label>
      <label>Frekuensi<select name="recurring_frequency" defaultValue={s(version,"recurring_frequency")}><option value="">Tidak ditentukan</option><option value="WEEKLY">Mingguan</option><option value="MONTHLY">Bulanan</option><option value="YEARLY">Tahunan</option></select></label>
    </fieldset>

    <fieldset className={styles.wide}><legend>Kanal pembayaran</legend>
      <label className={styles.check}><input type="checkbox" name="channel_cash" defaultChecked={version.payment_channels?.includes("CASH")}/> Tunai</label>
      <label className={styles.check}><input type="checkbox" name="channel_bank" defaultChecked={version.payment_channels?.includes("BANK_TRANSFER")}/> Transfer bank</label>
      <label className={styles.check}><input type="checkbox" name="channel_qris" defaultChecked={version.payment_channels?.includes("QRIS")}/> QRIS — aktif hanya jika integrasi tersedia</label>
    </fieldset>

    <label className={styles.wide}>Dasar aturan / regulasi<textarea name="regulatory_basis" rows={3} maxLength={1500} defaultValue={s(version,"regulatory_basis")} placeholder="Keputusan RAT, kebijakan koperasi, atau dasar hukum setelah diverifikasi"/></label>
    <label className={styles.wide}>Ketentuan produk<textarea name="terms_text" rows={5} maxLength={5000} defaultValue={s(version,"terms_text")}/></label>
    <label className={styles.wide}>Catatan perubahan<textarea name="change_note" rows={2} maxLength={500} defaultValue={s(version,"change_note")}/></label>
    <div className={`${styles.actions} ${styles.wide}`}><PendingSubmitButton pendingLabel="Menyimpan…">Simpan Draft</PendingSubmitButton></div>
  </form>;
}
