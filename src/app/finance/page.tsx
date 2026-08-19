import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/ui/page-layout";
import { ApprovalIcon,AssetIcon,BankIcon,JournalIcon,ReconcileIcon,SettingsIcon } from "@/components/ui/icons";
import { getAccessContext } from "@/lib/access/context";
import { accountingPeriod,buildFinancialReadModel,foundationAccountName,getAccountingIntegrity,getTrialBalance,listJournalSummaries,listLedgerLines } from "@/lib/d1/accounting";
import { listAccounts } from "@/lib/d1/accounting-config";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { listTreasuryAccounts } from "@/lib/d1/treasury";
import styles from "./finance.module.css";

export const dynamic = "force-dynamic";
type PageProps={searchParams:Promise<{from?:string;to?:string;account?:string}>};
function wibToday(){const shifted=new Date(Date.now()+7*60*60*1000);return shifted.toISOString().slice(0,10)}
function monthStart(date:string){return `${date.slice(0,7)}-01`}
function rupiah(value:number){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value)}
function dateTime(value:string|null){if(!value)return"—";return new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"short",timeStyle:"short"})}

export default async function FinancePage({searchParams}:PageProps){
 const access=await getAccessContext();if(!access)redirect("/login");if(!access.permissions.includes("FINANCE_VIEW"))redirect("/dashboard");
 const schema=await getD1SchemaStatus();if(!schema.initialized)redirect("/setup/database");
 const params=await searchParams;const today=wibToday();const requestedFrom=params.from||monthStart(today);const requestedTo=params.to||today;let period;try{period=accountingPeriod(requestedFrom,requestedTo)}catch{period=accountingPeriod(monthStart(today),today)}
 const account=params.account?.trim()||null;const accountingConfigReady=schema.features.accountingConfig;const accountingRuntimeReady=schema.features.accountingRuntime;const procurementAccountingReady=schema.features.procurementAccounting;const treasuryReady=schema.features.treasuryPeriod;
 const [trialBalance,integrity,journals,ledger,accounts,treasuryAccounts]=await Promise.all([getTrialBalance(access.organization.id,period),getAccountingIntegrity(access.organization.id,period),listJournalSummaries(access.organization.id,period,120),listLedgerLines(access.organization.id,period,account,300),accountingConfigReady?listAccounts(access.organization.id):Promise.resolve([]),treasuryReady?listTreasuryAccounts(access.organization.id):Promise.resolve([])]);
 const accountNames=new Map(accounts.map(item=>[item.code,item.name]));const accountName=(code:string)=>accountNames.get(code)||foundationAccountName(code);const model=buildFinancialReadModel(trialBalance);const totalTrialDebit=trialBalance.reduce((sum,row)=>sum+row.debit_amount,0);const totalTrialCredit=trialBalance.reduce((sum,row)=>sum+row.credit_amount,0);const canConfigure=access.permissions.includes("ACCOUNTING_MANAGE")||access.permissions.includes("ACCOUNTING_APPROVE");
 const treasuryCash=treasuryReady?treasuryAccounts.filter(row=>row.status==="ACTIVE"&&row.account_type==="CASH").reduce((sum,row)=>sum+row.balance_amount,0):model.cash;const treasuryBank=treasuryReady?treasuryAccounts.filter(row=>row.status==="ACTIVE"&&row.account_type==="BANK").reduce((sum,row)=>sum+row.balance_amount,0):model.bank;

 return <PageContainer size="full">
  <PageHeader eyebrow="Keuangan" title="Ringkasan Keuangan" description="Pantau kas, bank, pendapatan, pengeluaran, dan hasil usaha pada periode yang dipilih."/>

  {!procurementAccountingReady?<Alert tone="warning" title="Pencatatan pembelian belum lengkap">Sebagian transaksi pembelian terbaru belum dapat masuk ke laporan keuangan. <Link href="/setup/database">Periksa pengaturan database</Link>.</Alert>:null}
  {procurementAccountingReady&&!accountingConfigReady?<Alert tone="warning" title="Pengaturan akun belum lengkap">Daftar akun dan pemetaan transaksi perlu dilengkapi sebelum operasional nyata.</Alert>:null}
  {accountingConfigReady&&!accountingRuntimeReady?<Alert tone="warning" title="Pemetaan transaksi belum aktif">Pengaturan akuntansi sudah tersedia tetapi belum seluruhnya aktif.</Alert>:null}
  {accountingRuntimeReady&&!treasuryReady?<Alert tone="warning" title="Kas & Bank belum aktif">Aktifkan pengelolaan Kas & Bank sebelum operasional nyata.</Alert>:null}

  <nav className={styles.financeNav} aria-label="Menu keuangan">
   {treasuryReady?<Link href="/finance/treasury"><span><BankIcon size={19}/></span><div><strong>Kas & Bank</strong><small>Saldo dan mutasi</small></div></Link>:null}
   <Link href="/finance/journals"><span><JournalIcon size={19}/></span><div><strong>Jurnal</strong><small>Pencatatan transaksi</small></div></Link>
   <Link href="/finance/assets"><span><AssetIcon size={19}/></span><div><strong>Aset Tetap</strong><small>Aset & penyusutan</small></div></Link>
   <Link href="/finance/closing-readiness"><span><ApprovalIcon size={19}/></span><div><strong>Tutup Buku</strong><small>Kesiapan periode</small></div></Link>
   {accountingConfigReady&&canConfigure?<Link href="/finance/settings"><span><SettingsIcon size={19}/></span><div><strong>Pengaturan</strong><small>Akun & pemetaan</small></div></Link>:null}
  </nav>

  <Card className={styles.filterPanel}>
   <form method="get" className={styles.filterForm}><label>Dari<input type="date" name="from" defaultValue={period.from}/></label><label>Sampai<input type="date" name="to" defaultValue={period.to}/></label>{account?<input type="hidden" name="account" value={account}/>:null}<button type="submit">Tampilkan</button>{account?<Link href={`/finance?from=${period.from}&to=${period.to}`}>Semua Akun</Link>:null}</form>
   <div className={styles.periodCopy}><span>Periode</span><strong>{period.from} – {period.to}</strong></div>
  </Card>

  <section className={styles.metrics}>
   <Card density="compact"><span>Kas & Bank</span><strong>{rupiah(treasuryCash+treasuryBank)}</strong><small>Kas {rupiah(treasuryCash)} · Bank {rupiah(treasuryBank)}</small></Card>
   <Card density="compact"><span>Pendapatan</span><strong>{rupiah(model.revenue)}</strong><small>periode terpilih</small></Card>
   <Card density="compact"><span>Pengeluaran</span><strong>{rupiah(model.expenses)}</strong><small>beban & HPP</small></Card>
   <Card density="compact" className={model.netIncome>=0?styles.goodMetric:styles.alertMetric}><span>Laba / Rugi</span><strong>{rupiah(model.netIncome)}</strong><small>Pendapatan − Pengeluaran</small></Card>
  </section>

  <section className={styles.twoColumn}>
   <Card className={styles.panel}><div className={styles.panelHeader}><div><span className={styles.kicker}>Hasil Usaha</span><h3>Ringkasan Laba Rugi</h3></div></div><div className={styles.statementRows}><div><span>Pendapatan</span><strong>{rupiah(model.revenue)}</strong></div><div><span>Beban / HPP</span><strong>{rupiah(model.expenses)}</strong></div><div className={styles.statementTotal}><span>Laba / (Rugi)</span><strong>{rupiah(model.netIncome)}</strong></div></div></Card>
   <Card className={styles.panel}><div className={styles.panelHeader}><div><span className={styles.kicker}>Posisi Keuangan</span><h3>Ringkasan Neraca</h3></div><Badge tone={model.equationGap===0?"success":"warning"}>{model.equationGap===0?"Seimbang":"Perlu Diperiksa"}</Badge></div><div className={styles.statementRows}><div><span>Aset</span><strong>{rupiah(model.assets)}</strong></div><div><span>Kewajiban</span><strong>{rupiah(model.liabilities)}</strong></div><div><span>Ekuitas + Hasil Berjalan</span><strong>{rupiah(model.equity+model.netIncome)}</strong></div></div>{model.equationGap!==0?<p className={styles.note}>Terdapat selisih {rupiah(model.equationGap)} yang perlu diperiksa.</p>:null}</Card>
  </section>

  <section className={styles.metricsSecondary}>
   <Card density="compact"><span>Persediaan</span><strong>{rupiah(model.inventory)}</strong></Card>
   <Card density="compact"><span>Hutang Pemasok</span><strong>{rupiah(model.accountsPayable)}</strong></Card>
   <Card density="compact"><span>Barang Diterima Belum Ditagih</span><strong>{rupiah(model.grni)}</strong></Card>
   <Card density="compact" className={integrity.passed?styles.goodMetric:styles.alertMetric}><span>Status Jurnal</span><strong>{integrity.passed?"Baik":"Perlu Diperiksa"}</strong><small>{integrity.entryCount} jurnal · {integrity.exceptions.length} pengecualian</small></Card>
  </section>

  <details className={styles.advanced} open={Boolean(account)}><summary><span><ReconcileIcon size={18}/> Neraca Saldo</span><small>{trialBalance.length} akun</small></summary><div className={styles.advancedBody}>{trialBalance.length?<div className={styles.tableWrap}><table><thead><tr><th>Akun</th><th>Debit</th><th>Kredit</th><th>Saldo D−K</th><th></th></tr></thead><tbody>{trialBalance.map(row=><tr key={row.account_code}><td><strong>{row.account_code}</strong><span>{accountName(row.account_code)}</span></td><td>{rupiah(row.debit_amount)}</td><td>{rupiah(row.credit_amount)}</td><td><strong>{rupiah(row.balance_amount)}</strong></td><td><Link href={`/finance?from=${period.from}&to=${period.to}&account=${encodeURIComponent(row.account_code)}`}>Lihat Buku Besar</Link></td></tr>)}</tbody><tfoot><tr><th>Total</th><th>{rupiah(totalTrialDebit)}</th><th>{rupiah(totalTrialCredit)}</th><th>{rupiah(totalTrialDebit-totalTrialCredit)}</th><th></th></tr></tfoot></table></div>:<div className={styles.empty}>Belum ada jurnal pada periode ini.</div>}</div></details>

  <details className={styles.advanced} open={Boolean(account)}><summary><span><JournalIcon size={18}/> Buku Besar</span><small>{account?`${account} · ${accountName(account)}`:`${ledger.length} baris terbaru`}</small></summary><div className={styles.advancedBody}>{ledger.length?<div className={styles.tableWrap}><table><thead><tr><th>Waktu / Jurnal</th><th>Akun</th><th>Sumber</th><th>Debit</th><th>Kredit</th><th>Memo</th></tr></thead><tbody>{ledger.map((line,index)=><tr key={`${line.journal_entry_id}-${line.account_code}-${index}`}><td><strong>{line.entry_number}</strong><span>{dateTime(line.posted_at||line.created_at)}</span></td><td><strong>{line.account_code}</strong><span>{accountName(line.account_code)}</span></td><td><strong>{line.source_type}</strong><span>{line.description}</span></td><td>{line.debit_amount?rupiah(line.debit_amount):"—"}</td><td>{line.credit_amount?rupiah(line.credit_amount):"—"}</td><td>{line.memo||"—"}</td></tr>)}</tbody></table></div>:<div className={styles.empty}>Tidak ada buku besar pada filter ini.</div>}</div></details>

  <details className={styles.advanced}><summary><span><ApprovalIcon size={18}/> Kontrol Jurnal</span><small>{integrity.passed?"Tidak ada selisih":`${integrity.exceptions.length} perlu diperiksa`}</small></summary><div className={styles.advancedBody}>{!integrity.passed&&integrity.exceptions.length?<div className={styles.exceptionList}>{integrity.exceptions.map(journal=><div key={journal.id}><strong>{journal.entry_number}</strong><span>{journal.source_type} · Dr {rupiah(journal.debit_amount)} · Cr {rupiah(journal.credit_amount)} · {journal.line_count} baris</span></div>)}</div>:<Alert tone="success">Seluruh jurnal pada periode ini seimbang.</Alert>}{journals.length?<div className={styles.tableWrap}><table><thead><tr><th>Jurnal</th><th>Sumber</th><th>Debit</th><th>Kredit</th><th>Status</th></tr></thead><tbody>{journals.map(journal=><tr key={journal.id}><td><strong>{journal.entry_number}</strong><span>{dateTime(journal.posted_at||journal.created_at)} · {journal.description}</span></td><td><strong>{journal.source_type}</strong></td><td>{rupiah(journal.debit_amount)}</td><td>{rupiah(journal.credit_amount)}</td><td><Badge tone={journal.balanced?"success":"warning"}>{journal.balanced?"Seimbang":"Periksa"}</Badge></td></tr>)}</tbody></table></div>:null}</div></details>
 </PageContainer>;
}
