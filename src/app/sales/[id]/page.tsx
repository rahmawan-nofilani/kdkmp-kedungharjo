import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getSaleReceipt } from "@/lib/d1/sales";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";
import { voidSaleAction } from "./actions";
import styles from "./receipt.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function checkClass(value: boolean) {
  return value ? styles.pass : styles.fail;
}

export default async function SaleReceiptPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS") && !access.permissions.includes("REPORT_VIEW")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const query = await searchParams;
  const receipt = await getSaleReceipt(access.organization.id, id);
  if (!receipt) notFound();

  let memberName = "Umum / non-anggota";
  if (receipt.sale.member_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("members")
      .select("member_number,full_name")
      .eq("organization_id", access.organization.id)
      .eq("id", receipt.sale.member_id)
      .maybeSingle();
    if (data) memberName = `${data.member_number} · ${data.full_name}`;
  }

  const canVoid = access.permissions.includes("ORG_MANAGE") && receipt.sale.status === "COMMITTED";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span>TRANSACTION RECEIPT</span>
          <strong>{receipt.sale.receipt_number}</strong>
        </div>
        <nav>
          <Link href="/pos">POS</Link>
          <Link href="/reports/daily-sales">Laporan Harian</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        {query.status === "voided" ? <div className={styles.success}>Transaksi berhasil di-void dan reversal sudah diposting.</div> : null}
        {query.error ? <div className={styles.error}>{query.error}</div> : null}

        <section className={styles.receiptCard}>
          <div className={styles.receiptHeader}>
            <div>
              <span className={styles.kicker}>KOPERASI DESA MERAH PUTIH</span>
              <h1>{access.organization.name}</h1>
              <p>{new Date(receipt.sale.sold_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
            </div>
            <div className={styles.statusBlock}>
              <span>Status</span>
              <strong>{receipt.sale.status}</strong>
              <small>{receipt.sale.payment_status}</small>
            </div>
          </div>

          <div className={styles.metaGrid}>
            <div><span>No. Struk</span><strong>{receipt.sale.receipt_number}</strong></div>
            <div><span>Anggota</span><strong>{memberName}</strong></div>
            <div><span>Shift</span><strong>{receipt.sale.shift_id.slice(0, 8)}</strong></div>
            <div><span>Teller</span><strong>{receipt.sale.teller_user_id.slice(0, 8)}</strong></div>
          </div>

          <div className={styles.lines}>
            {receipt.lines.map((line) => (
              <div className={styles.line} key={line.id}>
                <div>
                  <strong>{line.product_name_snapshot}</strong>
                  <span>{line.sku_snapshot} · {line.quantity} × {rupiah(line.unit_price_amount)}</span>
                </div>
                <strong>{rupiah(line.line_total_amount)}</strong>
              </div>
            ))}
          </div>

          <div className={styles.totalBox}>
            <div><span>Subtotal</span><strong>{rupiah(receipt.sale.subtotal_amount)}</strong></div>
            <div><span>Diskon</span><strong>{rupiah(receipt.sale.discount_amount)}</strong></div>
            <div className={styles.grand}><span>Total</span><strong>{rupiah(receipt.sale.total_amount)}</strong></div>
          </div>

          <div className={styles.paymentBox}>
            {receipt.payments.map((payment) => (
              <div key={payment.id}>
                <span>{payment.method} · {payment.status}</span>
                <strong>{rupiah(payment.amount)}</strong>
              </div>
            ))}
          </div>

          {receipt.sale.status === "VOIDED" ? (
            <div className={styles.voidInfo}>
              <strong>VOIDED</strong>
              <span>{receipt.sale.void_reason || "Tanpa alasan"}</span>
              <small>{receipt.sale.voided_at ? new Date(receipt.sale.voided_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}</small>
            </div>
          ) : null}
        </section>

        <section className={styles.integrityCard}>
          <div className={styles.integrityHeader}>
            <div>
              <span className={styles.kicker}>TRANSACTION INTEGRITY</span>
              <h2>Rekonsiliasi otomatis</h2>
            </div>
            <strong className={receipt.reconciliation.passed ? styles.passBadge : styles.failBadge}>
              {receipt.reconciliation.passed ? "PASS" : "CHECK"}
            </strong>
          </div>
          <div className={styles.checkGrid}>
            <div><span>Sale lines = total</span><strong className={checkClass(receipt.reconciliation.amountMatch)}>{receipt.reconciliation.amountMatch ? "PASS" : "FAIL"}</strong></div>
            <div><span>Payment = total</span><strong className={checkClass(receipt.reconciliation.paymentMatch)}>{receipt.reconciliation.paymentMatch ? "PASS" : "FAIL"}</strong></div>
            <div><span>Debit = kredit</span><strong className={checkClass(receipt.reconciliation.journalBalanced)}>{receipt.reconciliation.journalBalanced ? "PASS" : "FAIL"}</strong></div>
            <div><span>Movement stok cocok</span><strong className={checkClass(receipt.reconciliation.inventoryMatch)}>{receipt.reconciliation.inventoryMatch ? "PASS" : "FAIL"}</strong></div>
          </div>
          <div className={styles.auditNumbers}>
            <span>Lines {rupiah(receipt.reconciliation.lineTotal)}</span>
            <span>Debit {rupiah(receipt.reconciliation.journalDebit)}</span>
            <span>Kredit {rupiah(receipt.reconciliation.journalCredit)}</span>
            <span>Stock OUT {receipt.reconciliation.saleOut}</span>
          </div>
        </section>

        <section className={styles.actionsCard}>
          <div className={styles.printAction}><PrintButton /></div>
          {canVoid ? (
            <details className={styles.voidPanel}>
              <summary>Void transaksi — Manager</summary>
              <form action={voidSaleAction}>
                <input type="hidden" name="saleId" value={receipt.sale.id} />
                <label>
                  Alasan void
                  <textarea name="reason" required minLength={8} maxLength={240} placeholder="Contoh: salah input jumlah barang dan transaksi harus dibatalkan." />
                </label>
                <button type="submit">Konfirmasi Void & Posting Reversal</button>
              </form>
              <p>Development control: hanya ORG_MANAGE. Maker-checker approval penuh akan dipasang pada approval engine.</p>
            </details>
          ) : null}
        </section>
      </div>
    </main>
  );
}
