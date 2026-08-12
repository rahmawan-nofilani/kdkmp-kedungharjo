import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import styles from "./teller.module.css";

export const dynamic = "force-dynamic";

export default async function TellerPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS")) redirect("/dashboard");

  const supabase = await createClient();
  const { count: memberCount } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", access.organization.id)
    .eq("status", "ACTIVE");

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.mark}>KD</div>
          <div>
            <strong>KDKMP Teller</strong>
            <span>{access.organization.name} · Development</span>
          </div>
        </div>
        <div className={styles.topActions}>
          <Link href="/members">Anggota</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>PHASE 1 · TELLER FOUNDATION</p>
            <h1>Workspace Teller PC</h1>
            <p>
              Fondasi teller sudah memakai session dan permission nyata. Transaksi finansial belum dibuka sampai database transaksi D1, produk, inventory ledger, dan cash drawer siap.
            </p>
          </div>
          <div className={styles.role}>
            <span>Akses aktif</span>
            <strong>{access.role.name}</strong>
            <span>{access.units.map((unit) => unit.name).join(", ") || "Tanpa unit scope"}</span>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Pencarian anggota</h2>
            <p>Cari anggota sebelum transaksi atau pelayanan. Saat ini data yang tersedia masih data development.</p>
            <form className={styles.lookup} action="/members" method="get">
              <input name="q" placeholder="Nomor anggota, nama, telepon, atau kode KK..." aria-label="Cari anggota" />
              <button type="submit">Cari Anggota</button>
            </form>

            <div className={styles.quickGrid}>
              <Link className={styles.quick} href="/members">
                <span>Member Registry</span>
                <strong>{memberCount ?? 0} anggota aktif</strong>
              </Link>
              <div className={styles.quick}>
                <span>Cash Drawer</span>
                <strong>Belum dibuka</strong>
              </div>
              <div className={styles.quick}>
                <span>Transaksi hari ini</span>
                <strong>Belum aktif</strong>
              </div>
            </div>
          </article>

          <aside className={styles.card}>
            <h2>Readiness transaksi</h2>
            <p>Gate ini sengaja menahan transaksi uang sampai semua ledger tersedia.</p>
            <div className={styles.readiness}>
              <div><span>Authentication & RBAC</span><strong className={styles.ready}>READY</strong></div>
              <div><span>Member master</span><strong className={styles.ready}>READY</strong></div>
              <div><span>D1 transaction database</span><strong className={styles.wait}>NEXT</strong></div>
              <div><span>Product & inventory ledger</span><strong className={styles.block}>BLOCKED</strong></div>
              <div><span>Cash drawer & shift</span><strong className={styles.block}>BLOCKED</strong></div>
              <div><span>POS commit + journal</span><strong className={styles.block}>BLOCKED</strong></div>
            </div>
            <p className={styles.note}>
              Tidak ada transaksi uang nyata yang dapat diposting dari layar ini pada Phase 1 awal.
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
