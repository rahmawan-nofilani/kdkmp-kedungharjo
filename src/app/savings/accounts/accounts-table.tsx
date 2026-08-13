import { PendingSubmitButton } from "@/components/pending-submit-button";
import { approveSavingsAccountAction, rejectSavingsAccountAction } from "./actions";
import styles from "./accounts.module.css";

export type SavingsAccountRow={id:string;account_number:string;member_id:string;status:string;rule_snapshot:Record<string,unknown>;opened_by:string;opened_at:string;rejection_reason:string|null};
type MemberRow={id:string;member_number:string;full_name:string};
function money(value:unknown){return `Rp${Number(value||0).toLocaleString("id-ID")}`;}
function when(value:string){return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"});}
function badge(status:string){return `${styles.badge} ${status==="ACTIVE"?styles.active:status==="PENDING"?styles.pending:status==="REJECTED"?styles.rejected:""}`;}

export function SavingsAccountsTable({accounts,members,userId,canApprove}:{accounts:SavingsAccountRow[];members:MemberRow[];userId:string;canApprove:boolean}){
  const memberMap=new Map(members.map(m=>[m.id,m]));
  return <div className={styles.tableWrap}><table><thead><tr><th>Rekening</th><th>Anggota</th><th>Produk / versi</th><th>Status</th><th>Dibuka</th><th>Kontrol</th></tr></thead><tbody>{accounts.map(row=>{
    const member=memberMap.get(row.member_id);const snapshot=row.rule_snapshot||{};const own=row.opened_by===userId;
    const productName=String(snapshot.display_name||snapshot.product_code||"Produk Simpanan");const version=String(snapshot.captured_version||snapshot.version||"—");
    return <tr key={row.id}>
      <td><strong>{row.account_number}</strong><small>ID {row.id.slice(0,8)}</small></td>
      <td>{member?<><strong>{member.full_name}</strong><small>{member.member_number}</small></>:<><strong>Identitas dibatasi</strong><small>Hak MEMBER_VIEW diperlukan</small></>}</td>
      <td><strong>{productName}</strong><small>Versi {version} · saldo minimum {money(snapshot.min_balance_amount)}</small></td>
      <td><span className={badge(row.status)}>{row.status}</span>{row.status==="REJECTED"&&row.rejection_reason?<small>{row.rejection_reason}</small>:null}</td>
      <td>{when(row.opened_at)}<small>{own?"dibuka oleh Anda":"dibuka user lain"}</small></td>
      <td>{row.status==="PENDING"?canApprove&&!own?<div className={styles.actions}>
        <form action={approveSavingsAccountAction}><input type="hidden" name="account_id" value={row.id}/><PendingSubmitButton pendingLabel="Mengaktifkan…">Periksa & Aktifkan</PendingSubmitButton></form>
        <form action={rejectSavingsAccountAction} className={styles.reject}><input type="hidden" name="account_id" value={row.id}/><input name="rejection_reason" required minLength={5} maxLength={300} placeholder="Alasan penolakan"/><PendingSubmitButton pendingLabel="Menolak…">Tolak</PendingSubmitButton></form>
      </div>:<span className={styles.wait}>Menunggu user lain</span>:row.status==="ACTIVE"?<span className={styles.safe}>Belum ada transaksi uang</span>:"—"}</td>
    </tr>;
  })}</tbody></table></div>;
}
