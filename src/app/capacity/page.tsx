import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getSystemCapacitySummary, INTERNAL_SAFE_LIMIT_BYTES, LIMITS_VERIFIED_AT } from "@/lib/d1/system-capacity";
import { createClient } from "@/lib/supabase/server";
import { saveCapacitySnapshotAction } from "./actions";
import styles from "./capacity.module.css";

export const dynamic = "force-dynamic";
const SUPABASE_LAST_BYTES = 11766931;

type PageProps = { searchParams: Promise<{ status?: string }> };

function mb(bytes: number | null) {
  if (bytes === null) return "Belum terbaca";
  return `${(bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB`;
}

function percent(bytes: number | null) {
  return bytes === null ? 0 : (bytes / INTERNAL_SAFE_LIMIT_BYTES) * 100;
}

function state(bytes: number | null) {
  const p = percent(bytes);
  if (bytes === null) return "BELUM TERBACA";
  if (p < 60) return "NORMAL";
  if (p < 75) return "WASPADA";
  if (p < 90) return "SIAPKAN ARSIP";
  if (p < 100) return "KRITIS";
  return "TINDAKAN DARURAT";
}

export default async function CapacityPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.systemCapacity) redirect("/setup/database");

  const supabase = await createClient();
  const [summary, members, activeMembers, params] = await Promise.all([
    getSystemCapacitySummary(access.organization.id),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", access.organization.id),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", access.organization.id).eq("status", "ACTIVE"),
    searchParams,
  ]);

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">ZERO-COST CONTROL</p><h1>Kapasitas Sistem</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}><div><span>PEMANTAUAN BIAYA NOL</span><h2>Pantau pertumbuhan data sebelum menyentuh batas layanan gratis.</h2><p>D1 dibaca dari database operasional. Ukuran Supabase saat ini masih berupa catatan pemeriksaan terakhir, belum pembacaan otomatis.</p></div><form action={saveCapacitySnapshotAction}><button>Catat kondisi hari ini</button></form></section>
      {params.status === "saved" ? <div className={styles.success}>Catatan kapasitas hari ini sudah disimpan.</div> : null}

      <section className={styles.metrics}>
        <article><span>D1 OPERASIONAL</span><strong>{mb(summary.d1Bytes)}</strong><small>{percent(summary.d1Bytes).toFixed(1)}% dari batas aman 400 MB</small></article>
        <article><span>SUPABASE · CATATAN 13 AGU 2026</span><strong>{mb(SUPABASE_LAST_BYTES)}</strong><small>Belum live otomatis</small></article>
        <article><span>ANGGOTA</span><strong>{members.count ?? 0}</strong><small>{activeMembers.count ?? 0} anggota ACTIVE</small></article>
        <article><span>TRANSAKSI 30 HARI</span><strong>{summary.sales30d}</strong><small>{summary.salesTotal} transaksi sepanjang data</small></article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}><div className={styles.head}><div><span>TRAFFIC LIGHT DATABASE</span><h3>Batas aman internal</h3></div><b>{state(summary.d1Bytes)}</b></div><div className={styles.rows}><div><span>Normal</span><b>&lt; 240 MB</b></div><div><span>Waspada</span><b>240–300 MB</b></div><div><span>Siapkan arsip</span><b>300–360 MB</b></div><div><span>Kritis</span><b>360–400 MB</b></div><div><span>Tindakan darurat</span><b>≥ 400 MB</b></div></div></article>
        <article className={styles.panel}><div className={styles.head}><div><span>ZERO-COST GUARDRAILS</span><h3>Batas Free plan</h3></div></div><div className={styles.rows}><div><span>D1 satu database</span><b>500 MB</b></div><div><span>D1 total storage akun</span><b>5 GB</b></div><div><span>D1 row read / hari</span><b>5 juta</b></div><div><span>D1 row write / hari</span><b>100 ribu</b></div><div><span>Supabase database</span><b>500 MB</b></div><div><span>Supabase file storage</span><b>1 GB</b></div></div><p className={styles.note}>Batas provider terakhir diverifikasi {LIMITS_VERIFIED_AT}. Sistem memakai 400 MB sebagai batas aman internal.</p></article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}><div className={styles.head}><div><span>PERTUMBUHAN DATA</span><h3>Pendorong database</h3></div></div><div className={styles.rows}><div><span>Jurnal</span><b>{summary.journalEntriesTotal}</b></div><div><span>Mutasi stok</span><b>{summary.inventoryMovementsTotal}</b></div><div><span>Catatan audit</span><b>{summary.auditEventsTotal}</b></div></div></article>
        <article className={styles.panel}><div className={styles.head}><div><span>BACKUP & ARSIP</span><h3>Kesiapan zero-cost</h3></div></div><div className={styles.rows}><div><span>Pemulihan D1 bawaan</span><b>7 hari</b></div><div><span>Backup otomatis Supabase Free</span><b>Tidak termasuk</b></div><div><span>Arsip dingin</span><b>Belum diatur</b></div><div><span>Uji restore mandiri</span><b>Belum dicatat</b></div><div><span>Auto-pruning</span><b>OFF</b></div></div></article>
      </section>

      <section className={styles.panel}><div className={styles.head}><div><span>CATATAN PENGGUNAAN</span><h3>Snapshot 30 hari terakhir</h3></div><b>{summary.snapshots.length}</b></div>{summary.snapshots.length ? <div className={styles.table}><table><thead><tr><th>Tanggal</th><th>D1</th><th>Anggota</th><th>Transaksi 30 hari</th><th>Jurnal</th><th>Mutasi stok</th><th>Audit</th></tr></thead><tbody>{summary.snapshots.map(row => <tr key={row.snapshot_date}><td>{row.snapshot_date}</td><td>{mb(row.d1_bytes)}</td><td>{row.member_count}</td><td>{row.sales_30d}</td><td>{row.journal_entries_total}</td><td>{row.inventory_movements_total}</td><td>{row.audit_events_total}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>Belum ada snapshot. Klik “Catat kondisi hari ini”.</p>}</section>
    </div>
  </section>;
}
