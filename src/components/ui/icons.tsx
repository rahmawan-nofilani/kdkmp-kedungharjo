import type { ReactNode,SVGProps } from "react";

export type IconProps=SVGProps<SVGSVGElement>&{size?:number};

function IconBase({size=20,children,...props}:IconProps&{children:ReactNode}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const HomeIcon=(p:IconProps)=><IconBase {...p}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></IconBase>;
export const PosIcon=(p:IconProps)=><IconBase {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h3M15 11h1M8 15h1M12 15h1M16 15h1"/></IconBase>;
export const TransactionIcon=(p:IconProps)=><IconBase {...p}><path d="M4 7h13"/><path d="m14 4 3 3-3 3"/><path d="M20 17H7"/><path d="m10 14-3 3 3 3"/></IconBase>;
export const QuickActionIcon=(p:IconProps)=><IconBase {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></IconBase>;
export const ReportIcon=(p:IconProps)=><IconBase {...p}><path d="M5 20V10M12 20V4M19 20v-7"/></IconBase>;
export const MoreIcon=(p:IconProps)=><IconBase {...p}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></IconBase>;
export const UsersIcon=(p:IconProps)=><IconBase {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></IconBase>;
export const InventoryIcon=(p:IconProps)=><IconBase {...p}><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M3 12l9 5 9-5M3 16l9 5 9-5"/></IconBase>;
export const FinanceIcon=(p:IconProps)=><IconBase {...p}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 10h3v6h-3a3 3 0 0 1 0-6Z"/><path d="M7 10h4"/></IconBase>;
export const SettingsIcon=(p:IconProps)=><IconBase {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.93V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.07V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.93 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></IconBase>;

/* KopdesKu v1.4 semantic transaction family. Arrows are reserved for navigation/flow, not transaction identity. */
export const SavingsDepositIcon=(p:IconProps)=><IconBase {...p}><path d="M4 8.5h13a3 3 0 0 1 3 3V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h10"/><path d="M16 13h4"/><path d="M18 11v4"/><circle cx="15.5" cy="14.5" r="1"/></IconBase>;
export const SavingsWithdrawIcon=(p:IconProps)=><IconBase {...p}><path d="M4 8.5h13a3 3 0 0 1 3 3V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h10"/><path d="M16 13h4"/><circle cx="15.5" cy="14.5" r="1"/></IconBase>;
export const RepaymentIcon=(p:IconProps)=><IconBase {...p}><circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/><path d="M6.5 8h3M14.5 16h3"/><path d="m14.7 7.2 1.4 1.4 2.7-2.8"/></IconBase>;
export const LoanApplicationIcon=(p:IconProps)=><IconBase {...p}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 16h3"/><path d="M18 13v6M15 16h6"/></IconBase>;
export const DisbursementIcon=(p:IconProps)=><IconBase {...p}><rect x="3" y="7" width="15" height="12" rx="2"/><path d="M14 11h4a3 3 0 0 1 0 6h-4"/><circle cx="15.5" cy="14" r="1"/><path d="M7 4h8M13 2l2 2-2 2"/></IconBase>;
export const SettlementIcon=(p:IconProps)=><IconBase {...p}><path d="M6 3h10a2 2 0 0 1 2 2v16H6z"/><path d="M9 8h6M9 12h4"/><path d="m9 17 2 2 4-4"/></IconBase>;
export const PurchaseIcon=(p:IconProps)=><IconBase {...p}><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7"/></IconBase>;
export const ReceivingIcon=(p:IconProps)=><IconBase {...p}><path d="m4 7 8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/><path d="M8 14h3M9.5 12.5V16"/></IconBase>;
export const ReconcileIcon=(p:IconProps)=><IconBase {...p}><path d="M5 5h14M7 5l-3 6h6L7 5ZM17 5l-3 6h6l-3-6Z"/><path d="M12 5v14M8 19h8"/></IconBase>;
export const JournalIcon=(p:IconProps)=><IconBase {...p}><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M7 4v16M10 8h6M10 12h6M10 16h4"/></IconBase>;
export const ApprovalIcon=(p:IconProps)=><IconBase {...p}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2 2 4-5"/></IconBase>;
export const ReversalIcon=(p:IconProps)=><IconBase {...p}><path d="M7 7H3v-4"/><path d="M3.5 7.5A8 8 0 1 1 5 18"/><path d="M8 12h8"/></IconBase>;
export const ShiftIcon=(p:IconProps)=><IconBase {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h3M8 16h5"/><circle cx="17" cy="15" r="2"/></IconBase>;
export const BankIcon=(p:IconProps)=><IconBase {...p}><path d="m3 9 9-5 9 5"/><path d="M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18"/></IconBase>;
export const AssetIcon=(p:IconProps)=><IconBase {...p}><rect x="4" y="5" width="16" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></IconBase>;

export const ChevronLeftIcon=(p:IconProps)=><IconBase {...p}><path d="m15 18-6-6 6-6"/></IconBase>;
export const ChevronRightIcon=(p:IconProps)=><IconBase {...p}><path d="m9 18 6-6-6-6"/></IconBase>;
export const CloseIcon=(p:IconProps)=><IconBase {...p}><path d="m6 6 12 12M18 6 6 18"/></IconBase>;
