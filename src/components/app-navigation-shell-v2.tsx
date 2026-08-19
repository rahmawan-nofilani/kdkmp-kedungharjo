"use client";

import type { ReactNode } from "react";
import { useEffect,useMemo,useState } from "react";
import Link from "next/link";
import { usePathname,useRouter } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { KopdesKuBrand } from "@/components/brand/kopdesku-brand";
import { Drawer } from "@/components/ui/overlays";
import { ChevronLeftIcon,ChevronRightIcon,FinanceIcon,HomeIcon,InventoryIcon,MoreIcon,PosIcon,ReportIcon,SettingsIcon,TransactionIcon,UsersIcon,type IconProps } from "@/components/ui/icons";

type ShellAccess={profile:{fullName:string};role:{name:string};permissions:string[]};
type IconComponent=(props:IconProps)=>ReactNode;
type NavItem={label:string;href:string;permission?:string;anyPermissions?:string[];badge?:string;icon?:IconComponent};
type NavGroup={label?:string;items:NavItem[]};
type NavModule={label:string;icon:IconComponent;direct?:NavItem;groups?:NavGroup[]};

const simpanPinjamPermissions=["SAVINGS_PRODUCT_VIEW","SAVINGS_ACCOUNT_VIEW","SAVINGS_TX_VIEW","SAVINGS_TRANSACTION_VIEW","LOAN_PRODUCT_VIEW","LOAN_APPLICATION_VIEW","LOAN_CONTRACT_VIEW","LOAN_DISBURSEMENT_VIEW","LOAN_REPAYMENT_VIEW","LOAN_PENALTY_VIEW","LOAN_REPORT_VIEW"];

