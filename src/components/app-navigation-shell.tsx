"use client";

import type { ReactNode } from "react";
import { AppNavigationShellV2 } from "./app-navigation-shell-v2";

type Props = {
  access: {
    profile: { fullName: string };
    organization: { name: string };
    role: { name: string };
    permissions: string[];
  };
  children: ReactNode;
};

export function AppNavigationShell({ access, children }: Props) {
  return <AppNavigationShellV2 access={{ profile: access.profile, role: access.role, permissions: access.permissions }}>{children}</AppNavigationShellV2>;
}
