import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getOpenShift } from "@/lib/d1/teller";
import {
  ensurePosFoundation,
  getPrimaryWarehouse,
  listRecentSales,
  listSaleProducts,
} from "@/lib/d1/pos";
import { createClient } from "@/lib/supabase/server";
import { PosTerminal } from "./pos-terminal";
import styles from "./pos.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    error?: string;
    sale?: string;
    receipt?: string;
    total?: string;
    duplicate?: string;
  }>;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function PosPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("POS_ACCESS")) redirect("/dashboard");

  const d1 = await getD1SchemaStatus();
  if (!d1.initialized) redirect("/setup/database");

  const shift = await getOpenShift(access.organization.id, access.user.id);
  if (!shift) redirect("/teller?error=POS membutuhkan shift teller OPEN.");

  await ensurePosFoundation();
  const warehouse = await getPrimaryWarehouse(access.organization.id);
  if (!warehouse) redirect("/inventory?error=Gudang aktif belum tersedia.");

  const params = await searchParams;
  const supabase = await createClient();
  const [products, recentSales, memberResult] = await Promise.all([
    listSaleProducts(access.organization.id, warehouse.id),
    listRecentSales(access.organization.id, access.user.id, 8),
    supabase
      .from("members")
      .select("id,member_number,full_name")
      .eq("organization_id", access.organization.id)
      .eq("status", "ACTIVE")
      .order("member_number", { ascending: true })
      .limit(250),
  ]);

  const members = memberResult.data ?? [];
  const activeProducts = products.filter(
    (product) => !product.track_stock || product.stock_qty > 0,
  );
  const successTotal = Number(params.total ?? "0");

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.mark}>KD</div>
          <div>
            <strong>POS KDKMP</strong>
            <span>{access.organization.name}</span>
          </div>
        </div>
        <div className={styles.shiftStatus}>
          <span>SHIFT OPEN</span>
          <strong>{rupiah(shift.opening_cash_amount)} kas awal</strong>
        </div>
        <nav className={styles.topNav}>
          <Link href="/reports/daily-sales">Laporan</Link>
          <Link href="/teller">Teller</Link>
          <Link href="/inventory">Inventory</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <div className={styles.content}>
        {params.status === "success" ? (
          <div className={styles.successBanner}>
            <div>
              <span>{params.duplicate ? "TRANSAKSI DUPLIKAT DICEGAH" : "TRANSAKSI BERHASIL"}</span>
              {params.sale ? (
                <Link className={styles.receiptLink} href={`/sales/${params.sale}`}>
                  {params.receipt || "Buka struk transaksi"}
                </Link>
              ) : (
                <strong>{params.receipt || "Receipt tersimpan"}</strong>
              )}
            </div>
            <strong>{rupiah(successTotal)}</strong>
          </div>
        ) : null}
        {params.error ? <div className={styles.errorBanner}>{params.error}</div> : null}

        <section className={styles.heading}>
          <div>
            <span className={styles.kicker}>PHASE 1.2 · ATOMIC POS</span>
            <h1>Kasir / Teller Penjualan</h1>
            <p>
              Mode development: pembayaran tunai. Sale, stok, pembayaran, jurnal, audit, dan idempotency diposting sebagai satu transaction batch.
            </p>
          </div>
          <div className={styles.contextCard}>
            <span>Gudang aktif</span>
            <strong>{warehouse.code} · {warehouse.name}</strong>
            <small>{activeProducts.length} produk siap dijual</small>
          </div>
        </section>

        <PosTerminal
          products={products}
          members={members}
          warehouseName={warehouse.name}
        />

        <section className={styles.recentPanel}>
          <div className={styles.recentHeader}>
            <div>
              <span className={styles.kicker}>AUDIT CEPAT</span>
              <h2>Transaksi terakhir teller ini</h2>
            </div>
            <Link href="/reports/daily-sales">Laporan Harian</Link>
          </div>
          {recentSales.length ? (
            <div className={styles.recentGrid}>
              {recentSales.map((sale) => (
                <Link className={styles.recentCard} href={`/sales/${sale.id}`} key={sale.id}>
                  <span>{sale.receipt_number}</span>
                  <strong>{rupiah(sale.total_amount)}</strong>
                  <small>{new Date(sale.sold_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} · {sale.payment_status}</small>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Belum ada penjualan pada teller ini.</div>
          )}
        </section>
      </div>
    </main>
  );
}
