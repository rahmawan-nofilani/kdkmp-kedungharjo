import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift, getTellerReadiness } from "@/lib/d1/teller";
import { createClient } from "@/lib/supabase/server";
import { closeShiftAction, openShiftAction } from "./actions";
import styles from "./teller.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ status?: string; error?: string; variance?: string }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function TellerPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS")) redirect("/dashboard");

  const params = await searchParams;
  const supabase = await createClient();
  const [{ count: memberCount }, d1] = await Promise.all([
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", access.organization.id)
      .eq("status", "ACTIVE"),
    getD1SchemaStatus(),
  ]);

  const [readiness, openShift] = d1.initialized
    ? await Promise.all([
        getTellerReadiness(access.organization.id),
        getOpenShift(access.organization.id, access.user.id),
      ])
    : [
        { products: 0, warehouses: 0, movements: 0, inventoryReady: false },
        null,
      ];

  const shiftReady = Boolean(openShift);
  const posFoundationReady = d1.initialized && readiness.inventoryReady && shiftReady;
  const variance = Number(params.variance ?? "0");

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
          {posFoundationReady ? <Link href="/pos">Buka POS</Link> : null}
          <Link href="/closing">Closing</Link>
          {access.permissions.includes("INVENTORY_VIEW") ? <Link href="/inventory">Inventory</Link> : null}
          {access.permissions.includes("ORG_MANAGE") ? <Link href="/setup/database">D1 Setup</Link> : null}
          <Link href="/members">Anggota</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>PHASE 1.3 · TELLER, POS & RECONCILIATION</p>
            <h1>Workspace Teller PC</h1>
            <p>
              D1 Transaction Core, inventory ledger, cash shift, dan POS atomik sudah terhubung. Penutupan shift sekarang melewati reconciliation gate agar sale, payment, stok, dan jurnal harus konsisten sebelum status CLOSED.
            </p>
          </div>
          <div className={styles.role}>
            <span>Akses aktif</span>
            <strong>{access.role.name}</strong>
            <span>{access.units.map((unit) => unit.name).join(", ") || "Tanpa unit scope"}</span>
          </div>
        </section>

        {params.status === "shift-opened" ? <div className={styles.success}>Shift teller berhasil dibuka. POS development sekarang dapat digunakan.</div> : null}
        {params.status === "shift-closed" ? (
          <div className={variance === 0 ? styles.success : styles.warning}>
            Shift ditutup. Selisih kas: {rupiah(variance)}.
          </div>
        ) : null}
        {params.error ? <div className={styles.error}>{params.error}</div> : null}

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Pencarian anggota</h2>
            <p>Cari anggota sebelum transaksi atau pelayanan. Member registry tetap berada di Supabase, sedangkan transaksi dicatat di D1.</p>
            <form className={styles.lookup} action="/members" method="get">
              <input name="q" placeholder="Nomor anggota, nama, telepon, atau kode KK..." aria-label="Cari anggota" />
              <button type="submit">Cari Anggota</button>
            </form>

            <div className={styles.quickGrid}>
              <Link className={styles.quick} href="/members">
                <span>Member Registry</span>
                <strong>{memberCount ?? 0} anggota aktif</strong>
              </Link>
              <Link className={styles.quick} href="/inventory">
                <span>Product & Inventory</span>
                <strong>{readiness.products} produk · {readiness.warehouses} gudang</strong>
              </Link>
              {posFoundationReady ? (
                <Link className={styles.quick} href="/pos">
                  <span>Cash Drawer</span>
                  <strong>OPEN · Buka POS</strong>
                </Link>
              ) : (
                <div className={styles.quick}>
                  <span>Cash Drawer</span>
                  <strong>{openShift ? `OPEN · ${rupiah(openShift.opening_cash_amount)}` : "CLOSED"}</strong>
                </div>
              )}
            </div>

            <section className={styles.shiftPanel}>
              <div>
                <p className={styles.kicker}>CASH CONTROL</p>
                <h2>{openShift ? "Shift sedang OPEN" : "Buka Shift Teller"}</h2>
                {openShift ? (
                  <p>Shift dibuka {new Date(openShift.opened_at).toLocaleString("id-ID")} dengan kas awal {rupiah(openShift.opening_cash_amount)}. Closing akan memeriksa integritas transaksi sebelum kas dapat ditutup.</p>
                ) : (
                  <p>Kas awal wajib dicatat sebelum POS dapat menerima transaksi tunai.</p>
                )}
              </div>

              {openShift ? (
                <form action={closeShiftAction} className={styles.shiftForm}>
                  <label>
                    Kas fisik saat tutup
                    <input name="countedCashAmount" inputMode="numeric" defaultValue="0" required />
                  </label>
                  <button type="submit" className={styles.closeButton}>Rekonsiliasi & Tutup Shift</button>
                </form>
              ) : (
                <form action={openShiftAction} className={styles.shiftForm}>
                  <label>
                    Kas awal
                    <input name="openingCashAmount" inputMode="numeric" defaultValue="0" required />
                  </label>
                  <button type="submit" disabled={!readiness.inventoryReady}>Buka Shift</button>
                </form>
              )}
            </section>
          </article>

          <aside className={styles.card}>
            <h2>Readiness transaksi</h2>
            <p>Gate ini mencegah uang diposting atau shift ditutup sebelum seluruh ledger pendukung siap.</p>
            <div className={styles.readiness}>
              <div><span>Authentication & RBAC</span><strong className={styles.ready}>READY</strong></div>
              <div><span>Member master</span><strong className={styles.ready}>READY</strong></div>
              <div>
                <span>D1 transaction database</span>
                <strong className={d1.initialized ? styles.ready : d1.bound ? styles.wait : styles.block}>
                  {d1.initialized ? "READY" : d1.bound ? "INITIALIZE" : "PROVISIONING"}
                </strong>
              </div>
              <div>
                <span>Product & inventory ledger</span>
                <strong className={readiness.inventoryReady ? styles.ready : d1.initialized ? styles.wait : styles.block}>
                  {readiness.inventoryReady ? "READY" : d1.initialized ? "SETUP" : "BLOCKED"}
                </strong>
              </div>
              <div>
                <span>Cash drawer & shift</span>
                <strong className={shiftReady ? styles.ready : readiness.inventoryReady ? styles.wait : styles.block}>
                  {shiftReady ? "OPEN" : readiness.inventoryReady ? "READY TO OPEN" : "BLOCKED"}
                </strong>
              </div>
              <div>
                <span>POS commit + journal</span>
                <strong className={posFoundationReady ? styles.ready : styles.block}>
                  {posFoundationReady ? "READY" : "BLOCKED"}
                </strong>
              </div>
            </div>
            {!readiness.inventoryReady ? (
              <p className={styles.note}>Buka menu Inventory, buat Gudang Utama, produk development, lalu posting opening stock minimal satu produk.</p>
            ) : !openShift ? (
              <p className={styles.note}>Inventory sudah siap. Buka shift teller untuk mengaktifkan POS development.</p>
            ) : (
              <p className={styles.note}>POS siap. Gunakan menu Closing untuk melihat reconciliation PASS/CHECK dan exception per struk.</p>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
