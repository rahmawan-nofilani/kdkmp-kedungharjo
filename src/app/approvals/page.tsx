import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getApprovalQueue } from "@/lib/d1/approval-center";
import styles from "./approvals.module.css";

export const dynamic = "force-dynamic";

function rupiah(value:number|null) {
  if (value===null) return "—";
  return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value);
}
function waktu(value:string) {
  return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"});
}
function categoryLabel(category:string) {
  return ({PEMBELIAN:"Pembelian",HUTANG_SUPPLIER:"Hutang Supplier",JURNAL:"Jurnal",ASET:"Aset Tetap",PENYUSUTAN:"Penyusutan",STOCK_OPNAME:"Hitung Stok"} as Record<string,string>)[category]||category;
}

export default async function ApprovalCenterPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const allowed = new Set(access.permissions);
  const canOpen = ["APPROVAL_VIEW","PURCHASE_APPROVE","INVOICE_APPROVE","JOURNAL_APPROVE","ASSET_APPROVE"].some((code)=>allowed.has(code));
  if (!canOpen) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.assetDepreciation) redirect("/setup/database");
  const queue = await getApprovalQueue(access.organization.id);
  const mine = queue.filter((item)=>item.createdBy===access.user.id).length;
  const reviewable = queue.length-mine;
  const categories = new Map<string,number>();
  for (const item of queue) categories.set(item.category,(categories.get(item.category)||0)+1);

  return <main className={styles.page}>
    <header className={styles.topbar}><div><p>KONTROL · PERSETUJUAN</p><h1>Pusat Persetujuan</h1></div><nav><Link href="/dashboard">Dashboard</Link></nav></header>
    <div className={styles.content}>
      <section className={styles.hero}>
        <div><span>ANTRIAN PEMERIKSAAN</span><h2>Satu tempat untuk melihat pekerjaan yang menunggu pemeriksaan.</h2><p>Pusat ini tidak menyetujui transaksi secara otomatis. Klik item untuk membuka sumbernya, periksa detail, lalu putuskan dari halaman asal. Aturan Pembuat–Pemeriksa tetap berlaku.</p></div>
        <div className={styles.role}><span>Role aktif</span><strong>{access.role.name}</strong><small>{access.organization.name}</small></div>
      </section>

      <section className={styles.metrics}>
        <article><span>Total menunggu</span><strong>{queue.length}</strong><small>semua kategori</small></article>
        <article className={reviewable?styles.attention:undefined}><span>Bisa Anda periksa</span><strong>{reviewable}</strong><small>dibuat user lain</small></article>
        <article><span>Dibuat oleh Anda</span><strong>{mine}</strong><small>harus diperiksa user lain</small></article>
        <article><span>Jenis pekerjaan</span><strong>{categories.size}</strong><small>kategori aktif</small></article>
      </section>

      {categories.size ? <section className={styles.categoryStrip}>{Array.from(categories.entries()).map(([category,count])=><div key={category}><span>{categoryLabel(category)}</span><strong>{count}</strong></div>)}</section> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>MENUNGGU TINDAKAN</span><h3>Antrian persetujuan</h3></div><b>{queue.length}</b></div>
        {queue.length ? <div className={styles.queue}>{queue.map((item)=>{
          const own = item.createdBy===access.user.id;
          return <article key={item.key} className={own?styles.own:styles.reviewable}>
            <div className={styles.queueTop}><span>{categoryLabel(item.category)}</span><b>{own?"MENUNGGU PEMERIKSA LAIN":"SIAP DIPERIKSA"}</b></div>
            <h4>{item.reference}</h4><strong>{item.title}</strong><p>{item.detail}</p>
            <div className={styles.queueMeta}><span>{rupiah(item.amount)}</span><span>{waktu(item.createdAt)}</span></div>
            <Link href={item.href}>{own?"Lihat status →":"Buka & Periksa →"}</Link>
          </article>;
        })}</div> : <div className={styles.empty}><strong>Tidak ada antrian.</strong><p>Semua proses yang membutuhkan pemeriksaan sudah selesai atau belum ada yang disubmit.</p></div>}
      </section>

      <section className={styles.notice}><strong>Kenapa keputusan tetap dilakukan di halaman asal?</strong><p>Supaya pemeriksa melihat informasi lengkap sebelum menyetujui. Contohnya invoice tetap diperiksa bersama PO dan penerimaan barang; jurnal tetap diperiksa bersama debit/kredit; aset tetap diperiksa bersama nilai dan masa manfaat.</p></section>
    </div>
  </main>;
}
