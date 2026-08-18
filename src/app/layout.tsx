import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ClientAppShell } from "@/components/client-app-shell";
import "@/styles/kopdesku-tokens.css";
import "./globals.css";
import "./navigation-links.css";
import "@/styles/kopdesku-adapter.css";

const poppins = Poppins({ subsets:["latin"], weight:["400","500","600","700"], display:"swap", variable:"--font-poppins" });

export const metadata: Metadata = {
  title:{ default:"KopdesKu — KDKMP Kedungharjo", template:"%s · KopdesKu" },
  description:"KopdesKu Integrated Platform untuk operasional Koperasi Desa Merah Putih Kedungharjo.",
  icons:{ icon:[{url:"/brand/kopdesku/kopdesku-mark.svg",type:"image/svg+xml"},{url:"/brand/kopdesku/icon-192.png",type:"image/png",sizes:"192x192"}] },
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="id"><body className={`${poppins.variable} ${poppins.className}`}><ClientAppShell>{children}</ClientAppShell></body></html>}
