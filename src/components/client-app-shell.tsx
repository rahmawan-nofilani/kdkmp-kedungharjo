"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const AppNavigationShellV2 = dynamic(
  () => import("./app-navigation-shell-v2").then((module) => module.AppNavigationShellV2),
  { ssr: false },
);

type NavigationAccess = {
  profile: { fullName: string };
  role: { name: string };
  permissions: string[];
};

const PUBLIC_PATHS = new Set(["/", "/login"]);

export function ClientAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const [access, setAccess] = useState<NavigationAccess | null>(null);

  useEffect(() => {
    if (isPublic) {
      setAccess(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    fetch("/api/navigation-context", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as NavigationAccess;
      })
      .then((value) => {
        if (active) setAccess(value);
      })
      .catch(() => {
        if (active) setAccess(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isPublic]);

  if (isPublic || !access) return <>{children}</>;
  return <AppNavigationShellV2 access={access}>{children}</AppNavigationShellV2>;
}
