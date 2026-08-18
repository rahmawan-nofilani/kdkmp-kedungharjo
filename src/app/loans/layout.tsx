import Link from "next/link";
import type { ReactNode } from "react";
import { getAccessContext } from "@/lib/access/context";

const linkStyle = { padding: "8px 12px", borderRadius: 10, background: "#fff", border: "1px solid #d9e0e7", fontWeight: 800, color: "#0f1f30", textDecoration: "none" } as const;

export default async function LoansLayout({ children }: { children: ReactNode }) {
  const access = await getAccessContext();
  if (!access) return <>{children}</>;
  const canSavingsProducts = access.permissions.includes("SAVINGS_PRODUCT_VIEW");
  const canSavingsAccounts = access.permissions.includes("SAVINGS_ACCOUNT_VIEW");
  const canSavingsReports = access.permissions.includes("SAVINGS_TX_VIEW") || access.permissions.includes("SAVINGS_TRANSACTION_VIEW") || access.permissions.includes("REPORT_VIEW");
  const canLoanProducts = access.permissions.includes("LOAN_PRODUCT_VIEW");
  const canLoanApplications = access.permissions.includes("LOAN_APPLICATION_VIEW");
  const canLoanContracts = access.permissions.includes("LOAN_CONTRACT_VIEW");
  const canLoanDisbursements = access.permissions.includes("LOAN_DISBURSEMENT_VIEW");

  return <>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 22px", background: "#f4f7f9", borderBottom: "1px solid #dfe5ec" }} aria-label="Navigasi Simpan Pinjam">
      {canSavingsProducts ? <Link href="/savings/products" style={linkStyle}>Produk Simpanan</Link> : null}
      {canSavingsAccounts ? <Link href="/savings/accounts" style={linkStyle}>Rekening Simpanan</Link> : null}
      {canSavingsReports ? <Link href="/savings/reports" style={linkStyle}>Laporan &amp; Integritas</Link> : null}
      {canLoanProducts ? <Link href="/loans/products" style={linkStyle}>Produk Pinjaman</Link> : null}
      {canLoanApplications ? <Link href="/loans/applications" style={linkStyle}>Pengajuan Pinjaman</Link> : null}
      {canLoanContracts ? <Link href="/loans/contracts" style={linkStyle}>Kontrak &amp; Jadwal</Link> : null}
      {canLoanDisbursements ? <Link href="/loans/disbursements" style={linkStyle}>Pencairan Pinjaman</Link> : null}
    </div>
    {children}
  </>;
}
