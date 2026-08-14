import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AccessContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: {
    fullName: string;
    status: string;
  };
  organization: {
    id: string;
    code: string;
    name: string;
    legalName: string | null;
  };
  role: {
    id: string;
    code: string;
    name: string;
  };
  permissions: string[];
  units: Array<{
    id: string;
    code: string;
    name: string;
    unitType: string;
  }>;
};

type RpcAccessContext = {
  profile?: {
    fullName?: string | null;
    status?: string | null;
  } | null;
  organization?: {
    id?: string;
    code?: string;
    name?: string;
    legalName?: string | null;
  } | null;
  role?: {
    id?: string;
    code?: string;
    name?: string;
  } | null;
  permissions?: unknown;
  units?: unknown;
};

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string"))).sort();
}

function unitArray(value: unknown): AccessContext["units"] {
  if (!Array.isArray(value)) return [];
  const units: AccessContext["units"] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.code !== "string" ||
      typeof row.name !== "string" ||
      typeof row.unitType !== "string"
    ) continue;

    units.push({ id: row.id, code: row.code, name: row.name, unitType: row.unitType });
  }

  return units;
}

async function loadAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return null;

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_my_access_context");
  if (rpcError || !rpcData || typeof rpcData !== "object") return null;

  const rpc = rpcData as RpcAccessContext;
  const organization = rpc.organization;
  const role = rpc.role;

  if (
    !organization ||
    typeof organization.id !== "string" ||
    typeof organization.code !== "string" ||
    typeof organization.name !== "string" ||
    !role ||
    typeof role.id !== "string" ||
    typeof role.code !== "string" ||
    typeof role.name !== "string"
  ) return null;

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    profile: {
      fullName: rpc.profile?.fullName || user.email?.split("@")[0] || "Pengguna KDKMP",
      status: rpc.profile?.status || "ACTIVE",
    },
    organization: {
      id: organization.id,
      code: organization.code,
      name: organization.name,
      legalName: typeof organization.legalName === "string" ? organization.legalName : null,
    },
    role: {
      id: role.id,
      code: role.code,
      name: role.name,
    },
    permissions: stringArray(rpc.permissions),
    units: unitArray(rpc.units),
  };
}

export const getAccessContext = cache(loadAccessContext);