const modules:NavModule[]=[
  {label:"Beranda",icon:HomeIcon,direct:{label:"Beranda",href:"/dashboard",permission:"DASHBOARD_VIEW",icon:HomeIcon}},
  {label:"Kasir & Penjualan",icon:PosIcon,groups:[
    {label:"Transaksi",items:[{label:"POS / Penjualan",href:"/pos",permission:"POS_ACCESS",icon:PosIcon},{label:"Kasir / Shift",href:"/teller",permission:"POS_ACCESS",icon:TransactionIcon}]},
    {label:"Laporan",items:[{label:"Laporan Penjualan",href:"/reports/daily-sales",permission:"REPORT_VIEW",icon:ReportIcon}]},
  ]},
  {label:"Simpan Pinjam",icon:FinanceIcon,groups:[
    {label:"Ringkasan",items:[{label:"Beranda Simpan Pinjam",href:"/simpan-pinjam",anyPermissions:simpanPinjamPermissions,icon:HomeIcon}]},
    {label:"Simpanan",items:[
      {label:"Rekening Anggota",href:"/savings/accounts",permission:"SAVINGS_ACCOUNT_VIEW",icon:UsersIcon},
      {label:"Setoran Masuk",href:"/savings/accounts?intent=deposit",permission:"SAVINGS_DEPOSIT",icon:TransactionIcon},
      {label:"Penarikan",href:"/savings/accounts?intent=withdraw",permission:"SAVINGS_WITHDRAW",icon:TransactionIcon},
      {label:"Riwayat Simpanan",href:"/savings/reports",anyPermissions:["SAVINGS_TX_VIEW","SAVINGS_TRANSACTION_VIEW","REPORT_VIEW"],icon:ReportIcon},
    ]},
    {label:"Pinjaman",items:[
      {label:"Pengajuan Pinjaman",href:"/loans/applications",permission:"LOAN_APPLICATION_VIEW",icon:TransactionIcon},
      {label:"Kontrak & Jadwal",href:"/loans/contracts",permission:"LOAN_CONTRACT_VIEW"},
      {label:"Pencairan",href:"/loans/disbursements",permission:"LOAN_DISBURSEMENT_VIEW"},
      {label:"Angsuran Masuk",href:"/loans/repayments",permission:"LOAN_REPAYMENT_VIEW",icon:TransactionIcon},
      {label:"Denda & Keringanan",href:"/loans/penalties",permission:"LOAN_PENALTY_VIEW"},
      {label:"Pelunasan / Koreksi",href:"/loans/corrections",anyPermissions:["LOAN_CORRECTION_VIEW","LOAN_REPAYMENT_POST"]},
    ]},
    {label:"Laporan",items:[{label:"Laporan Pinjaman",href:"/loans/reports",permission:"LOAN_REPORT_VIEW",icon:ReportIcon}]},
    {label:"Pengaturan",items:[{label:"Produk Simpanan",href:"/savings/products",permission:"SAVINGS_PRODUCT_VIEW",badge:"Config"},{label:"Produk Pinjaman",href:"/loans/products",permission:"LOAN_PRODUCT_VIEW",badge:"Config"}]},
  ]},
  {label:"Operasional",icon:InventoryIcon,groups:[{items:[
    {label:"Anggota",href:"/members",permission:"MEMBER_VIEW",icon:UsersIcon},
    {label:"Stok & Gudang",href:"/inventory",permission:"INVENTORY_VIEW",icon:InventoryIcon},
    {label:"Pembelian",href:"/procurement",permission:"PURCHASE_VIEW",icon:TransactionIcon},
    {label:"Hutang Pemasok",href:"/procurement/ap",permission:"AP_VIEW",icon:FinanceIcon},
  ]}]},
  {label:"Keuangan",icon:FinanceIcon,groups:[{items:[
    {label:"Ringkasan Keuangan",href:"/finance",permission:"FINANCE_VIEW",icon:FinanceIcon},
    {label:"Kas & Bank",href:"/finance/treasury",permission:"FINANCE_VIEW"},
    {label:"Jurnal",href:"/finance/journals",permission:"FINANCE_VIEW"},
    {label:"Aset Tetap",href:"/finance/assets",permission:"FINANCE_VIEW"},
    {label:"Kesiapan Tutup Buku",href:"/finance/closing-readiness",permission:"FINANCE_VIEW"},
    {label:"Pengaturan Akuntansi",href:"/finance/settings",anyPermissions:["ACCOUNTING_MANAGE","ACCOUNTING_APPROVE"],icon:SettingsIcon},
  ]}]},
  {label:"Persetujuan",icon:TransactionIcon,direct:{label:"Pusat Persetujuan",href:"/approvals",anyPermissions:["APPROVAL_VIEW","PURCHASE_APPROVE","INVOICE_APPROVE","JOURNAL_APPROVE","ASSET_APPROVE","SAVINGS_PRODUCT_APPROVE","SAVINGS_ACCOUNT_APPROVE","LOAN_PRODUCT_APPROVE","LOAN_APPLICATION_APPROVE","LOAN_DISBURSEMENT_APPROVE","LOAN_PENALTY_WAIVE_APPROVE","LOAN_CORRECTION_APPROVE","ORG_MANAGE"]}},
  {label:"Laporan",icon:ReportIcon,groups:[{items:[
    {label:"Penjualan Harian",href:"/reports/daily-sales",permission:"REPORT_VIEW",icon:ReportIcon},
    {label:"Simpanan",href:"/savings/reports",anyPermissions:["SAVINGS_TX_VIEW","SAVINGS_TRANSACTION_VIEW","REPORT_VIEW"]},
    {label:"Pinjaman",href:"/loans/reports",permission:"LOAN_REPORT_VIEW"},
  ]}]},
  {label:"Sistem",icon:SettingsIcon,groups:[{items:[
    {label:"Kesiapan Rilis",href:"/readiness",permission:"ORG_MANAGE",badge:"Go-Live"},
    {label:"Kapasitas Sistem",href:"/capacity",permission:"ORG_MANAGE",badge:"Zero Cost"},
    {label:"Backup & Pemulihan",href:"/capacity/recovery",permission:"ORG_MANAGE"},
    {label:"Pengaturan Database",href:"/setup/database",permission:"ORG_MANAGE",badge:"System",icon:SettingsIcon},
  ]}]},
];

const transactionActions:NavItem[]=[
  {label:"POS / Penjualan",href:"/pos",permission:"POS_ACCESS",icon:PosIcon},
  {label:"Setoran Simpanan",href:"/savings/accounts?intent=deposit",permission:"SAVINGS_DEPOSIT",icon:TransactionIcon},
  {label:"Penarikan Simpanan",href:"/savings/accounts?intent=withdraw",permission:"SAVINGS_WITHDRAW",icon:TransactionIcon},
  {label:"Angsuran Pinjaman",href:"/loans/repayments",permission:"LOAN_REPAYMENT_VIEW",icon:FinanceIcon},
  {label:"Ajukan Pinjaman",href:"/loans/applications",permission:"LOAN_APPLICATION_VIEW",icon:TransactionIcon},
  {label:"Pembelian / Penerimaan",href:"/procurement",permission:"PURCHASE_VIEW",icon:InventoryIcon},
];

