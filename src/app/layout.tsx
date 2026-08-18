import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ClientAppShell } from "@/components/client-app-shell";
import "@/styles/kopdesku-tokens.css";
import "./globals.css";
import "./navigation-links.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default: "KopdesKu — KDKMP Kedungharjo",
    template: "%s · KopdesKu",
  },
  description: "KopdesKu Integrated Platform untuk operasional Koperasi Desa Merah Putih Kedungharjo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={poppins.className}>
        <ClientAppShell>{children}</ClientAppShell>
      </body>
    </html>
  );
}
