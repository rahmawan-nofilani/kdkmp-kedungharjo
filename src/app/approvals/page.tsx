import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { getApprovalQueue, type ApprovalQueueItem } from "@/lib/d1/approval-center";
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
  return ({PEMBELIAN:"Pembelian",HUTANG_SUPPLIER:"Hutang Pemasok",JURNAL:"Jurnal",ASET:"Aset Tetap",PENYUSUTAN:"Penyusutan",STOCK_OPNAME:"Hitung Stok"} as Record<string,string>)[category]||category;
}

function canReviewCategory(category: ApprovalQueueItem["category"], permissions: Set<string>) {
  if (permissions.has("APPROVAL_VIEW")) return true;
  if (category === "PEMBELIAN") return permissions.has("PURCHASE_APPROVE");
  if (category === "HUTANG_SUPPLIER") return permissions.has("INVOICE_APPROVE");
  if (category === "JURNAL") return permissions.has("JOURNAL_APPROVE");
  if (category === "ASET" || category === "PENYUSUTAN") return permissions.has("ASSET_APPROVE");
  if (category === "STOCK_OPNAME") return permissions.has("ORG_MANAGE");
  return false;
}

export default async function ApprovalCenterPage() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  const allowed = new Set(access.permissions);
  const canOpen = ["APPROVAL_VIEW","PURCHASE_APPROVE","INVOICE_APPROVE","JOURNAL_APPROVE","ASSET_APPROVE","ORG_MANAGE"].some((code)=>allowed.has(code));
  if (!canOpen) redirect("/dashboard");

  const schema = await getD1SchemaStatus();
  if (!schema.features.assetDepreciation) redirect("/setup/database");

  const allQueue = await getApprovalQueue(access.organization.id);
  const queue = allQueue.filter((item)=>canReviewCategory(item.category,allowed));
  const mine = queue.filter((item)=>item.createdBy===access.user.id).length;
  const reviewable = queue.filter((item)=>item.createdBy!==access.user.id).length;
  const categories = new Map<string,number>();
  for (const item of queue) categories.set(item.category,(categories.get(item.category)||0)+1);

  return <main className={styles.page}>
    <header className={styles.topbar}><div><p>KONTROL · PEMERIKSAAN</p><h1>Pusat Persetujuan</h1></div><nav><Link href="/dashboard">Dashboard</Link></nav></header>
    <div className={styles.content}>
      <section className={styles.hero}>
        <div><span>PEKERJAAN YANG MENUNGGU PEMERIKSAAN</span><h2>Lihat apa yang perlu diperiksa, lalu buka detail sebelum memberi keputusan.</h2><p>Halaman ini hanya menjadi pusat antrian. Persetujuan tetap dilakukan di halaman asal agar data lengkap terlihat terlebih dahulu. Orang yang membuat transaksi tidak boleh menyetujui transaksi miliknya sendiri.</p></div>
        <div className={styles.role}><span>Role aktif</span><strong>{access.role.name}</strong><small>{access.organization.name}</small></div>
      </section>

      <section className={styles.metrics}>
        <article><span>Total menunggu</span><strong>{queue.length}</strong><small>sesuai hak akses Anda</small></article>
        <article className={reviewable?styles.attention:undefined}><span>Siap Anda periksa</span><strong>{reviewable}</strong><small>dibuat pengguna lain</small></article>
        <article><span>Dibuat oleh Anda</span><strong>{mine}</strong><small>harus diperiksa orang lain</small></article>
        <article><span>Jenis pekerjaan</span><strong>{categories.size}</strong><small>kategori yang tampil</small></article>
      </section>

      {categories.size ? <section className={styles.categoryStrip}>{Array.from(categories.entries()).map(([category,count])=><div key={category}><span>{categoryLabel(category)}</span><strong>{count}</strong></div>)}</section> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>ANTRIAN PEMERIKSAAN</span><h3>Yang perlu ditindaklanjuti</h3></div><b>{queue.length}</b></div>
        {queue.length ? <div className={styles.queue}>{queue.map((item)=>{
          const own = item.createdBy===access.user.id;
          return <article key={item.key} className={own?styles.own:styles.reviewable}>
            <div className={styles.queueTop}><span>{categoryLabel(item.category)}</span><b>{own?"MENUNGGU ORANG LAIN":"SIAP DIPERIKSA"}</b></div>
            <h4>{item.reference}</h4><strong>{item.title}</strong><p>{item.detail}</p>
            <div className={styles.queueMeta}><span>{rupiah(item.amount)}</span><span>{waktu(item.createdAt)}</span></div>
            <Link href={item.href}>{own?"Lihat status →":"Buka detail & periksa →"}</Link>
          </article>;
        })}</div> : <div className={styles.empty}><strong>Tidak ada pekerjaan yang menunggu.</strong><p>Semua proses yang menjadi kewenangan Anda sudah selesai atau belum ada yang dikirim untuk diperiksa.</p></div>}
      </section>

      <section className={styles.notice}><strong>Kenapa tidak ada tombol “Setujui Semua”?</strong><p>Karena setiap keputusan perlu konteks. Invoice harus dilihat bersama PO dan barang diterima; jurnal harus dilihat bersama debit-kredit; aset harus dilihat bersama harga, masa manfaat, dan akun pembukuannya.</p></section>
    </div>
  </main>;
}
