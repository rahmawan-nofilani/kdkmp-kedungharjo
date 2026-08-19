import type { ReactNode,SVGProps } from "react";
export type IconProps=SVGProps<SVGSVGElement>&{size?:number};
function IconBase({size=20,children,...props}:IconProps&{children:ReactNode}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>}
export const HomeIcon=(p:IconProps)=><IconBase {...p}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></IconBase>;
export const PosIcon=(p:IconProps)=><IconBase {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h3M15 11h1M8 15h1M12 15h1M16 15h1"/></IconBase>;
export const TransactionIcon=(p:IconProps)=><IconBase {...p}><path d="M4 7h13"/><path d="m14 4 3 3-3 3"/><path d="M20 17H7"/><path d="m10 14-3 3 3 3"/></IconBase>;
export const ReportIcon=(p:IconProps)=><IconBase {...p}><path d="M5 20V10M12 20V4M19 20v-7"/></IconBase>;
export const MoreIcon=(p:IconProps)=><IconBase {...p}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></IconBase>;
export const UsersIcon=(p:IconProps)=><IconBase {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></IconBase>;
export const InventoryIcon=(p:IconProps)=><IconBase {...p}><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M3 12l9 5 9-5M3 16l9 5 9-5"/></IconBase>;
export const FinanceIcon=(p:IconProps)=><IconBase {...p}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 10h3v6h-3a3 3 0 0 1 0-6Z"/><path d="M7 10h4"/></IconBase>;
export const SettingsIcon=(p:IconProps)=><IconBase {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 14 20.93V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.07 14H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.07V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.93 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></IconBase>;
export const ChevronLeftIcon=(p:IconProps)=><IconBase {...p}><path d="m15 18-6-6 6-6"/></IconBase>;
export const ChevronRightIcon=(p:IconProps)=><IconBase {...p}><path d="m9 18 6-6-6-6"/></IconBase>;
export const CloseIcon=(p:IconProps)=><IconBase {...p}><path d="m6 6 12 12M18 6 6 18"/></IconBase>;
