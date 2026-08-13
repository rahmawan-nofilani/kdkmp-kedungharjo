import type { Metadata } from "next";
import { AppNavigationShell } from "@/components/app-navigation-shell";
import { getAccessContext } from "@/lib/access/context";
import "./globals.css";
import "./navigation-links.css";
import "./workspace-header.css";

export const metadata: Metadata = {
  title: "KDKMP Kedungharjo",
  description: "Platform operasional Koperasi Desa Merah Putih Kedungharjo.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access = await getAccessContext();

  return (
    <html lang="id">
      <body>
        {access ? (
          <AppNavigationShell
            access={{
              profile: { fullName: access.profile.fullName },
              organization: { name: access.organization.name },
              role: { name: access.role.name },
              permissions: access.permissions,
            }}
          >
            {children}
          </AppNavigationShell>
        ) : children}
      </body>
    </html>
  );
}
