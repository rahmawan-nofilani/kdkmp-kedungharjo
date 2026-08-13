import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { ACCOUNTING_EVENTS, listAccounts, listMappings } from "@/lib/d1/accounting-config";
import { getD1SchemaStatus } from "@/lib/d1/context";
import {
  approveMappingDraftAction,
  createAccountAction,
  createMappingDraftAction,
  rejectMappingDraftAction,
  setAccountStatusAction,
} from "./actions";
import styles from "./settings.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ status?: string; error?: string }> };

export default async function AccountingSettingsPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("FINANCE_VIEW")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (schema.currentVersion !== "accounting_config_v5") redirect("/setup/database");

  const params = await searchParams;
  const [accounts, mappings] = await Promise.all([
    listAccounts(access.organization.id),
    listMappings(access.organization.id),
  ]);
  const activeAccounts = accounts.filter((account) => account.status === "ACTIVE");
  const canManage = access.permissions.includes("ACCOUNTING_MANAGE");
  const canApprove = access.permissions.includes("ACCOUNTING_APPROVE");
  const drafts = mappings.filter((row) => row.version_status === "DRAFT");
  const latestByEvent = new Map<string, (typeof mappings)[number]>();
  for (const row of mappings) {
    if (!latestByEvent.has(row.event_code)) latestByEvent.set(row.event_code, row);
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div><p>FINANCE · CONFIGURATION</p><h1>Chart of Accounts & Accounting Mapping</h1></div>
      <nav><Link href="/finance">Finance</Link><Link href="/dashboard">Dashboard</Link></nav>
    </header>
    <div className={styles.content}>
      <section className={styles.hero}>
        <div><span>PHASE 3B · VERSIONED CONFIGURATION</span><h2>Mapping transaksi dapat berubah tanpa menulis ulang sejarah jurnal.</h2><p>Default foundation tetap tersedia, tetapi setiap perubahan dibuat sebagai versi DRAFT dan membutuhkan approval user berbeda sebelum menjadi mapping aktif.</p></div>
        <div className={styles.roleCard}><span>Role</span><strong>{access.role.name}</strong><small>{access.organization.name}</small></div>
      </section>

      {params.status ? <div className={styles.success}>Proses berhasil: {params.status.replace(/-/g," ")}.</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.metrics}>
        <article><span>COA</span><strong>{accounts.length}</strong><small>{activeAccounts.length} ACTIVE</small></article>
        <article><span>Accounting Events</span><strong>{ACCOUNTING_EVENTS.length}</strong><small>foundation events</small></article>
        <article><span>Draft Mapping</span><strong>{drafts.length}</strong><small>menunggu keputusan</small></article>
        <article><span>Control</span><strong>Maker-Checker</strong><small>versioned + audit trail</small></article>
      </section>

      {canManage ? <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>CHART OF ACCOUNTS</span><h3>Tambah akun organisasi</h3></div><b>Maker</b></div>
        <form action={createAccountAction} className={styles.accountForm}>
          <label>Kode<input name="code" required placeholder="1-1200" /></label>
          <label>Nama<input name="name" required placeholder="Piutang Usaha" /></label>
          <label>Tipe<select name="accountType" defaultValue="ASSET"><option>ASSET</option><option>LIABILITY</option><option>EQUITY</option><option>REVENUE</option><option>EXPENSE</option></select></label>
          <label>Normal balance<select name="normalBalance" defaultValue="DEBIT"><option>DEBIT</option><option>CREDIT</option></select></label>
          <button type="submit">Tambah Akun</button>
        </form>
      </section> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>COA REGISTER</span><h3>Chart of Accounts</h3></div><b>{accounts.length}</b></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Kode</th><th>Nama</th><th>Tipe</th><th>Normal</th><th>Status</th><th>Control</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}>
          <td><strong>{account.code}</strong>{account.is_system ? <small>System foundation</small> : null}</td><td>{account.name}</td><td>{account.account_type}</td><td>{account.normal_balance}</td><td>{account.status}</td>
          <td>{canManage ? <form action={setAccountStatusAction} className={styles.inlineForm}><input type="hidden" name="accountId" value={account.id} /><select name="status" defaultValue={account.status}><option>ACTIVE</option><option>INACTIVE</option><option>ARCHIVED</option></select><button type="submit">Update</button></form> : "—"}</td>
        </tr>)}</tbody></table></div>
      </section>

      {canManage ? <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>ACCOUNTING MAPPING</span><h3>Buat versi mapping baru</h3></div><b>Draft only</b></div>
        <div className={styles.mappingGrid}>{ACCOUNTING_EVENTS.map((event) => {
          const latest = latestByEvent.get(event.code);
          return <form action={createMappingDraftAction} className={styles.mappingCard} key={event.code}>
            <input type="hidden" name="eventCode" value={event.code} />
            <div><strong>{event.code}</strong><span>{event.name}</span></div>
            <small>Current v{latest?.current_approved_version || 0}: {latest?.debit_code || "—"} → {latest?.credit_code || "—"}</small>
            <label>Debit<select name="debitAccountId" required defaultValue=""><option value="" disabled>Pilih akun</option>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.code} · {account.name}</option>)}</select></label>
            <label>Kredit<select name="creditAccountId" required defaultValue=""><option value="" disabled>Pilih akun</option>{activeAccounts.map((account) => <option value={account.id} key={account.id}>{account.code} · {account.name}</option>)}</select></label>
            <label>Catatan perubahan<textarea name="changeNote" required minLength={8} maxLength={240} placeholder="Mengapa mapping ini perlu berubah?" /></label>
            <button type="submit">Simpan Draft Version</button>
          </form>;
        })}</div>
      </section> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>APPROVAL QUEUE</span><h3>Draft mapping menunggu keputusan</h3></div><b>{drafts.length}</b></div>
        {drafts.length ? <div className={styles.draftList}>{drafts.map((draft) => <article key={draft.version_id || `${draft.event_code}-${draft.version}`}>
          <div><strong>{draft.event_code} · v{draft.version}</strong><span>{draft.debit_code} {draft.debit_name} → {draft.credit_code} {draft.credit_name}</span><small>{draft.change_note}</small></div>
          {canApprove && draft.version_id ? <div className={styles.decisionRow}>
            <form action={approveMappingDraftAction}><input type="hidden" name="versionId" value={draft.version_id} /><button type="submit">Approve</button></form>
            <form action={rejectMappingDraftAction} className={styles.rejectForm}><input type="hidden" name="versionId" value={draft.version_id} /><input name="reason" required minLength={8} placeholder="Alasan reject" /><button type="submit">Reject</button></form>
          </div> : null}
          {draft.created_by === access.user.id ? <em>Maker-checker: akun ini adalah pembuat draft dan tidak boleh meng-approve draft tersebut.</em> : null}
        </article>)}</div> : <div className={styles.empty}>Tidak ada draft mapping.</div>}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>VERSION HISTORY</span><h3>Semua mapping version</h3></div><b>{mappings.length}</b></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Event</th><th>Version</th><th>Debit</th><th>Kredit</th><th>Status</th><th>Note</th></tr></thead><tbody>{mappings.map((row) => <tr key={row.version_id || `${row.event_code}-${row.version}`}><td><strong>{row.event_code}</strong><small>{row.event_name}</small></td><td>v{row.version || "—"}</td><td>{row.debit_code || "—"}<small>{row.debit_name}</small></td><td>{row.credit_code || "—"}<small>{row.credit_name}</small></td><td>{row.version_status || "—"}</td><td>{row.change_note || "—"}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  </main>;
}
