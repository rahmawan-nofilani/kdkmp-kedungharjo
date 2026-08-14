import Link from "next/link";
import type { ReactNode } from "react";
import { getAccessContext } from "@/lib/access/context";

export default async function SavingsLayout({children}:{children:ReactNode}){
  const access=await getAccessContext();
  if(!access) return <>{children}</>;
  const canProducts=access.permissions.includes("SAVINGS_PRODUCT_VIEW");
  const canAccounts=access.permissions.includes("SAVINGS_ACCOUNT_VIEW");
  const canReports=access.permissions.includes("SAVINGS_TX_VIEW")||access.permissions.includes("SAVINGS_TRANSACTION_VIEW")||access.permissions.includes("REPORT_VIEW");
  const canLoanProducts=access.permissions.includes("LOAN_PRODUCT_VIEW");
  return <>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 22px",background:"#f4f7f9",borderBottom:"1px solid #dfe5ec"}} aria-label="Navigasi Simpan Pinjam">
      {canProducts?<Link href="/savings/products" style={{padding:"8px 12px",borderRadius:10,background:"#fff",border:"1px solid #d9e0e7",fontWeight:800,color:"#0f1f30",textDecoration:"none"}}>Produk Simpanan</Link>:null}
      {canAccounts?<Link href="/savings/accounts" style={{padding:"8px 12px",borderRadius:10,background:"#fff",border:"1px solid #d9e0e7",fontWeight:800,color:"#0f1f30",textDecoration:"none"}}>Rekening Simpanan</Link>:null}
      {canReports?<Link href="/savings/reports" style={{padding:"8px 12px",borderRadius:10,background:"#fff",border:"1px solid #d9e0e7",fontWeight:800,color:"#0f1f30",textDecoration:"none"}}>Laporan & Integritas</Link>:null}
      {canLoanProducts?<Link href="/loans/products" style={{padding:"8px 12px",borderRadius:10,background:"#fff",border:"1px solid #d9e0e7",fontWeight:800,color:"#0f1f30",textDecoration:"none"}}>Produk Pinjaman</Link>:null}
    </div>
    {children}
  </>;
}
