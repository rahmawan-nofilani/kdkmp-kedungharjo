import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getPurchaseOrderDetail,listPurchaseOrders } from "@/lib/d1/procurement";
import { listSupplierInvoices } from "@/lib/d1/procurement-ap";
import { PageContainer,PageHeader } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { approveSupplierInvoiceAction,matchSupplierInvoiceAction,paySupplierInvoiceAction } from "./actions";
import InvoiceComposer from "./invoice-composer";
import styles from "./ap.module.css";

export const dynamic="force-dynamic";
type PageProps={searchParams:Promise<{status?:string;error?:string}>};
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function dateText(value:string|null){if(!value)return"—";return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium"})}
function invoiceTone(status:string):"success"|"warning"|"danger"|"info"|"neutral"{if(status==="PAID")return"success";if(status==="APPROVED"||status==="MATCHED")return"info";if(status==="MISMATCH")return"danger";if(status==="DRAFT")return"warning";return"neutral"}

export default async function AccountsPayablePage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("AP_VIEW")&&!access.permissions.includes("INVOICE_CREATE"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.current)redirect("/setup/database");const query=await searchParams;
 const [invoices,purchaseOrders]=await Promise.all([listSupplierInvoices(access.organization.id,120),listPurchaseOrders(access.organization.id,120)]);
 const invoicedPoIds=new Set(invoices.filter((invoice)=>invoice.status!=="VOIDED").map((invoice)=>invoice.purchase_order_id));const receivedPos=purchaseOrders.filter((po)=>po.status==="RECEIVED"&&!invoicedPoIds.has(po.id));const eligibleDetails=(await Promise.all(receivedPos.slice(0,30).map((po)=>getPurchaseOrderDetail(access.organization.id,po.id)))).filter(Boolean);
 const canCreate=access.permissions.includes("INVOICE_CREATE");const canMatch=access.permissions.includes("INVOICE_MATCH");const canApprove=access.permissions.includes("INVOICE_APPROVE");const canPay=access.permissions.includes("AP_PAY");const openAp=invoices.filter((invoice)=>["APPROVED","MATCHED","MISMATCH","DRAFT"].includes(invoice.status));const outstanding=invoices.reduce((sum,invoice)=>sum+invoice.remaining_amount,0);const mismatches=invoices.filter((invoice)=>invoice.match_status==="MISMATCH").length;const dueSoon=invoices.filter((invoice)=>invoice.remaining_amount>0&&invoice.due_date&&new Date(`${invoice.due_date}T23:59:59`).getTime()<=Date.now()+7*86400000).length;
 return <PageContainer size="wide">
  <PageHeader eyebrow="Procurement · Finance Control" title="Hutang Pemasok" description="Received PO → invoice entry → 3-Way Match → approval terpisah → hutang supplier → pembayaran → jurnal. Mismatch tidak dapat dilompati." actions={<Link className={styles.secondaryButton} href="/procurement">Kembali ke Procurement</Link>}/>
  {query.status?<Alert tone="success" title="Proses berhasil">{query.status.replace(/-/g," ")}.</Alert>:null}
  {query.error?<Alert tone="danger" title="Accounts Payable belum dapat diproses">{query.error}</Alert>:null}

  <section className={styles.metrics}>
   <Card density="compact"><span>Open AP / Invoice</span><strong>{openAp.length}</strong><small>belum selesai</small></Card>
   <Card density="compact"><span>Outstanding</span><strong>{rupiah(outstanding)}</strong><small>sisa hutang supplier</small></Card>
   <Card density="compact" className={mismatches?styles.alertMetric:undefined}><span>Mismatch</span><strong>{mismatches}</strong><small>perlu investigasi</small></Card>
   <Card density="compact" className={dueSoon?styles.alertMetric:undefined}><span>Due ≤ 7 hari</span><strong>{dueSoon}</strong><small>prioritas pembayaran</small></Card>
  </section>

  {canCreate?<Card className={styles.panel}><div className={styles.panelHeader}><div><span className={styles.kicker}>INVOICE ENTRY</span><h3>Catat invoice supplier</h3></div><Badge tone="info">MAKER · {receivedPos.length} PO eligible</Badge></div><p className={styles.lead}>Nilai awal mengikuti PO/receiving dan perbedaan qty/harga akan ditangkap saat 3-Way Match.</p><InvoiceComposer purchaseOrders={eligibleDetails.map((detail)=>({id:detail!.po.id,po_number:detail!.po.po_number,supplier_name:detail!.po.supplier_name,lines:detail!.items.map((item)=>({id:item.id,product_name:item.product_name,sku:item.sku,quantity_received:item.quantity_received,unit_cost_amount:item.unit_cost_amount}))}))}/></Card>:null}

  <Card className={styles.panel}><div className={styles.panelHeader}><div><span className={styles.kicker}>INVOICE & AP QUEUE</span><h3>Kontrol invoice supplier</h3></div><Badge>{invoices.length} invoice</Badge></div>{invoices.length?<div className={styles.invoiceList}>{invoices.map((invoice)=><article className={`${styles.invoiceCard} ${invoice.match_status==="MISMATCH"?styles.mismatchCard:""}`} key={invoice.id}>
   <div className={styles.invoiceHead}><div><strong>{invoice.invoice_number}</strong><span>{invoice.supplier_code} · {invoice.supplier_name}</span></div><div className={styles.invoiceAmount}><strong>{rupiah(invoice.total_amount)}</strong><span>Sisa {rupiah(invoice.remaining_amount)}</span></div></div>
   <div className={styles.metaGrid}><div><span>PO</span><strong>{invoice.po_number}</strong></div><div><span>Invoice date</span><strong>{dateText(invoice.invoice_date)}</strong></div><div><span>Due date</span><strong>{dateText(invoice.due_date)}</strong></div><div><span>Status</span><Badge tone={invoiceTone(invoice.status)}>{invoice.status}</Badge></div><div><span>3-Way Match</span><Badge tone={invoice.match_status==="MATCH"?"success":invoice.match_status==="MISMATCH"?"danger":"neutral"}>{invoice.match_status}</Badge></div><div><span>Paid</span><strong>{rupiah(invoice.paid_amount)}</strong></div></div>
   {invoice.match_note?<div className={invoice.match_status==="MISMATCH"?styles.matchError:styles.matchOk}>{invoice.match_note}</div>:null}
   <div className={styles.actionRow}>{canMatch&&["DRAFT","MISMATCH","MATCHED"].includes(invoice.status)?<form action={matchSupplierInvoiceAction}><input type="hidden" name="invoiceId" value={invoice.id}/><button className={styles.secondaryButton} type="submit">Run 3-Way Match</button></form>:null}{canApprove&&invoice.status==="MATCHED"&&invoice.match_status==="MATCH"?<form action={approveSupplierInvoiceAction}><input type="hidden" name="invoiceId" value={invoice.id}/><button className={styles.approveButton} type="submit">Approve Invoice</button></form>:null}{canPay&&invoice.status==="APPROVED"&&invoice.remaining_amount>0?<form action={paySupplierInvoiceAction} className={styles.payForm}><input type="hidden" name="invoiceId" value={invoice.id}/><label>Nominal<input name="amount" inputMode="numeric" defaultValue={invoice.remaining_amount} required/></label><label>Metode<select name="method" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Bank Transfer</option><option value="CASH">Cash</option></select></label><label>Referensi<input name="referenceNumber" placeholder="No. transfer / bukti"/></label><button className={styles.payButton} type="submit">Posting Payment</button></form>:null}</div>
   {invoice.status==="MATCHED"&&invoice.created_by===access.user.id?<small className={styles.controlNote}>Maker-checker aktif: akun pembuat invoice ini tidak boleh menjadi approver.</small>:null}
  </article>)}</div>:<div className={styles.empty}>Belum ada supplier invoice.</div>}</Card>

  <Card className={styles.accountingNote}><span className={styles.kicker}>ACCOUNTING FLOW</span><div><strong>Receiving</strong><p>Dr 1-1300 Persediaan · Cr 2-1500 GRNI</p></div><div><strong>Invoice approved</strong><p>Dr 2-1500 GRNI · Cr 2-1000 Hutang Supplier</p></div><div><strong>Payment</strong><p>Dr 2-1000 Hutang Supplier · Cr Kas/Bank</p></div><small>Posting memakai accounting mapping aktif dan tetap mengikuti period guard serta journal integrity.</small></Card>
 </PageContainer>;
}
