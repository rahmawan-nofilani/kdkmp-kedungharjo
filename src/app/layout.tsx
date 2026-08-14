import type { Metadata } from "next";
import { ClientAppShell } from "@/components/client-app-shell";
import "./globals.css";
import "./navigation-links.css";

export const metadata: Metadata = {
  title: "KDKMP Kedungharjo",
  description: "Platform operasional Koperasi Desa Merah Putih Kedungharjo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <ClientAppShell>{children}</ClientAppShell>
      </body>
    </html>
  );
}
