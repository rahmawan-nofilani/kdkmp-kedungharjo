import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getStockOpnameSession } from "@/lib/d1/opname";
import {
  approveAndPostStockOpnameAction,
  cancelStockOpnameAction,
  recordStockOpnameCountAction,
  submitStockOpnameAction,
} from "../actions";
import styles from "../opname.module.css";

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

function timestamp(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function StockOpnameDetailPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("INVENTORY_VIEW")) redirect("/dashboard");

  const schema = await getD1SchemaStatus();
  if (!schema.current) redirect("/setup/database");

  const { id } = await params;
  const query = await searchParams;
  const detail = await getStockOpnameSession(access.organization.id, id);
  if (!detail) notFound();

  const canManage = access.permissions.includes("ORG_MANAGE");
  const editable = canManage && ["DRAFT", "COUNTING"].includes(detail.session.status);
  const countedLines = detail.lines.filter((line) => line.physical_qty !== null).length;
  const varianceLines = detail.lines.filter((line) => Number(line.variance_qty || 0) !== 0).length;
  const netVariance = detail.lines.reduce((sum, line) => sum + Number(line.variance_qty || 0), 0);
  const varianceValue = detail.lines.reduce(
    (sum, line) => sum + Number(line.variance_qty || 0) * Number(line.unit_cost_amount || 0),
    0,
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <span>STOCK OPNAME · {detail.session.status}</span>
          <strong>{detail.session.session_number}</strong>
        </div>
        <nav>
          <Link href="/inventory/opname">Inventory Control</Link>
          <Link href="/inventory">Inventory</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.detailHero}>
          <div>
            <span className={styles.kicker}>PHYSICAL COUNT · {detail.session.warehouse_code}</span>
            <h1>{detail.session.warehouse_name}</h1>
            <p>{detail.session.notes || "Tidak ada catatan khusus untuk sesi ini."}</p>
          </div>
          <div className={styles.statusCard}>
            <span>Status</span>
            <strong>{detail.session.status}</strong>
            <small>Dibuat {timestamp(detail.session.created_at)}</small>
          </div>
        </section>

        {query.status === "created" ? <div className={styles.success}>Snapshot opname berhasil dibuat. Mulai hitung fisik per produk.</div> : null}
        {query.status === "count-saved" ? <div className={styles.success}>Hasil hitung baris berhasil disimpan.</div> : null}
        {query.status === "counted" ? <div className={styles.success}>Semua hasil hitung sudah disubmit. Manager dapat review dan posting adjustment.</div> : null}
        {query.status === "posted" ? <div className={styles.success}>Opname disetujui dan adjustment selisih sudah diposting ke inventory ledger.</div> : null}
        {query.error ? <div className={styles.error}>{query.error}</div> : null}

        <section className={styles.metrics}>
          <article><span>Produk snapshot</span><strong>{detail.lines.length}</strong><small>tracked-stock items</small></article>
          <article><span>Sudah dihitung</span><strong>{countedLines}</strong><small>dari {detail.lines.length}</small></article>
          <article><span>Baris selisih</span><strong>{varianceLines}</strong><small>butuh alasan jika ≠ 0</small></article>
          <article><span>Net variance</span><strong>{netVariance > 0 ? `+${netVariance}` : netVariance}</strong><small>{rupiah(varianceValue)}</small></article>
        </section>

        <section className={styles.workflowBar}>
          <div className={["DRAFT", "COUNTING"].includes(detail.session.status) ? styles.currentStep : styles.doneStep}><b>01</b><span>Hitung fisik</span></div>
          <div className={detail.session.status === "COUNTED" ? styles.currentStep : ["POSTED", "APPROVED"].includes(detail.session.status) ? styles.doneStep : styles.futureStep}><b>02</b><span>Submit & review</span></div>
          <div className={detail.session.status === "POSTED" ? styles.doneStep : styles.futureStep}><b>03</b><span>Approve & post</span></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.kicker}>COUNT SHEET</span>
              <h2>System stock vs physical stock</h2>
            </div>
            <span className={styles.neutralBadge}>{countedLines}/{detail.lines.length} saved</span>
          </div>

          <div className={styles.countList}>
            {detail.lines.map((line) => {
              const variance = Number(line.variance_qty || 0);
              return (
                <article className={`${styles.countRow} ${variance !== 0 ? styles.countVariance : ""}`} key={line.id}>
                  <div className={styles.productCopy}>
                    <span>{line.sku}</span>
                    <strong>{line.product_name}</strong>
                    <small>HPP {rupiah(line.unit_cost_amount)} · {line.unit_name}</small>
                  </div>
                  <div className={styles.systemQty}><span>System</span><strong>{line.system_qty}</strong></div>

                  {editable ? (
                    <form action={recordStockOpnameCountAction} className={styles.countForm}>
                      <input type="hidden" name="sessionId" value={id} />
                      <input type="hidden" name="lineId" value={line.id} />
                      <label>Fisik
                        <input
                          name="physicalQty"
                          type="number"
                          min="0"
                          step="1"
                          required
                          defaultValue={line.physical_qty ?? ""}
                          placeholder={String(line.system_qty)}
                        />
                      </label>
                      <label>Alasan selisih
                        <input name="reasonText" maxLength={200} defaultValue={line.reason_text || ""} placeholder="Wajib bila fisik ≠ sistem" />
                      </label>
                      <label>Bukti/ref
                        <input name="evidenceReference" maxLength={240} defaultValue={line.evidence_reference || ""} placeholder="Foto/doc/reference opsional" />
                      </label>
                      <button type="submit">Simpan</button>
                    </form>
                  ) : (
                    <div className={styles.readCount}>
                      <div><span>Fisik</span><strong>{line.physical_qty ?? "—"}</strong></div>
                      <div><span>Variance</span><strong className={variance === 0 ? styles.okText : styles.warnText}>{variance > 0 ? `+${variance}` : variance}</strong></div>
                      <p>{line.reason_text || "Tidak ada alasan selisih."}</p>
                      {line.evidence_reference ? <small>Bukti: {line.evidence_reference}</small> : null}
                    </div>
                  )}

                  {editable && line.physical_qty !== null ? (
                    <div className={styles.savedVariance}>
                      <span>Saved variance</span>
                      <strong className={variance === 0 ? styles.okText : styles.warnText}>{variance > 0 ? `+${variance}` : variance}</strong>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {canManage ? (
          <section className={styles.actionPanel}>
            <div>
              <span className={styles.kicker}>CONTROL ACTION</span>
              <h2>Submit, approve, atau batalkan opname</h2>
              <p>
                Posting hanya diperbolehkan jika semua baris sudah dihitung. Sistem juga memeriksa ulang apakah saldo inventory berubah sejak snapshot dibuat.
              </p>
            </div>
            <div className={styles.actionButtons}>
              {["DRAFT", "COUNTING"].includes(detail.session.status) ? (
                <form action={submitStockOpnameAction}>
                  <input type="hidden" name="sessionId" value={id} />
                  <button className={styles.primaryAction} type="submit" disabled={countedLines !== detail.lines.length}>Submit Hasil Hitung</button>
                </form>
              ) : null}
              {detail.session.status === "COUNTED" ? (
                <form action={approveAndPostStockOpnameAction}>
                  <input type="hidden" name="sessionId" value={id} />
                  <button className={styles.primaryAction} type="submit">Approve & Post Adjustment</button>
                </form>
              ) : null}
              {["DRAFT", "COUNTING", "COUNTED"].includes(detail.session.status) ? (
                <form action={cancelStockOpnameAction}>
                  <input type="hidden" name="sessionId" value={id} />
                  <button className={styles.secondaryAction} type="submit">Batalkan Opname</button>
                </form>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={styles.auditNote}>
          <strong>Control note</strong>
          <p>
            Approval fase 1.4 dilakukan oleh Manager dan seluruh perubahan dicatat pada transaction audit. Segregation-of-Duties terpisah antara counter dan approver akan di-enforce ketika configurable Approval Engine masuk pada fase governance.
          </p>
        </section>
      </div>
    </main>
  );
}
