import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KDKMP Kedungharjo",
  description: "Platform operasional Koperasi Desa Merah Putih Kedungharjo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
