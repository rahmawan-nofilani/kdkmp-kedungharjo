import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getRecoveryReadiness } from "@/lib/d1/recovery-readiness";
import { recordBackupAction, recordRestoreTestAction } from "./actions";
import styles from "./recovery.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ status?: string; error?: string }> };

function mb(value: number | null) {
  if (value === null) return "Belum terbaca";
  return `${(value / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB`;
}

function mbPerDay(value: number | null) {
  if (value === null) return "Belum cukup data";
  return `${(value / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 3 })} MB/hari`;
}

function days(value: number | null) {
  if (value === null) return "Belum dapat diproyeksikan";
  if (value <= 0) return "Sudah mencapai batas ini";
  return `± ${value.toLocaleString("id-ID")} hari lagi`;
}

function dateTime(value: unknown) {
  const text = String(value || "");
  if (!text) return "Belum ada";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function payloadText(payload: Record<string, unknown>, key: string, fallback = "—") {
  const value = payload[key];
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export default async function RecoveryPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.systemCapacity) redirect("/setup/database");

  const [readiness, params] = await Promise.all([
    getRecoveryReadiness(access.organization.id),
    searchParams,
  ]);

  const latestD1 = readiness.backupHistory.find((item) => ["D1", "BOTH"].includes(payloadText(item.payload, "provider", ""))) || null;
  const latestSupabase = readiness.backupHistory.find((item) => ["SUPABASE", "BOTH"].includes(payloadText(item.payload, "provider", ""))) || null;
  const restorePassed = readiness.restoreHistory.find((item) => payloadText(item.payload, "status", "") === "PASSED") || null;

  return <section className="workspace">
    <header className="workspace-header">
      <div><p className="workspace-kicker">ZERO-COST CONTROL</p><h1>Backup & Pemulihan</h1></div>
    </header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.hero}>
        <div><span>KESIAPAN DATA</span><h2>Pastikan data bisa diselamatkan sebelum kapasitas menjadi masalah.</h2><p>Halaman ini mencatat cadangan data, hasil uji pemulihan, dan proyeksi pertumbuhan. File backup tidak disimpan di D1 agar database tidak cepat penuh.</p></div>
        <a href="/capacity">Kembali ke Kapasitas Sistem</a>
      </section>

      {params.status === "backup-recorded" ? <div className={styles.success}>Catatan cadangan data berhasil disimpan.</div> : null}
      {params.status === "restore-recorded" ? <div className={styles.success}>Hasil uji pemulihan berhasil dicatat.</div> : null}
      {params.error ? <div className={styles.error}>Data belum tersimpan. Periksa isian lalu coba lagi.</div> : null}

      <section className={styles.metrics}>
        <article><span>D1 SAAT INI</span><strong>{mb(readiness.currentD1Bytes)}</strong><small>database operasional</small></article>
        <article><span>PERTUMBUHAN</span><strong>{mbPerDay(readiness.growthPerDay)}</strong><small>dihitung dari snapshot kapasitas</small></article>
        <article><span>CADANGAN D1 TERAKHIR</span><strong>{latestD1 ? dateTime(latestD1.createdAt) : "BELUM DICATAT"}</strong><small>{latestD1 ? payloadText(latestD1.payload, "reference") : "buat/unduh cadangan lalu catat di sini"}</small></article>
        <article><span>UJI PEMULIHAN</span><strong>{restorePassed ? "PERNAH BERHASIL" : "BELUM TERBUKTI"}</strong><small>{restorePassed ? dateTime(restorePassed.createdAt) : "belum ada hasil PASSED"}</small></article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>PROYEKSI PERTUMBUHAN</span><h3>Kapan perlu bertindak?</h3></div></div>
          <div className={styles.rows}>
            <div><span>Waspada · 300 MB</span><b>{days(readiness.projection.warningDays)}</b></div>
            <div><span>Mulai siapkan arsip · 360 MB</span><b>{days(readiness.projection.archiveDays)}</b></div>
            <div><span>Batas aman internal · 400 MB</span><b>{days(readiness.projection.internalLimitDays)}</b></div>
            <div><span>Batas provider · 500 MB</span><b>{days(readiness.projection.providerLimitDays)}</b></div>
          </div>
          <p className={styles.note}>Jika data snapshot masih sedikit atau pertumbuhan nol, proyeksi akan menampilkan “Belum dapat diproyeksikan”.</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>STATUS KESELAMATAN</span><h3>Yang sudah / belum terbukti</h3></div></div>
          <div className={styles.rows}>
            <div><span>Cadangan D1 tercatat</span><b>{latestD1 ? "ADA" : "BELUM"}</b></div>
            <div><span>Cadangan Supabase tercatat</span><b>{latestSupabase ? "ADA" : "BELUM"}</b></div>
            <div><span>Uji pemulihan berhasil</span><b>{restorePassed ? "ADA" : "BELUM"}</b></div>
            <div><span>Hapus data otomatis</span><b>NONAKTIF</b></div>
          </div>
          <p className={styles.note}>Sistem tidak akan menghapus jurnal, transaksi, atau audit log otomatis hanya untuk menghemat kapasitas.</p>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>CATAT CADANGAN DATA</span><h3>Backup yang disimpan di luar aplikasi</h3></div></div>
          <form action={recordBackupAction} className={styles.form}>
            <label>Jenis database<select name="provider" required defaultValue="D1"><option value="D1">D1 · transaksi operasional</option><option value="SUPABASE">Supabase · anggota & akses</option><option value="BOTH">D1 + Supabase</option></select></label>
            <label>Nama / referensi file<input name="reference" required minLength={3} maxLength={180} placeholder="contoh: D1-Backup-2026-08-13.sql" /></label>
            <label>Ukuran file (MB)<input name="sizeMb" inputMode="decimal" placeholder="contoh: 12,5" /></label>
            <label>Checksum / hash (opsional)<input name="checksum" maxLength={160} placeholder="SHA-256 jika tersedia" /></label>
            <label className={styles.full}>Catatan<textarea name="note" maxLength={500} rows={3} placeholder="contoh: disimpan di flashdisk kantor + Google Drive pengurus" /></label>
            <button type="submit">Catat Cadangan</button>
          </form>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}><div><span>CATAT UJI PEMULIHAN</span><h3>Apakah backup benar-benar bisa dipakai?</h3></div></div>
          <form action={recordRestoreTestAction} className={styles.form}>
            <label>Referensi backup<input name="backupReference" required minLength={3} maxLength={180} placeholder="nama file / kode backup" /></label>
            <label>Hasil<select name="status" required defaultValue="PASSED"><option value="PASSED">BERHASIL</option><option value="FAILED">GAGAL</option></select></label>
            <label className={styles.full}>Metode uji<input name="method" required minLength={3} maxLength={160} placeholder="contoh: import ke database uji / sandbox" /></label>
            <label className={styles.full}>Catatan<textarea name="note" maxLength={500} rows={3} placeholder="hasil pengecekan, kendala, atau tindakan berikutnya" /></label>
            <button type="submit">Catat Hasil Uji</button>
          </form>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>RIWAYAT CADANGAN</span><h3>20 catatan terakhir</h3></div><b>{readiness.backupHistory.length}</b></div>
        {readiness.backupHistory.length ? <div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Database</th><th>Referensi</th><th>Ukuran</th><th>Checksum</th></tr></thead><tbody>{readiness.backupHistory.map((item, index) => <tr key={`${item.createdAt}-${index}`}><td>{dateTime(item.createdAt)}</td><td>{payloadText(item.payload, "provider")}</td><td>{payloadText(item.payload, "reference", item.reference)}</td><td>{item.payload.byteSize ? mb(Number(item.payload.byteSize)) : "—"}</td><td className={styles.hash}>{payloadText(item.payload, "checksum")}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>Belum ada backup yang dicatat.</p>}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>RIWAYAT UJI PEMULIHAN</span><h3>Bukti backup pernah diuji</h3></div><b>{readiness.restoreHistory.length}</b></div>
        {readiness.restoreHistory.length ? <div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Backup</th><th>Hasil</th><th>Metode</th><th>Catatan</th></tr></thead><tbody>{readiness.restoreHistory.map((item, index) => <tr key={`${item.createdAt}-${index}`}><td>{dateTime(item.createdAt)}</td><td>{payloadText(item.payload, "backupReference", item.reference)}</td><td><strong>{payloadText(item.payload, "status")}</strong></td><td>{payloadText(item.payload, "method")}</td><td>{payloadText(item.payload, "note")}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>Belum ada uji pemulihan yang dicatat.</p>}
      </section>
    </div>
  </section>;
}
