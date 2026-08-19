import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import styles from "../contracts.module.css";

export const dynamic="force-dynamic";
type PageProps={params:Promise<{id:string}>;searchParams:Promise<{status?:string}>};
type ScheduleRow={id:string;installment_number:number;due_date:string;opening_principal_amount:number;principal_amount:number;interest_amount:number;installment_amount:number;closing_principal_amount:number;status:string;paid_principal_amount:number;paid_interest_amount:number;paid_penalty_amount:number;last_payment_at:string|null};
function money(value:unknown){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value||0));}
function contractLabel(status:string){return({READY:"SIAP DICAIRKAN",DISBURSED:"AKTIF / SUDAH DICAIRKAN",CLOSED:"LUNAS",CANCELLED:"DIBATALKAN"}as Record<string,string>)[status]||status;}
function contractTone(status:string):"success"|"warning"|"danger"|"info"|"neutral"{if(status==="READY")return"info";if(status==="DISBURSED"||status==="CLOSED")return"success";if(status==="CANCELLED")return"danger";return"neutral";}

export default async function LoanContractDetailPage({params,searchParams}:PageProps){
  const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("LOAN_CONTRACT_VIEW"))redirect("/dashboard");
  const {id}=await params;const query=await searchParams;const supabase=await createClient();
  const {data:contract,error}=await supabase.from("loan_contracts").select("*").eq("id",id).eq("organization_id",access.organization.id).maybeSingle();if(error||!contract)redirect("/loans/contracts?error=save");
  const [scheduleResult,memberResult,applicationResult]=await Promise.all([
    supabase.from("loan_installment_schedule").select("id,installment_number,due_date,opening_principal_amount,principal_amount,interest_amount,installment_amount,closing_principal_amount,status,paid_principal_amount,paid_interest_amount,paid_penalty_amount,last_payment_at").eq("contract_id",id).eq("organization_id",access.organization.id).order("installment_number",{ascending:true}),
    supabase.from("members").select("member_number,full_name").eq("id",contract.member_id).eq("organization_id",access.organization.id).maybeSingle(),
    supabase.from("loan_applications").select("application_number,purpose").eq("id",contract.application_id).eq("organization_id",access.organization.id).maybeSingle(),
  ]);
  const schedule=(scheduleResult.data??[])as ScheduleRow[];const member=memberResult.data;const application=applicationResult.data;
  const paidPrincipal=schedule.reduce((sum,row)=>sum+Number(row.paid_principal_amount||0),0);const paidInterest=schedule.reduce((sum,row)=>sum+Number(row.paid_interest_amount||0),0);const paidPenalty=schedule.reduce((sum,row)=>sum+Number(row.paid_penalty_amount||0),0);const outstanding=schedule.reduce((sum,row)=>sum+Math.max(0,Number(row.principal_amount)-Number(row.paid_principal_amount))+Math.max(0,Number(row.interest_amount)-Number(row.paid_interest_amount)),0);const paidPeriods=schedule.filter(row=>row.status==="PAID").length;const canViewRepayments=access.permissions.includes("LOAN_REPAYMENT_VIEW");

  return <PageContainer size="full">
    <PageHeader eyebrow="Simpan Pinjam · Detail Kontrak" title={contract.contract_number} description={`${member?.member_number||"—"} · ${member?.full_name||"Anggota"} · ${application?.application_number||"Pengajuan"}`} actions={<div className={styles.actions}><Link href="/loans/contracts">← Daftar Kontrak</Link>{canViewRepayments&&["DISBURSED","CLOSED"].includes(contract.status)?<Link href="/loans/repayments">Angsuran →</Link>:null}</div>}/>
    {query.status==="created"?<Alert tone="success">Kontrak dan jadwal angsuran berhasil dibentuk.</Alert>:null}
    <section className={styles.metrics}><Card density="compact"><span>Status kontrak</span><Badge tone={contractTone(contract.status)}>{contractLabel(contract.status)}</Badge><small>{contract.agreement_date}</small></Card><Card density="compact"><span>Sisa kewajiban</span><strong>{money(outstanding)}</strong><small>pokok + bunga terjadwal</small></Card><Card density="compact"><span>Periode lunas</span><strong>{paidPeriods}/{schedule.length}</strong><small>berdasarkan alokasi posted</small></Card><Card density="compact"><span>Pokok kontrak</span><strong>{money(contract.principal_amount)}</strong><small>bunga {money(contract.total_interest_amount)}</small></Card></section>

    <section className={styles.detailGrid}><Card className={styles.panel}><div className={styles.panelHead}><div><span>SNAPSHOT KONTRAK</span><h3>Nilai yang dibekukan</h3></div><Badge tone="neutral">IMMUTABLE</Badge></div><dl className={styles.definition}><div><dt>Tanggal akad</dt><dd>{contract.agreement_date}</dd></div><div><dt>Jatuh tempo pertama</dt><dd>{contract.first_due_date}</dd></div><div><dt>Frekuensi</dt><dd>{contract.installment_frequency}</dd></div><div><dt>Metode bunga</dt><dd>{contract.interest_method}</dd></div><div><dt>Suku bunga</dt><dd>{(Number(contract.interest_rate_bps||0)/100).toLocaleString("id-ID",{maximumFractionDigits:2})}% / tahun</dd></div><div><dt>Bunga total</dt><dd>{money(contract.total_interest_amount)}</dd></div><div><dt>Biaya admin</dt><dd>{money(contract.admin_fee_amount)}</dd></div><div><dt>Biaya provisi</dt><dd>{money(contract.provision_fee_amount)}</dd></div><div className={styles.wide}><dt>Tujuan pinjaman</dt><dd>{application?.purpose||"—"}</dd></div></dl></Card>
      <Card className={styles.panel}><div className={styles.panelHead}><div><span>POSISI PINJAMAN</span><h3>Terbayar & outstanding</h3></div></div><dl className={styles.definition}><div><dt>Pokok kontrak</dt><dd>{money(contract.principal_amount)}</dd></div><div><dt>Pokok terbayar</dt><dd>{money(paidPrincipal)}</dd></div><div><dt>Bunga kontrak</dt><dd>{money(contract.total_interest_amount)}</dd></div><div><dt>Bunga terbayar</dt><dd>{money(paidInterest)}</dd></div><div><dt>Denda terbayar</dt><dd>{money(paidPenalty)}</dd></div><div><dt>Sisa pokok+bunga</dt><dd><strong>{money(outstanding)}</strong></dd></div><div><dt>Periode lunas</dt><dd>{paidPeriods}/{schedule.length}</dd></div><div><dt>Status</dt><dd>{contractLabel(contract.status)}</dd></div></dl></Card></section>

    <Card className={styles.panel}><div className={styles.panelHead}><div><span>JADWAL + REALISASI</span><h3>Rencana dan pembayaran per periode</h3></div><Badge>{schedule.length}</Badge></div>{schedule.length?<div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Jatuh tempo</th><th>Pokok</th><th>Bunga</th><th>Terbayar</th><th>Sisa</th><th>Status</th></tr></thead><tbody>{schedule.map(row=>{const paid=Number(row.paid_principal_amount||0)+Number(row.paid_interest_amount||0);const remaining=Math.max(0,Number(row.principal_amount)-Number(row.paid_principal_amount))+Math.max(0,Number(row.interest_amount)-Number(row.paid_interest_amount));return <tr key={row.id}><td>{row.installment_number}</td><td>{row.due_date}</td><td>{money(row.principal_amount)}</td><td>{money(row.interest_amount)}</td><td><strong>{money(paid)}</strong><small>P {money(row.paid_principal_amount)} · B {money(row.paid_interest_amount)}</small></td><td>{money(remaining)}</td><td><Badge tone={row.status==="PAID"?"success":"neutral"}>{row.status}</Badge></td></tr>;})}</tbody></table></div>:<div className={styles.empty}><strong>Jadwal belum tersedia.</strong></div>}</Card>

    {contract.status==="READY"?<Alert tone="info" title="Siap masuk pencairan">Pencairan dilakukan melalui workflow maker-checker-executor dan D1 idempotency. {access.permissions.includes("LOAN_DISBURSEMENT_VIEW")?<Link href="/loans/disbursements">Buka Pencairan Pinjaman →</Link>:null}</Alert>:null}
    {contract.status==="DISBURSED"?<Alert tone="success" title="Pinjaman aktif">Setiap pembayaran mengalokasikan bunga lalu pokok dari periode tertua. Sisa kewajiban saat ini {money(outstanding)}. {canViewRepayments?<Link href="/loans/repayments">Buka Angsuran Pinjaman →</Link>:null}</Alert>:null}
    {contract.status==="CLOSED"?<Alert tone="success" title="Kontrak lunas">Seluruh pokok dan bunga terjadwal telah teralokasi melalui pembayaran posted.</Alert>:null}
    <Alert tone="info" title="Integritas kontrak">Nilai kontrak dan nominal jadwal asli tetap immutable. Realisasi pembayaran dan status operasional ditambahkan oleh workflow repayment; koreksi finansial tidak dilakukan dengan mengedit jadwal lama.</Alert>
  </PageContainer>;
}
