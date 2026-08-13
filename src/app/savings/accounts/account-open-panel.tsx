import { PendingSubmitButton } from "@/components/pending-submit-button";
import { openSavingsAccountAction } from "./actions";
import styles from "./accounts.module.css";

type MemberChoice={id:string;member_number:string;full_name:string};
type ProductChoice={productId:string;code:string;displayName:string;version:number};

export function SavingsAccountOpenPanel({members,products}:{members:MemberChoice[];products:ProductChoice[]}){
  return <details className={styles.openBox}>
    <summary>+ Buka Rekening</summary>
    <form action={openSavingsAccountAction}>
      <label>Anggota ACTIVE
        <select name="member_id" required defaultValue=""><option value="" disabled>Pilih anggota</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_number} · {m.full_name}</option>)}</select>
      </label>
      <label>Produk ACTIVE
        <select name="product_id" required defaultValue=""><option value="" disabled>Pilih produk</option>{products.map(p=><option key={p.productId} value={p.productId}>{p.code} · {p.displayName} · v{p.version}</option>)}</select>
      </label>
      <p>Rekening dibuat sebagai <b>PENDING</b> dan harus diperiksa user lain sebelum ACTIVE.</p>
      <PendingSubmitButton pendingLabel="Membuka…" disabled={!members.length||!products.length}>Buka Rekening PENDING</PendingSubmitButton>
    </form>
  </details>;
}