const noShell=new Set(["/","/login"]);
function allowed(item:NavItem,permissions:Set<string>){if(item.permission&&!permissions.has(item.permission))return false;if(item.anyPermissions?.length&&!item.anyPermissions.some(code=>permissions.has(code)))return false;return true}
function baseHref(href:string){return href.split("?")[0]||href}
function itemActive(pathname:string,item:NavItem){const href=baseHref(item.href);return pathname===href||pathname.startsWith(`${href}/`)}
function moduleItems(module:NavModule){return module.direct?[module.direct]:(module.groups??[]).flatMap(group=>group.items)}

export function AppNavigationShellV2({access,children}:{access:ShellAccess;children:ReactNode}){
  const pathname=usePathname(),router=useRouter();
  const [pendingHref,setPendingHref]=useState<string|null>(null),[navigationPending,setNavigationPending]=useState(false),[menuOpen,setMenuOpen]=useState(false),[transactionOpen,setTransactionOpen]=useState(false),[openModules,setOpenModules]=useState<Set<string>>(()=>new Set(["Simpan Pinjam"]));
  const permissions=useMemo(()=>new Set(access.permissions),[access.permissions]);
  const visibleModules=useMemo(()=>modules.map(module=>{
    if(module.direct)return allowed(module.direct,permissions)?module:null;
    const groups=(module.groups??[]).map(group=>({...group,items:group.items.filter(item=>allowed(item,permissions))})).filter(group=>group.items.length);
    return groups.length?{...module,groups}:null;
  }).filter(Boolean) as NavModule[],[permissions]);
  const allItems=visibleModules.flatMap(module=>moduleItems(module));
  const active=allItems.filter(item=>itemActive(pathname,item)).sort((a,b)=>baseHref(b.href).length-baseHref(a.href).length)[0];
  const activeModule=visibleModules.find(module=>moduleItems(module).some(item=>itemActive(pathname,item)));
  const displayedActiveHref=pendingHref||active?.href;
  const firstName=access.profile.fullName.trim().split(/\s+/)[0]||"U";
  const reportHref=allItems.find(item=>item.href==="/loans/reports"&&allowed(item,permissions))?.href||allItems.find(item=>item.href==="/savings/reports"&&allowed(item,permissions))?.href||allItems.find(item=>item.href==="/reports/daily-sales"&&allowed(item,permissions))?.href||"/dashboard";
  const simpanPinjamHref=simpanPinjamPermissions.some(code=>permissions.has(code))?"/simpan-pinjam":"/dashboard";
  const visibleTransactions=transactionActions.filter(item=>allowed(item,permissions));

  useEffect(()=>{setPendingHref(null);setNavigationPending(false);setMenuOpen(false);setTransactionOpen(false);if(activeModule&&!activeModule.direct)setOpenModules(current=>{const next=new Set(current);next.add(activeModule.label);return next})},[pathname,activeModule?.label]);
  useEffect(()=>{if(!navigationPending)return;const timer=window.setTimeout(()=>{setPendingHref(null);setNavigationPending(false)},8000);return()=>window.clearTimeout(timer)},[navigationPending]);

  function warmRoute(href:string){const base=baseHref(href);if(base!==pathname)router.prefetch(base)}
  function beginNavigation(href?:string){if(href&&baseHref(href)===pathname&&!href.includes("?"))return;if(href){setPendingHref(href);router.prefetch(baseHref(href))}setNavigationPending(true)}
  function back(){beginNavigation();if(window.history.length>1)router.back();else router.push("/dashboard")}
  function toggleModule(label:string){setOpenModules(current=>{const next=new Set(current);if(next.has(label))next.delete(label);else next.add(label);return next})}
  if(noShell.has(pathname))return <>{children}</>;

  const renderItem=(item:NavItem,compact=false)=>{const Icon=item.icon;const isPending=pendingHref===item.href;return <Link href={item.href} prefetch className={`${compact?"kdk-subnav-item":"nav-item"} ${displayedActiveHref===item.href||itemActive(pathname,item)?"active":""} ${isPending?"pending":""}`} key={item.href+item.label} onPointerEnter={()=>warmRoute(item.href)} onFocus={()=>warmRoute(item.href)} onClick={()=>beginNavigation(item.href)}>{Icon?<Icon size={compact?16:18}/>:compact?null:<span className="nav-icon-placeholder"/>}<span className="nav-label">{item.label}</span>{isPending?<small>Membuka…</small>:item.badge?<small>{item.badge}</small>:null}</Link>};

  return <div className={`app-shell kdk-app-shell ${navigationPending?"shell-is-navigating":""}`}>
    <aside className="desktop-sidebar kdk-sidebar">
      <Link href="/dashboard" className="sidebar-brand persistent-brand" aria-label="Buka Dashboard" onClick={()=>beginNavigation("/dashboard")}><KopdesKuBrand compact inverse markOnly/><span className="sidebar-brand-copy"><strong>KopdesKu</strong><small>KDKMP Kedungharjo</small></span></Link>
      <nav className="sidebar-nav kdk-hierarchical-nav" aria-label="Navigasi utama">
        {visibleModules.map(module=>{
          const Icon=module.icon;const moduleActive=activeModule?.label===module.label;
          if(module.direct)return <div className="kdk-module" key={module.label}>{renderItem({...module.direct,icon:module.icon})}</div>;
          const open=openModules.has(module.label)||moduleActive;
          return <section className={`kdk-module ${moduleActive?"module-active":""}`} key={module.label}>
            <button type="button" className="kdk-module-trigger" onClick={()=>toggleModule(module.label)} aria-expanded={open}><Icon size={18}/><span>{module.label}</span><ChevronRightIcon className={open?"expanded":""} size={16}/></button>
            {open?<div className="kdk-module-panel">{module.groups?.map((group,index)=><div className="kdk-subnav-group" key={`${module.label}-${group.label||index}`}>{group.label?<p>{group.label}</p>:null}{group.items.map(item=>renderItem(item,true))}</div>)}</div>:null}
          </section>;
        })}
      </nav>
      <div className="sidebar-profile"><div className="avatar">{firstName.slice(0,1).toUpperCase()}</div><div className="profile-copy"><strong>{access.profile.fullName}</strong><span>{access.role.name}</span></div><LogoutButton/></div>
    </aside>

    <main className="kdk-shell-main">
      <header className="kdk-topbar"><button type="button" className="kdk-mobile-back" onClick={back} aria-label="Kembali"><ChevronLeftIcon/></button><div className="kdk-topbar-context"><span>KopdesKu</span><strong>{active?.label||activeModule?.label||"Workspace"}</strong></div><div className="kdk-topbar-user"><span>{access.role.name}</span><strong>{firstName}</strong></div></header>
      <div className="persistent-content">{children}</div>
    </main>

    <nav className="mobile-bottom-nav kdk-mobile-nav" aria-label="Navigasi mobile">
      <Link href="/dashboard" className={pathname==="/dashboard"?"active":""} onClick={()=>beginNavigation("/dashboard")}><HomeIcon size={20}/><span>Beranda</span></Link>
      <button type="button" className={transactionOpen?"active":""} onClick={()=>setTransactionOpen(true)}><TransactionIcon size={20}/><span>Transaksi</span></button>
      <Link href={simpanPinjamHref} className={pathname.startsWith("/simpan-pinjam")||pathname.startsWith("/savings")||pathname.startsWith("/loans")?"active":""} onClick={()=>beginNavigation(simpanPinjamHref)}><FinanceIcon size={20}/><span>Simpan Pinjam</span></Link>
      <Link href={reportHref} className={pathname.startsWith("/reports")||pathname.endsWith("/reports")?"active":""} onClick={()=>beginNavigation(reportHref)}><ReportIcon size={20}/><span>Laporan</span></Link>
      <button type="button" className={menuOpen?"active":""} onClick={()=>setMenuOpen(true)}><MoreIcon size={20}/><span>Menu</span></button>
    </nav>

    <Drawer open={transactionOpen} title="Pilih Transaksi" description="Akses cepat sesuai pekerjaan Anda." onClose={()=>setTransactionOpen(false)}><div className="kdk-transaction-launcher">{visibleTransactions.map(item=>{const Icon=item.icon||TransactionIcon;return <Link key={item.label} href={item.href} onClick={()=>beginNavigation(item.href)}><span className="kdk-launcher-icon"><Icon size={20}/></span><span><strong>{item.label}</strong><small>{item.label.includes("Setoran")?"Simpanan masuk anggota":item.label.includes("Penarikan")?"Simpanan keluar anggota":item.label.includes("Angsuran")?"Pembayaran angsuran pinjaman":item.label.includes("POS")?"Transaksi penjualan":"Buka alur operasional"}</small></span><ChevronRightIcon size={18}/></Link>})}</div></Drawer>

    <Drawer open={menuOpen} title="Menu KopdesKu" description="Menu ditampilkan sesuai hak akses Anda." onClose={()=>setMenuOpen(false)}>{visibleModules.map(module=><section className="kdk-more-group" key={module.label}><h3>{module.label}</h3>{moduleItems(module).map(item=>{const Icon=item.icon||module.icon;return <Link key={item.href+item.label} href={item.href} onClick={()=>beginNavigation(item.href)}><Icon size={17}/><span>{item.label}</span></Link>})}</section>)}<section className="kdk-more-group"><h3>Akun</h3><LogoutButton/></section></Drawer>
  </div>;
}
