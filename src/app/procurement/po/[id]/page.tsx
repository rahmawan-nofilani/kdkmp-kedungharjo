import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listWarehouses } from "@/lib/d1/inventory";
import { getPurchaseOrderDetail } from "@/lib/d1/procurement";
import { issuePurchaseOrderAction } from "../../actions";
import ReceivingComposer from "../../receiving-composer";
import styles from "../../procurement.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function timestamp(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}

export default async function PurchaseOrderDetailPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("PURCHASE_VIEW")) redirect("/dashboard");

  const schema = await getD1SchemaStatus();
  if (!schema.current) redirect("/setup/database");

  const { id } = await params;
  const query = await searchParams;
  const [detail, warehouses] = await Promise.all([
    getPurchaseOrderDetail(access.organization.id, id),
    listWarehouses(access.organization.id),
  ]);
  if (!detail) notFound();

  const canIssue = access.permissions.includes("PO_MANAGE");
  const canReceive = access.permissions.includes("RECEIVING_POST");
  const receiveOpen = ["ISSUED", "PARTIALLY_RECEIVED"].includes(detail.po.status) && detail.items.some((item) => item.remaining_qty > 0);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p>PROCUREMENT · PURCHASE ORDER</p><h1>{detail.po.po_number}</h1></div>
        <nav><Link href="/procurement">Procurement</Link><Link href="/inventory">Inventory</Link><Link href="/dashboard">Dashboard</Link></nav>
      </header>

      <div className={styles.content}>
        {query.status ? <div className={styles.success}>Proses berhasil: {query.status.replaceAll("-", " ")}.</div> : null}
        {query.error ? <div className={styles.error}>{query.error}</div> : null}

        <section className={styles.poHero}>
          <div>
            <span className={styles.kicker}>PURCHASE ORDER</span>
            <h2>{detail.po.supplier_name}</h2>
            <p>PR {detail.po.pr_number} · dibuat {timestamp(detail.po.created_at)} · expected {detail.po.expected_date || "belum ditentukan"}</p>
          </div>
          <div className={styles.poSummary}>
            <span>Status</span><strong>{detail.po.status}</strong>
            <small>{rupiah(detail.po.total_amount)}</small>
          </div>
        </section>

        {detail.po.status === "DRAFT" && canIssue ? (
          <section className={styles.actionBanner}>
            <div><strong>PO masih DRAFT.</strong><span>Terbitkan PO sebelum barang dapat diterima.</span></div>
            <form action={issuePurchaseOrderAction}>
              <input type="hidden" name="purchaseOrderId" value={detail.po.id} />
              <button className={styles.primaryButton} type="submit">Issue Purchase Order</button>
            </form>
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.kicker}>ORDER LINES</span><h3>Item & progress penerimaan</h3></div>
            <span className={styles.pill}>{detail.items.length} item</span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Produk</th><th>Ordered</th><th>Received</th><th>Sisa</th><th>HPP</th><th>Total</th></tr></thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.product_name}</strong><span>{item.sku}{item.track_expiry ? " · expiry tracked" : ""}</span></td>
                    <td><strong>{item.quantity_ordered}</strong><span>{item.unit_name}</span></td>
                    <td><strong>{item.quantity_received}</strong></td>
                    <td><strong>{item.remaining_qty}</strong></td>
                    <td><strong>{rupiah(item.unit_cost_amount)}</strong></td>
                    <td><strong>{rupiah(item.line_total_amount)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {receiveOpen && canReceive ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><span className={styles.kicker}>GOODS RECEIVING</span><h3>Posting penerimaan barang</h3></div>
              <span className={styles.pill}>Inventory-linked</span>
            </div>
            <p className={styles.sectionLead}>Qty tidak boleh melampaui sisa PO. Produk expiry-tracked wajib batch/lot dan tanggal expiry. Setelah posting, stok langsung masuk Inventory Ledger sebagai PURCHASE_RECEIPT.</p>
            <ReceivingComposer
              purchaseOrderId={detail.po.id}
              items={detail.items.map((item) => ({
                id: item.id,
                sku: item.sku,
                product_name: item.product_name,
                unit_name: item.unit_name,
                track_expiry: item.track_expiry,
                quantity_ordered: item.quantity_ordered,
                quantity_received: item.quantity_received,
                remaining_qty: item.remaining_qty,
              }))}
              warehouses={warehouses.filter((warehouse) => warehouse.status === "ACTIVE").map((warehouse) => ({ id: warehouse.id, code: warehouse.code, name: warehouse.name }))}
            />
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.kicker}>RECEIVING HISTORY</span><h3>Goods Receipt</h3></div>
            <span className={styles.pill}>{detail.receipts.length}</span>
          </div>
          {detail.receipts.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Receipt</th><th>Gudang</th><th>Qty</th><th>Waktu</th><th>Status</th></tr></thead>
                <tbody>
                  {detail.receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td><strong>{receipt.receipt_number}</strong><span>{receipt.line_count} line</span></td>
                      <td><strong>{receipt.warehouse_code}</strong><span>{receipt.warehouse_name}</span></td>
                      <td><strong>{receipt.total_qty}</strong></td>
                      <td><strong>{timestamp(receipt.received_at)}</strong></td>
                      <td><span className={styles.statusBadge}>{receipt.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={styles.empty}>Belum ada penerimaan untuk PO ini.</div>}
        </section>

        {detail.po.status === "RECEIVED" ? (
          <section className={styles.nextPhase}>
            <span className={styles.kicker}>NEXT CONTROL</span>
            <h3>Barang sudah diterima penuh.</h3>
            <p>Tahap berikutnya adalah Supplier Invoice → 3-Way Match (PO vs Receiving vs Invoice) → Accounts Payable → Payment. Fitur pembayaran belum dibuka pada Phase 2A ini.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
