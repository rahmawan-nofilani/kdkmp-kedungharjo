import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import styles from "../contracts.module.css";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> };
type ScheduleRow = { id: string; installment_number: number; due_date: string; opening_principal_amount: number; principal_amount: number; interest_amount: number; installment_amount: number; closing_principal_amount: number; status: string };

function money(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
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
    supabase.from("loan_installment_schedule").select("id,installment_number,due_date,opening_principal_amount,principal_amount,interest_amount,installment_amount,closing_principal_amount,status").eq("contract_id", id).eq("organization_id", access.organization.id).order("installment_number", { ascending: true }),
    supabase.from("members").select("member_number,full_name").eq("id", contract.member_id).eq("organization_id", access.organization.id).maybeSingle(),
    supabase.from("loan_applications").select("application_number,purpose").eq("id", contract.application_id).eq("organization_id", access.organization.id).maybeSingle(),
  ]);
  const schedule = (scheduleResult.data ?? []) as ScheduleRow[];
  const member = memberResult.data;
  const application = applicationResult.data;

  return <section className="workspace">
    <header className="workspace-header"><div><p className="workspace-kicker">SIMPAN PINJAM · DETAIL KONTRAK</p><h1>{contract.contract_number}</h1></div></header>
    <div className={`workspace-content ${styles.content}`}>
      <section className={styles.detailHero}><div><Link href="/loans/contracts">← Daftar Kontrak</Link><span>STATUS KONTRAK</span><h2>{contract.status === "READY" ? "SIAP DICAIRKAN" : contract.status}</h2><p>{member?.member_number || "—"} · {member?.full_name || "Anggota"} · {application?.application_number || "Pengajuan"}</p></div><div className={styles.summaryCard}><span>POKOK</span><strong>{money(contract.principal_amount)}</strong><small>{contract.tenor_months} bulan</small></div></section>
      {query.status === "created" ? <div className={styles.success}>Kontrak dan jadwal angsuran berhasil dibentuk. Belum ada pencairan dana.</div> : null}

      <section className={styles.detailGrid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>SNAPSHOT KONTRAK</span><h3>Nilai yang dibekukan</h3></div></div><dl className={styles.definition}>
          <div><dt>Tanggal akad</dt><dd>{contract.agreement_date}</dd></div><div><dt>Jatuh tempo pertama</dt><dd>{contract.first_due_date}</dd></div>
          <div><dt>Frekuensi</dt><dd>{contract.installment_frequency}</dd></div><div><dt>Metode bunga</dt><dd>{contract.interest_method}</dd></div>
          <div><dt>Suku bunga</dt><dd>{(Number(contract.interest_rate_bps || 0) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}% / tahun</dd></div><div><dt>Bunga total</dt><dd>{money(contract.total_interest_amount)}</dd></div>
          <div><dt>Biaya admin</dt><dd>{money(contract.admin_fee_amount)}</dd></div><div><dt>Biaya provisi</dt><dd>{money(contract.provision_fee_amount)}</dd></div>
          <div className={styles.wide}><dt>Tujuan pinjaman</dt><dd>{application?.purpose || "—"}</dd></div>
        </dl></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><span>TOTAL KEWAJIBAN</span><h3>Ringkasan jadwal</h3></div></div><dl className={styles.definition}>
          <div><dt>Pokok</dt><dd>{money(contract.principal_amount)}</dd></div><div><dt>Bunga</dt><dd>{money(contract.total_interest_amount)}</dd></div>
          <div><dt>Total angsuran</dt><dd>{money(contract.total_installment_amount)}</dd></div><div><dt>Jumlah periode</dt><dd>{schedule.length}</dd></div>
          <div><dt>Biaya awal</dt><dd>{money(Number(contract.admin_fee_amount || 0) + Number(contract.provision_fee_amount || 0))}</dd></div><div><dt>Pencairan</dt><dd>BELUM</dd></div>
        </dl></article>
      </section>

      <section className={styles.panel}><div className={styles.panelHead}><div><span>JADWAL IMMUTABLE</span><h3>Rencana angsuran per periode</h3></div><b>{schedule.length}</b></div>
        {schedule.length ? <div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Jatuh tempo</th><th>Saldo awal</th><th>Pokok</th><th>Bunga</th><th>Angsuran</th><th>Saldo akhir</th></tr></thead><tbody>{schedule.map((row) => <tr key={row.id}><td>{row.installment_number}</td><td>{row.due_date}</td><td>{money(row.opening_principal_amount)}</td><td>{money(row.principal_amount)}</td><td>{money(row.interest_amount)}</td><td><strong>{money(row.installment_amount)}</strong></td><td>{money(row.closing_principal_amount)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><strong>Jadwal belum tersedia.</strong></div>}
      </section>

      <section className={styles.successGate}><strong>Kontrak belum menimbulkan pergerakan uang.</strong><p>Phase 4E-4 berikutnya akan menangani pencairan secara terpisah dan idempotent. Sampai saat itu status kontrak tetap READY.</p></section>
      <section className={styles.notice}><strong>Integritas 4E-3</strong><p>Nilai kontrak dan jadwal berasal dari snapshot pengajuan yang sudah disetujui. Registry ini dirancang append-only/immutable; koreksi finansial tidak dilakukan dengan mengedit jadwal lama.</p></section>
    </div>
  </section>;
}
