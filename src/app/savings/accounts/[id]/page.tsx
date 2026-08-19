import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift } from "@/lib/d1/teller";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import { getSavingsLedgerAccount, listSavingsTransactions, syncSavingsLedgerAccount, type SavingsRuleSnapshot } from "@/lib/d1/savings-ledger";
import { depositSavingsAction, reverseSavingsAction, withdrawSavingsAction } from "../transaction-actions";
import styles from "./ledger.module.css";

export const dynamic="force-dynamic";
type Props={params:Promise<{id:string}>;searchParams:Promise<{status?:string;error?:string;mode?:string}>};
function money(v:unknown){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0));}
function when(v:string){return new Date(v).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"});}
function errorText(code?:string){const m:Record<string,string>={invalid:"Data transaksi belum lengkap.",shift:"Transaksi tunai membutuhkan shift kasir yang sedang OPEN.",minimum:"Nominal lebih kecil dari minimum produk.",balance:"Penarikan akan melewati saldo minimum yang diwajibkan.",maximum:"Setoran akan melewati saldo maksimum produk.",locked:"Rekening masih dalam masa kunci.",maturity:"Produk belum jatuh tempo dan tidak mengizinkan penarikan lebih awal.","deposit-disabled":"Produk ini tidak menerima setoran.","withdraw-disabled":"Produk ini tidak mengizinkan penarikan.",mapping:"Mapping akuntansi simpanan belum siap/disetujui.",account:"Rekening belum ACTIVE atau tidak valid.",period:"Periode akuntansi untuk tanggal ini sudah ditutup/dikunci.",reversed:"Transaksi tersebut sudah dibalik.",reason:"Alasan pembalikan minimal 8 karakter.",save:"Transaksi belum dapat dicatat."};return code?m[code]||m.save:null;}

export default async function SavingsAccountDetail({params,searchParams}:Props){
  const access=await getAccessContext();if(!access)redirect("/login");
  if(!access.permissions.includes("SAVINGS_ACCOUNT_VIEW")||!access.permissions.includes("SAVINGS_TX_VIEW"))redirect("/dashboard");
  const schema=await getD1SchemaStatus();if(!schema.features.savingsLedger)redirect("/setup/database");
  const [{id},query]=await Promise.all([params,searchParams]);
  const mode=query.mode==="deposit"?"deposit":query.mode==="withdraw"?"withdraw":query.mode==="history"?"history":"history";
  const supabase=await createClient();
  const {data:account,error}=await supabase.from("savings_accounts")
    .select("id,organization_id,member_id,product_id,product_version_id,account_number,status,rule_snapshot,opened_by,opened_at")
    .eq("id",id).eq("organization_id",access.organization.id).maybeSingle();
  if(error||!account||account.status!=="ACTIVE")notFound();
  const rules=(account.rule_snapshot||{}) as SavingsRuleSnapshot;
  await syncSavingsLedgerAccount({organizationId:access.organization.id,savingsAccountId:account.id,memberId:account.member_id,productId:account.product_id,productVersionId:account.product_version_id,accountNumber:account.account_number,productCode:String(rules.product_code||"SAVINGS"),openedAt:account.opened_at,rules});
  const memberPromise=access.permissions.includes("MEMBER_VIEW")?supabase.from("members").select("member_number,full_name").eq("id",account.member_id).maybeSingle():Promise.resolve({data:null,error:null});
  const [ledger,transactions,treasury,shift,memberResult]=await Promise.all([
    getSavingsLedgerAccount(access.organization.id,id),listSavingsTransactions(access.organization.id,id,120),listTreasuryAccounts(access.organization.id),getOpenShift(access.organization.id,access.user.id),memberPromise,
  ]);
  const balance=ledger?.balance_amount??0;const activeTreasury=treasury.filter(t=>t.status==="ACTIVE");
  const canDeposit=access.permissions.includes("SAVINGS_DEPOSIT");const canWithdraw=access.permissions.includes("SAVINGS_WITHDRAW");const canReverse=access.permissions.includes("SAVINGS_REVERSE");
  const reversedOriginals=new Set(transactions.filter(t=>t.transaction_type==="REVERSAL"&&t.original_transaction_id).map(t=>String(t.original_transaction_id)));
  const statusText=query.status==="deposited"?"Setoran berhasil dicatat.":query.status==="withdrawn"?"Penarikan berhasil dicatat.":query.status==="reversed"?"Pembalikan transaksi berhasil dicatat.":null;
  const failure=errorText(query.error);const member=memberResult.data as {member_number?:string;full_name?:string}|null;

  return <PageContainer size="wide">
    <PageHeader eyebrow="Simpan Pinjam · Rekening Aktif" title={member?.full_name||account.account_number} description={`${account.account_number} · ${String(rules.display_name||rules.product_code||"Produk Simpanan")}`} actions={<Link href="/savings/accounts">← Daftar Rekening</Link>}/>
    {statusText?<Alert tone="success">{statusText}</Alert>:null}{failure?<Alert tone="danger">{failure}</Alert>:null}

    <Card className={styles.accountHero}>
      <div><span>SALDO SAAT INI</span><strong>{money(balance)}</strong><small>{member?.member_number||"Identitas anggota dibatasi"}</small></div>
      <div className={styles.ruleSummary}><span>Saldo minimum <b>{money(rules.min_balance_amount)}</b></span><span>Setoran awal <b>{money(rules.min_opening_amount)}</b></span><span>Penarikan minimum <b>{money(rules.min_withdrawal_amount)}</b></span></div>
    </Card>

    <nav className={styles.actionBar} aria-label="Aksi rekening">
      {canDeposit?<Link className={mode==="deposit"?styles.actionActive:""} href={`/savings/accounts/${id}?mode=deposit`}>Setor</Link>:null}
      {canWithdraw?<Link className={mode==="withdraw"?styles.actionActive:""} href={`/savings/accounts/${id}?mode=withdraw`}>Tarik</Link>:null}
      <Link className={mode==="history"?styles.actionActive:""} href={`/savings/accounts/${id}?mode=history`}>Riwayat</Link>
    </nav>

    {mode==="deposit"&&canDeposit?<Card className={styles.transactionCard}><div className={styles.panelHead}><div><span>SETORAN MASUK</span><h3>Tambah saldo rekening</h3></div><Badge tone={shift?"success":"warning"}>{shift?"SHIFT OPEN":"BANK / BUKA SHIFT"}</Badge></div><p>Untuk tunai, kasir harus memiliki shift OPEN. Transfer bank tidak menambah kas fisik shift.</p><form action={depositSavingsAction}>
      <input type="hidden" name="account_id" value={id}/><input type="hidden" name="idempotency_key" value={`sav-dep-${crypto.randomUUID()}`}/>
      <label>Nominal<input name="amount" inputMode="numeric" required min={1} placeholder="contoh: 50000"/></label>
      <label>Cara penerimaan<select name="payment_method" defaultValue="CASH"><option value="CASH">Tunai</option><option value="BANK_TRANSFER">Transfer Bank</option></select></label>
      <label>Masuk ke Kas/Bank<select name="treasury_account_id" required defaultValue=""><option value="" disabled>Pilih Kas/Bank</option>{activeTreasury.map(t=><option key={t.id} value={t.id}>{t.account_type==="CASH"?"Kas":"Bank"} · {t.name}</option>)}</select></label>
      <label>Referensi opsional<input name="reference_number" maxLength={80} placeholder="nomor transfer / bukti"/></label><label>Catatan<input name="note" maxLength={160} placeholder="opsional"/></label>
      <PendingSubmitButton pendingLabel="Mencatat setoran…">Catat Setoran</PendingSubmitButton>
    </form></Card>:null}

    {mode==="withdraw"&&canWithdraw?<Card className={styles.transactionCard}><div className={styles.panelHead}><div><span>PENARIKAN</span><h3>Kurangi saldo rekening</h3></div><Badge tone="info">RULE GUARDED</Badge></div><p>Sistem memeriksa saldo minimum, masa kunci, jatuh tempo, serta aturan penarikan produk.</p><form action={withdrawSavingsAction}>
      <input type="hidden" name="account_id" value={id}/><input type="hidden" name="idempotency_key" value={`sav-wdr-${crypto.randomUUID()}`}/>
      <label>Nominal<input name="amount" inputMode="numeric" required min={1} placeholder="contoh: 25000"/></label>
      <label>Cara pembayaran<select name="payment_method" defaultValue="CASH"><option value="CASH">Tunai</option><option value="BANK_TRANSFER">Transfer Bank</option></select></label>
      <label>Keluar dari Kas/Bank<select name="treasury_account_id" required defaultValue=""><option value="" disabled>Pilih Kas/Bank</option>{activeTreasury.map(t=><option key={t.id} value={t.id}>{t.account_type==="CASH"?"Kas":"Bank"} · {t.name}</option>)}</select></label>
      <label>Referensi opsional<input name="reference_number" maxLength={80} placeholder="nomor transfer / bukti"/></label><label>Catatan<input name="note" maxLength={160} placeholder="opsional"/></label>
      <PendingSubmitButton pendingLabel="Mencatat penarikan…">Catat Penarikan</PendingSubmitButton>
    </form></Card>:null}

    {mode==="history"?<Card className={styles.panel}><div className={styles.panelHead}><div><span>BUKU MUTASI</span><h3>Riwayat transaksi</h3></div><Badge>{transactions.length}</Badge></div>
      {transactions.length?<>
        <div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>No. Transaksi</th><th>Jenis</th><th>Kas/Bank</th><th>Masuk</th><th>Keluar</th><th>Jurnal</th><th>Kontrol</th></tr></thead><tbody>{transactions.map(t=>{
          const incoming=t.balance_delta_amount>0;const reversed=reversedOriginals.has(t.id);const cashNeedsShift=t.payment_method==="CASH"&&!shift;
          return <tr key={t.id}><td>{when(t.occurred_at)}</td><td><strong>{t.transaction_number}</strong><small>{t.reference_number||"tanpa referensi"}</small></td><td><Badge tone={t.transaction_type==="REVERSAL"?"warning":t.transaction_type==="DEPOSIT"?"success":"info"}>{t.transaction_type==="DEPOSIT"?"SETORAN":t.transaction_type==="WITHDRAWAL"?"PENARIKAN":"PEMBALIKAN"}</Badge></td><td>{t.treasury_name}<small>{t.payment_method==="CASH"?"Tunai":"Transfer Bank"}</small></td><td className={styles.in}>{incoming?money(Math.abs(t.balance_delta_amount)):"—"}</td><td className={styles.out}>{!incoming?money(Math.abs(t.balance_delta_amount)):"—"}</td><td>{t.journal_number}</td><td>{canReverse&&t.transaction_type!=="REVERSAL"&&!reversed?<form action={reverseSavingsAction} className={styles.reverseForm}><input type="hidden" name="account_id" value={id}/><input type="hidden" name="transaction_id" value={t.id}/><input type="hidden" name="idempotency_key" value={`sav-rev-${t.id}-${crypto.randomUUID()}`}/><input name="reason" required minLength={8} maxLength={240} placeholder="Alasan koreksi"/><PendingSubmitButton disabled={cashNeedsShift} pendingLabel="Membalik…">Balik Transaksi</PendingSubmitButton>{cashNeedsShift?<small>Buka shift untuk membalik transaksi tunai.</small>:null}</form>:reversed?<Badge tone="neutral">SUDAH DIBALIK</Badge>:"—"}</td></tr>;
        })}</tbody></table></div>
        <div className={styles.mobileHistory}>{transactions.map(t=>{const incoming=t.balance_delta_amount>0;const reversed=reversedOriginals.has(t.id);return <article key={t.id}><div><Badge tone={t.transaction_type==="REVERSAL"?"warning":t.transaction_type==="DEPOSIT"?"success":"info"}>{t.transaction_type==="DEPOSIT"?"SETORAN":t.transaction_type==="WITHDRAWAL"?"PENARIKAN":"PEMBALIKAN"}</Badge><strong className={incoming?styles.in:styles.out}>{money(Math.abs(t.balance_delta_amount))}</strong></div><p>{t.transaction_number}</p><small>{when(t.occurred_at)} · {t.treasury_name}</small>{canReverse&&t.transaction_type!=="REVERSAL"&&!reversed?<form action={reverseSavingsAction} className={styles.mobileReverse}><input type="hidden" name="account_id" value={id}/><input type="hidden" name="transaction_id" value={t.id}/><input type="hidden" name="idempotency_key" value={`sav-rev-${t.id}-${crypto.randomUUID()}`}/><input name="reason" required minLength={8} maxLength={240} placeholder="Alasan koreksi"/><PendingSubmitButton pendingLabel="Membalik…">Balik</PendingSubmitButton></form>:null}</article>})}</div>
      </>:<div className={styles.empty}>Belum ada mutasi. Saldo rekening masih Rp0.</div>}
    </Card>:null}

    <Alert tone="info" title="Kontrol transaksi">Saldo dihitung dari mutasi D1. Transaksi asli tidak dihapus atau diedit; koreksi menggunakan Pembalikan.</Alert>
  </PageContainer>;
}
