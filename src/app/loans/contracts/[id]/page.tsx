import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import styles from "../contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> };
type ScheduleRow = {
  id:string;installment_number:number;due_date:string;opening_principal_amount:number;principal_amount:number;
  interest_amount:number;installment_amount:number;closing_principal_amount:number;status:string;
  paid_principal_amount:number;paid_interest_amount:number;paid_penalty_amount:number;last_payment_at:string|null;
};

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function contractLabel(status:string){
  return ({READY:"SIAP DICAIRKAN",DISBURSED:"AKTIF / SUDAH DICAIRKAN",CLOSED:"LUNAS",CANCELLED:"DIBATALKAN"} as Record<string,string>)[status]||status;
}

export default async function LoanContractDetailPage({ params, searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("LOAN_CONTRACT_VIEW")) redirect("/dashboard");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: contract, error } = await supabase.from("loan_contracts").select("*").eq("id", id).eq("organization_id", access.organization.id).maybeSingle();
  if (error || !contract) redirect("/loans/contracts?error=save");

  const [scheduleResult, memberResult, applicationResult] = await Promise.all([
    supabase.from("loan_installment_schedule").select("id,installment_number,due_date,opening_principal_amount,principal_amount,interest_amount,installment_amount,closing_principal_amount,status,paid_principal_amount,paid_interest_amount,paid_penalty_amount,last_payment_at").eq("contract_id", id).eq("organization_id", access.organization.id).order("installment_number", { ascending: true }),
    supabase.from("members").select("member_number,full_name").eq("id", contract.member_id).eq("organization_id", access.organization.id).maybeSingle(),
    supabase.from("loan_applications").select("application_number,purpose").eq("id", contract.application_id).eq("organization_id", access.organization.id).maybeSingle(),
  ]);
  const schedule = (scheduleResult.data ?? []) as ScheduleRow[];
  const member = memberResult.data;
  const application = applicationResult.data;
  const paidPrincipal=schedule.reduce((sum,row)=>sum+Number(row.paid_principal_amount||0),0);
  const paidInterest=schedule.reduce((sum,row)=>sum+Number(row.paid_interest_amount||0),0);
  const paidPenalty=schedule.reduce((sum,row)=>sum+Number(row.paid_penalty_amount||0),0);
  const outstanding=schedule.reduce((sum,row)=>sum+Math.max(0,Number(row.principal_amount)-Number(row.paid_principal_amount))+Math.max(0,Number(row.interest_amount)-Number(row.paid_interest_amount)),0);
  const paidPeriods=schedule.filter((row)=>row.status==="PAID").length;
  const canViewRepayments=access.permissions.includes("LOAN_REPAYMENT_VIEW");

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · DETAIL KONTRAK</p><h1>{contract.contract_number}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/loans/contracts">← Daftar Kontrak</Link><span>STATUS KONTRAK</span><h2>{contractLabel(contract.status)}</h2><p>{member?.member_number || "—"} · {member?.full_name || "Anggota"} · {application?.application_number || "Pengajuan"}</p>{canViewRepayments&&["DISBURSED","CLOSED"].includes(contract.status)?<Link className={styles.openLink} href="/loans/repayments">Buka registry angsuran →</Link>:null}</div><div className={styles.summaryCard}><span>SISA KEWAJIBAN</span><strong>{money(outstanding)}</strong><small>{paidPeriods}/{schedule.length} periode lunas</small></div></section>
      {query.status === "created" ? <div className={styles.success}>Kontrak dan jadwal angsuran berhasil dibentuk.</div> : null}

      <section className={styles.detailGrid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>SNAPSHOT KONTRAK</span><h3>Nilai yang dibekukan</h3></div></div><dl className={styles.definition}>
          <div><dt>Tanggal akad</dt><dd>{contract.agreement_date}</dd></div><div><dt>Jatuh tempo pertama</dt><dd>{contract.first_due_date}</dd></div>
          <div><dt>Frekuensi</dt><dd>{contract.installment_frequency}</dd></div><div><dt>Metode bunga</dt><dd>{contract.interest_method}</dd></div>
          <div><dt>Suku bunga</dt><dd>{(Number(contract.interest_rate_bps || 0) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}% / tahun</dd></div><div><dt>Bunga total</dt><dd>{money(contract.total_interest_amount)}</dd></div>
          <div><dt>Biaya admin</dt><dd>{money(contract.admin_fee_amount)}</dd></div><div><dt>Biaya provisi</dt><dd>{money(contract.provision_fee_amount)}</dd></div>
          <div className={styles.wide}><dt>Tujuan pinjaman</dt><dd>{application?.purpose || "—"}</dd></div>
        </dl></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>POSISI PINJAMAN</span><h3>Terbayar & outstanding</h3></div></div><dl className={styles.definition}>
          <div><dt>Pokok kontrak</dt><dd>{money(contract.principal_amount)}</dd></div><div><dt>Pokok terbayar</dt><dd>{money(paidPrincipal)}</dd></div>
          <div><dt>Bunga kontrak</dt><dd>{money(contract.total_interest_amount)}</dd></div><div><dt>Bunga terbayar</dt><dd>{money(paidInterest)}</dd></div>
          <div><dt>Denda terbayar</dt><dd>{money(paidPenalty)}</dd></div><div><dt>Sisa pokok+bunga</dt><dd><strong>{money(outstanding)}</strong></dd></div>
          <div><dt>Periode lunas</dt><dd>{paidPeriods}/{schedule.length}</dd></div><div><dt>Status</dt><dd>{contractLabel(contract.status)}</dd></div>
        </dl></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>JADWAL + REALISASI</span><h3>Rencana dan pembayaran per periode</h3></div><b>{schedule.length}</b></div>
        {schedule.length ? <div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Jatuh tempo</th><th>Pokok</th><th>Bunga</th><th>Terbayar</th><th>Sisa</th><th>Status</th></tr></thead><tbody>{schedule.map((row) => {const paid=Number(row.paid_principal_amount||0)+Number(row.paid_interest_amount||0);const remaining=Math.max(0,Number(row.principal_amount)-Number(row.paid_principal_amount))+Math.max(0,Number(row.interest_amount)-Number(row.paid_interest_amount));return <tr key={row.id}><td>{row.installment_number}</td><td>{row.due_date}</td><td>{money(row.principal_amount)}</td><td>{money(row.interest_amount)}</td><td><strong>{money(paid)}</strong><small>P {money(row.paid_principal_amount)} · B {money(row.paid_interest_amount)}</small></td><td>{money(remaining)}</td><td><span className={styles.badge}>{row.status}</span></td></tr>;})}</tbody></table></div> : <div className={styles.empty}><strong>Jadwal belum tersedia.</strong></div>}
      </section>

      {contract.status==="READY"?<section className={styles.successGate}><strong>Kontrak siap masuk proses pencairan.</strong><p>Pencairan dilakukan terpisah melalui workflow maker-checker-executor dan D1 idempotency.</p>{access.permissions.includes("LOAN_DISBURSEMENT_VIEW")?<Link className={styles.openLink} href="/loans/disbursements">Buka Pencairan Pinjaman →</Link>:null}</section>:null}
      {contract.status==="DISBURSED"?<section className={styles.successGate}><strong>Pinjaman aktif dan dapat menerima angsuran.</strong><p>Setiap pembayaran mengalokasikan bunga lalu pokok dari periode tertua. Sisa kewajiban saat ini {money(outstanding)}.</p>{canViewRepayments?<Link className={styles.openLink} href="/loans/repayments">Buka Angsuran Pinjaman →</Link>:null}</section>:null}
      {contract.status==="CLOSED"?<section className={styles.successGate}><strong>Kontrak telah LUNAS.</strong><p>Seluruh pokok dan bunga terjadwal telah teralokasi melalui pembayaran posted.</p></section>:null}
      <section className={styles.notice}><strong>Integritas kontrak</strong><p>Nilai kontrak dan nominal jadwal asli tetap immutable. Phase 4E-5 hanya menambahkan realisasi pembayaran dan status operasional; koreksi finansial tidak dilakukan dengan mengedit nominal jadwal lama.</p></section>
    </div>
  </section>;
}
