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

type MembershipGraph = {
  id: string;
  status: string;
  organization: {
    id: string;
    code: string;
    name: string;
    legal_name: string | null;
  } | null;
  role: {
    id: string;
    code: string;
    name: string;
    role_permissions: Array<{
      permission: { code: string } | null;
    }> | null;
  } | null;
  user_unit_scopes: Array<{
    unit: {
      id: string;
      code: string;
      name: string;
      unit_type: string;
    } | null;
  }> | null;
};

async function loadAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) return null;

  const [{ data: profile }, { data: membership, error: membershipError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_memberships")
      .select(`
        id,
        status,
        organization:organizations!organization_memberships_organization_id_fkey(
          id,code,name,legal_name
        ),
        role:roles!organization_memberships_role_id_fkey(
          id,code,name,
          role_permissions(
            permission:permissions!role_permissions_permission_id_fkey(code)
          )
        ),
        user_unit_scopes(
          unit:organization_units!user_unit_scopes_unit_id_fkey(
            id,code,name,unit_type
          )
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .maybeSingle(),
  ]);

  if (membershipError || !membership) return null;

  const graph = membership as unknown as MembershipGraph;
  if (!graph.organization || !graph.role) return null;

  const permissions = Array.from(
    new Set(
      (graph.role.role_permissions ?? [])
        .map((row) => row.permission?.code)
        .filter((code): code is string => Boolean(code)),
    ),
  ).sort();

  const units = (graph.user_unit_scopes ?? [])
    .map((row) => row.unit)
    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
    .map((unit) => ({
      id: unit.id,
      code: unit.code,
      name: unit.name,
      unitType: unit.unit_type,
    }));

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    profile: {
      fullName: profile?.full_name || user.email?.split("@")[0] || "Pengguna KDKMP",
      status: profile?.status || "ACTIVE",
    },
    organization: {
      id: graph.organization.id,
      code: graph.organization.code,
      name: graph.organization.name,
      legalName: graph.organization.legal_name,
    },
    role: {
      id: graph.role.id,
      code: graph.role.code,
      name: graph.role.name,
    },
    permissions,
    units,
  };
}

export const getAccessContext = cache(loadAccessContext);
