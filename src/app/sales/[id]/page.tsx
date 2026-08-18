import { notFound,redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getSaleReceipt } from "@/lib/d1/sales";
import { createClient } from "@/lib/supabase/server";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { MoneyValue } from "@/components/ui/money-value";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/fields";
import { SensitiveAction } from "@/components/domain/transaction-components";
import { PrintButton } from "./print-button";
import { voidSaleAction } from "./actions";
import styles from "./receipt.module.css";

export const dynamic="force-dynamic";
type PageProps={params:Promise<{id:string}>;searchParams:Promise<{status?:string;error?:string;duplicate?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function checkClass(value:boolean){return value?styles.pass:styles.fail}

export default async function SaleReceiptPage({params,searchParams}:PageProps){
  const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("POS_ACCESS")&&!access.permissions.includes("REPORT_VIEW"))redirect("/dashboard");
  const {id}=await params;const query=await searchParams;const receipt=await getSaleReceipt(access.organization.id,id);if(!receipt)notFound();
  let memberName="Umum / non-anggota";if(receipt.sale.member_id){const supabase=await createClient();const {data}=await supabase.from("members").select("member_number,full_name").eq("organization_id",access.organization.id).eq("id",receipt.sale.member_id).maybeSingle();if(data)memberName=`${data.member_number} · ${data.full_name}`}
  const hasVoidPermission=access.permissions.includes("POS_VOID");const isDifferentChecker=receipt.sale.teller_user_id!==access.user.id;const canVoid=hasVoidPermission&&isDifferentChecker&&receipt.sale.status==="COMMITTED";
  const statusTone=receipt.sale.status==="VOIDED"?"danger":receipt.reconciliation.passed?"success":"warning";

  return <PageContainer size="normal">
    <PageHeader eyebrow="Penjualan · Detail transaksi" title={receipt.sale.receipt_number} description={`${access.organization.name} · ${new Date(receipt.sale.sold_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}`} actions={<div className={styles.headerBadges}><Badge tone={statusTone}>{receipt.sale.status}</Badge><Badge>{receipt.sale.payment_status}</Badge></div>}/>
    {query.status==="voided"?<Alert tone="success" title="Controlled void selesai">{query.duplicate?"Void sebelumnya sudah terposting; retry direkonsiliasi tanpa posting ganda.":"Transaksi berhasil di-void dan reversal sudah diposting."}</Alert>:null}
    {query.error?<Alert tone="danger" title="Void belum dapat diproses">{query.error}</Alert>:null}

    <Card className={styles.receiptCard}>
      <div className={styles.metaGrid}><div><span>No. Struk</span><strong>{receipt.sale.receipt_number}</strong></div><div><span>Anggota</span><strong>{memberName}</strong></div><div><span>Shift</span><strong>{receipt.sale.shift_id.slice(0,8)}</strong></div><div><span>Teller</span><strong>{receipt.sale.teller_user_id.slice(0,8)}</strong></div></div>
      <div className={styles.lines}>{receipt.lines.map((line)=><div className={styles.line} key={line.id}><div><strong>{line.product_name_snapshot}</strong><span>{line.sku_snapshot} · {line.quantity} × {rupiah(line.unit_price_amount)}</span></div><MoneyValue value={line.line_total_amount}/></div>)}</div>
      <div className={styles.totalBox}><div><span>Subtotal</span><MoneyValue value={receipt.sale.subtotal_amount}/></div><div><span>Diskon</span><MoneyValue value={receipt.sale.discount_amount}/></div><div className={styles.grand}><span>Total</span><MoneyValue value={receipt.sale.total_amount} strong/></div></div>
      <div className={styles.paymentBox}>{receipt.payments.map((payment)=><div key={payment.id}><span>{payment.method} · {payment.status}</span><MoneyValue value={payment.amount}/></div>)}</div>
      {receipt.sale.status==="VOIDED"?<div className={styles.voidInfo}><strong>VOIDED</strong><span>{receipt.sale.void_reason||"Tanpa alasan"}</span><small>{receipt.sale.voided_at?new Date(receipt.sale.voided_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"}):""}</small></div>:null}
    </Card>

    <Card className={styles.integrityCard}>
      <div className={styles.integrityHeader}><div><span className={styles.kicker}>TRANSACTION INTEGRITY</span><h2>Rekonsiliasi otomatis</h2></div><Badge tone={receipt.reconciliation.passed?"success":"danger"}>{receipt.reconciliation.passed?"PASS":"CHECK"}</Badge></div>
      <div className={styles.checkGrid}><div><span>Sale lines = total</span><strong className={checkClass(receipt.reconciliation.amountMatch)}>{receipt.reconciliation.amountMatch?"PASS":"FAIL"}</strong></div><div><span>Payment = total</span><strong className={checkClass(receipt.reconciliation.paymentMatch)}>{receipt.reconciliation.paymentMatch?"PASS":"FAIL"}</strong></div><div><span>Debit = kredit</span><strong className={checkClass(receipt.reconciliation.journalBalanced)}>{receipt.reconciliation.journalBalanced?"PASS":"FAIL"}</strong></div><div><span>Movement stok cocok</span><strong className={checkClass(receipt.reconciliation.inventoryMatch)}>{receipt.reconciliation.inventoryMatch?"PASS":"FAIL"}</strong></div></div>
      <div className={styles.auditNumbers}><span>Lines {rupiah(receipt.reconciliation.lineTotal)}</span><span>Debit {rupiah(receipt.reconciliation.journalDebit)}</span><span>Kredit {rupiah(receipt.reconciliation.journalCredit)}</span><span>Stock OUT {receipt.reconciliation.saleOut}</span></div>
    </Card>

    <Card className={styles.actionsCard}><div className={styles.printAction}><PrintButton/></div>{canVoid?<SensitiveAction summary="Void transaksi — checker" impact={<><strong>Dampak tindakan</strong><span>Receipt {receipt.sale.receipt_number} akan menjadi VOIDED, pembayaran direverse, stok dipulihkan, dan jurnal pembalik diposting tanpa menghapus histori transaksi.</span></>} note="Hanya role dengan POS_VOID; teller asal tidak boleh menjadi checker; shift asal harus OPEN; saldo kas harus cukup; retry tidak membuat reversal ganda."><form action={voidSaleAction} className={styles.voidForm}><input type="hidden" name="saleId" value={receipt.sale.id}/><TextAreaField label="Alasan void" name="reason" required minLength={8} maxLength={240} placeholder="Contoh: salah input jumlah barang dan transaksi harus dibatalkan."/><Button type="submit" variant="danger">Konfirmasi Void & Posting Reversal</Button></form></SensitiveAction>:receipt.sale.status==="COMMITTED"&&hasVoidPermission&&!isDifferentChecker?<Alert tone="warning" title="Maker-checker aktif">Transaksi ini dibuat oleh Anda. Gunakan pengguna berwenang lain sebagai checker.</Alert>:null}</Card>
  </PageContainer>;
}
