import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listProductsWithStock } from "@/lib/d1/inventory";
import { listPurchaseOrders, listPurchaseRequests, listSuppliers } from "@/lib/d1/procurement";
import {
  approvePurchaseRequestAction,
  createPurchaseOrderAction,
  createSupplierAction,
  rejectPurchaseRequestAction,
} from "./actions";
import PrComposer from "./pr-composer";
import styles from "./procurement.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ status?: string; error?: string }> };

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" });
}

function statusText(status: string) {
  const map: Record<string, string> = {
    SUBMITTED: "Menunggu approval", APPROVED: "Disetujui", REJECTED: "Ditolak", PO_CREATED: "PO dibuat",
    DRAFT: "Draft", ISSUED: "Diterbitkan", PARTIALLY_RECEIVED: "Diterima sebagian", RECEIVED: "Diterima penuh", CLOSED: "Selesai",
  };
  return map[status] || status;
}

export default async function ProcurementPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const canViewPurchase = access.permissions.includes("PURCHASE_VIEW");
  const canViewSupplier = access.permissions.includes("SUPPLIER_VIEW");
  if (!canViewPurchase && !canViewSupplier) redirect("/dashboard");

  const schema = await getD1SchemaStatus();
  if (!schema.current) redirect("/setup/database");

  const params = await searchParams;
  const [suppliers, purchaseRequests, purchaseOrders, products] = await Promise.all([
    listSuppliers(access.organization.id),
    canViewPurchase ? listPurchaseRequests(access.organization.id, 100) : Promise.resolve([]),
    canViewPurchase ? listPurchaseOrders(access.organization.id, 100) : Promise.resolve([]),
    canViewPurchase ? listProductsWithStock(access.organization.id) : Promise.resolve([]),
  ]);

  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "ACTIVE");
  const activeProducts = products.filter((product) => product.status === "ACTIVE");
  const pending = purchaseRequests.filter((pr) => pr.status === "SUBMITTED");
  const approvedWithoutPo = purchaseRequests.filter((pr) => pr.status === "APPROVED");
  const openPos = purchaseOrders.filter((po) => ["DRAFT", "ISSUED", "PARTIALLY_RECEIVED"].includes(po.status));
  const canManageSupplier = access.permissions.includes("SUPPLIER_MANAGE");
  const canCreate = access.permissions.includes("PURCHASE_CREATE");
  const canApprove = access.permissions.includes("PURCHASE_APPROVE");
  const canPo = access.permissions.includes("PO_MANAGE");

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p>OPERASIONAL · PROCUREMENT</p><h1>Supplier & Purchasing Control</h1></div>
        <nav><Link href="/inventory">Inventory</Link><Link href="/inventory/opname">Stock Opname</Link><Link href="/teller">Teller</Link><Link href="/dashboard">Dashboard</Link></nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <span className={styles.kicker}>PHASE 2A · PROCUREMENT CORE</span>
            <h2>Permintaan, persetujuan, PO, dan penerimaan berada dalam satu jejak transaksi.</h2>
            <p>Receiving yang diposting dari PO otomatis masuk ke Inventory Ledger sebagai PURCHASE_RECEIPT. Pembuat PR tidak dapat menyetujui PR miliknya sendiri.</p>
          </div>
          <div className={styles.orgCard}><span>Organisasi</span><strong>{access.organization.name}</strong><small>{access.role.name}</small></div>
        </section>

        {params.status ? <div className={styles.success}>Proses berhasil: {params.status.replace(/-/g, " ")}.</div> : null}
        {params.error ? <div className={styles.error}>{params.error}</div> : null}

        <section className={styles.metrics}>
          <article><span>Supplier aktif</span><strong>{activeSuppliers.length}</strong><small>dari {suppliers.length} supplier</small></article>
          <article><span>PR menunggu</span><strong>{pending.length}</strong><small>perlu keputusan</small></article>
          <article><span>PR siap PO</span><strong>{approvedWithoutPo.length}</strong><small>sudah approved</small></article>
          <article><span>PO terbuka</span><strong>{openPos.length}</strong><small>draft / issued / partial</small></article>
        </section>

        {canCreate ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.kicker}>PURCHASE REQUEST</span><h3>Buat kebutuhan pembelian</h3></div><span className={styles.pill}>Maker</span></div>
            {activeProducts.length ? <PrComposer products={activeProducts.map((product) => ({ id: product.id, sku: product.sku, name: product.name, unit_name: product.unit_name, cost_amount: product.cost_amount }))} suppliers={activeSuppliers.map((supplier) => ({ id: supplier.id, code: supplier.code, name: supplier.name }))} /> : <div className={styles.empty}>Belum ada produk aktif. Buat Product Master lebih dulu.</div>}
          </section>
        ) : null}

        <section className={styles.twoPanel}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.kicker}>APPROVAL QUEUE</span><h3>PR menunggu keputusan</h3></div><span className={styles.pill}>{pending.length}</span></div>
            {pending.length ? <div className={styles.cardList}>{pending.map((pr) => (
              <div className={styles.requestCard} key={pr.id}>
                <div className={styles.requestHead}><div><strong>{pr.pr_number}</strong><span>{dateTime(pr.submitted_at)} · {pr.item_count} item</span></div><b>{rupiah(pr.total_estimated_amount)}</b></div>
                <p>{pr.notes || "Tanpa catatan"}</p>
                <div className={styles.requestMeta}><span>Supplier: {pr.supplier_name || "belum ditentukan"}</span><span>Maker: {pr.requested_by.slice(0, 8)}</span></div>
                {canApprove ? <div className={styles.decisionRow}>
                  <form action={approvePurchaseRequestAction}><input type="hidden" name="purchaseRequestId" value={pr.id} /><button className={styles.approveButton} type="submit">Approve</button></form>
                  <form action={rejectPurchaseRequestAction} className={styles.rejectForm}><input type="hidden" name="purchaseRequestId" value={pr.id} /><input name="reason" minLength={8} required placeholder="Alasan penolakan" /><button className={styles.rejectButton} type="submit">Reject</button></form>
                </div> : <span className={styles.muted}>Anda memiliki view access tanpa approval permission.</span>}
              </div>
            ))}</div> : <div className={styles.empty}>Tidak ada PR menunggu approval.</div>}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.kicker}>SUPPLIER MASTER</span><h3>Supplier</h3></div><span className={styles.pill}>{suppliers.length}</span></div>
            {canManageSupplier ? <form action={createSupplierAction} className={styles.supplierForm}>
              <div className={styles.formGrid2}>
                <label>Kode<input name="code" required maxLength={30} placeholder="SUP-001" /></label><label>Nama<input name="name" required maxLength={120} placeholder="Nama supplier" /></label>
                <label>Kontak<input name="contactName" placeholder="PIC supplier" /></label><label>Telepon<input name="phone" placeholder="08..." /></label>
                <label>Email<input name="email" type="email" placeholder="Opsional" /></label><label>Termin hari<input name="paymentTermsDays" type="number" min="0" max="365" defaultValue="0" /></label>
              </div>
              <label>NPWP / Tax ID<input name="taxId" placeholder="Opsional" /></label><label>Alamat<textarea name="address" maxLength={300} placeholder="Alamat supplier" /></label>
              <button className={styles.primaryButton} type="submit">Simpan Supplier</button>
            </form> : null}
            <div className={styles.supplierList}>{suppliers.slice(0, 12).map((supplier) => <div key={supplier.id}><strong>{supplier.name}</strong><span>{supplier.code} · {supplier.payment_terms_days} hari · {supplier.status}</span></div>)}{!suppliers.length ? <div className={styles.empty}>Belum ada supplier.</div> : null}</div>
          </article>
        </section>

        {canPo ? <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.kicker}>APPROVED → PURCHASE ORDER</span><h3>Buat PO dari PR yang disetujui</h3></div><span className={styles.pill}>{approvedWithoutPo.length}</span></div>
          {approvedWithoutPo.length ? <div className={styles.poCreateGrid}>{approvedWithoutPo.map((pr) => <form action={createPurchaseOrderAction} className={styles.poCreateCard} key={pr.id}>
            <input type="hidden" name="purchaseRequestId" value={pr.id} /><div><strong>{pr.pr_number}</strong><span>{pr.item_count} item · {rupiah(pr.total_estimated_amount)}</span></div>
            <label>Supplier<select name="supplierId" defaultValue={pr.preferred_supplier_id || ""} required><option value="" disabled>Pilih supplier</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select></label>
            <label>Expected date<input name="expectedDate" type="date" /></label><label>Catatan<input name="notes" maxLength={200} placeholder="Opsional" /></label>
            <button className={styles.primaryButton} type="submit" disabled={!activeSuppliers.length}>Buat PO Draft</button>
          </form>)}</div> : <div className={styles.empty}>Belum ada PR approved yang menunggu PO.</div>}
        </section> : null}

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.kicker}>PURCHASE ORDERS</span><h3>PO & status receiving</h3></div><span className={styles.pill}>{purchaseOrders.length}</span></div>
          {purchaseOrders.length ? <div className={styles.tableWrap}><table><thead><tr><th>PO / PR</th><th>Supplier</th><th>Nilai</th><th>Receiving</th><th>Status</th><th></th></tr></thead><tbody>{purchaseOrders.map((po) => <tr key={po.id}>
            <td><strong>{po.po_number}</strong><span>{po.pr_number} · {dateTime(po.created_at)}</span></td><td><strong>{po.supplier_name}</strong><span>{po.supplier_code}</span></td>
            <td><strong>{rupiah(po.total_amount)}</strong><span>{po.item_count} item</span></td><td><strong>{po.quantity_received} / {po.quantity_ordered}</strong><span>unit</span></td>
            <td><span className={styles.statusBadge}>{statusText(po.status)}</span></td><td><Link className={styles.detailLink} href={`/procurement/po/${po.id}`}>Detail →</Link></td>
          </tr>)}</tbody></table></div> : <div className={styles.empty}>Belum ada Purchase Order.</div>}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.kicker}>PR HISTORY</span><h3>100 Purchase Request terakhir</h3></div><span className={styles.pill}>{purchaseRequests.length}</span></div>
          {purchaseRequests.length ? <div className={styles.tableWrap}><table><thead><tr><th>PR</th><th>Supplier</th><th>Estimasi</th><th>Status</th><th>Catatan</th></tr></thead><tbody>{purchaseRequests.map((pr) => <tr key={pr.id}>
            <td><strong>{pr.pr_number}</strong><span>{dateTime(pr.created_at)} · {pr.item_count} item</span></td><td><strong>{pr.supplier_name || "—"}</strong></td><td><strong>{rupiah(pr.total_estimated_amount)}</strong></td>
            <td><span className={styles.statusBadge}>{statusText(pr.status)}</span></td><td><span>{pr.status === "REJECTED" ? pr.rejection_reason : pr.notes || "—"}</span></td>
          </tr>)}</tbody></table></div> : <div className={styles.empty}>Belum ada Purchase Request.</div>}
        </section>
      </div>
    </main>
  );
}
