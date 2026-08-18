import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getMonthClosingReadiness } from "@/lib/d1/assets";
import styles from "./closing.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ month?:string }> };
function currentWibMonth(){ return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,7); }

export default async function ClosingReadinessPage({ searchParams }:Props) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("FINANCE_VIEW")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.assetDepreciation) redirect("/setup/database");
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month||"") ? String(params.month) : currentWibMonth();
  const readiness = await getMonthClosingReadiness(access.organization.id,month);

  return <main className={styles.page}>
    <header className={styles.topbar}><div><p>KEUANGAN · KONTROL BULANAN</p><h1>Kesiapan Tutup Buku</h1></div><nav><Link href="/finance/assets">Aset</Link><Link href="/finance/treasury">Kas & Bank</Link><Link href="/finance/journals">Jurnal</Link><Link href="/finance">Keuangan</Link></nav></header>
    <div className={styles.content}>
      <section className={styles.hero}><div><span>CHECKLIST OTOMATIS</span><h2>{readiness.ready ? "Bulan ini siap menuju proses tutup buku." : "Masih ada pekerjaan yang perlu diselesaikan sebelum tutup buku."}</h2><p>Tutup buku berarti menghentikan perubahan transaksi pada periode yang sudah selesai. Sistem mengecek hal-hal penting lebih dulu agar laporan tidak ditutup dalam kondisi belum lengkap.</p></div><div className={readiness.ready?styles.readyCard:styles.checkCard}><span>Status</span><strong>{readiness.ready?"SIAP":"PERLU DICEK"}</strong><small>Periode {month} · status periode {readiness.periodStatus}</small></div></section>

      <section className={styles.filter}><form method="get"><label>Bulan yang dicek<input type="month" name="month" defaultValue={month}/></label><button type="submit">Cek Bulan</button></form><div><span>Rentang</span><strong>{readiness.bounds.start} → {readiness.bounds.end}</strong></div></section>

      <section className={styles.checks}>{readiness.checks.map((check,index)=><article key={check.key} className={check.passed?styles.pass:styles.fail}><div className={styles.number}>{index+1}</div><div><span>{check.passed?"SELESAI":"PERLU TINDAKAN"}</span><h3>{check.label}</h3><p>{check.detail}</p></div><strong>{check.passed?"✓":"!"}</strong></article>)}</section>

      {readiness.invoiceAttention>0?<section className={styles.warning}><strong>Perhatian tambahan: Invoice Supplier</strong><p>Ada {readiness.invoiceAttention} invoice hingga akhir bulan yang masih DRAFT/MISMATCH/MATCHED. Ini belum menjadi pemblokir otomatis tutup buku, tetapi sebaiknya diperiksa agar hutang supplier tidak tertinggal.</p><Link href="/procurement/ap">Buka Hutang Supplier →</Link></section>:null}

      <section className={styles.actions}>
        <article><span>Jurnal belum selesai?</span><p>Selesaikan DRAFT/SUBMITTED atau batalkan jika memang tidak digunakan.</p><Link href="/finance/journals">Buka Jurnal →</Link></article>
        <article><span>Bank belum cocok?</span><p>Lakukan pencocokan saldo sistem dengan rekening koran.</p><Link href="/finance/treasury">Buka Kas & Bank →</Link></article>
        <article><span>Penyusutan belum selesai?</span><p>Hitung lalu minta user berbeda memeriksa dan mencatat penyusutan.</p><Link href="/finance/assets">Buka Aset →</Link></article>
      </section>

      <section className={styles.notice}><strong>Jangan LOCK periode hanya untuk mencoba tombol.</strong><p>LOCK bersifat final. Untuk UAT, gunakan hanya periode dan data sintetis yang memang dipersiapkan. Pada operasional production, CLOSE/LOCK dilakukan hanya setelah checklist SIAP, rekonsiliasi selesai, dan user berbeda menjalankan kontrol pembuat–pemeriksa dari menu Kas & Bank.</p></section>
    </div>
  </main>;
}
