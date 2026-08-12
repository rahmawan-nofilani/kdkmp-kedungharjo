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

export async function getAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,status")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("id,organization_id,role_id,status")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!membership) return null;

  const [{ data: organization }, { data: role }, { data: rolePermissionRows }, { data: unitScopeRows }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id,code,name,legal_name")
        .eq("id", membership.organization_id)
        .maybeSingle(),
      supabase
        .from("roles")
        .select("id,code,name")
        .eq("id", membership.role_id)
        .maybeSingle(),
      supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role_id", membership.role_id),
      supabase
        .from("user_unit_scopes")
        .select("unit_id")
        .eq("membership_id", membership.id),
    ]);

  if (!organization || !role) return null;

  const permissionIds = (rolePermissionRows ?? []).map((row) => row.permission_id);
  const unitIds = (unitScopeRows ?? []).map((row) => row.unit_id);

  const [{ data: permissionRows }, { data: unitRows }] = await Promise.all([
    permissionIds.length
      ? supabase.from("permissions").select("code").in("id", permissionIds)
      : Promise.resolve({ data: [] as Array<{ code: string }> }),
    unitIds.length
      ? supabase
          .from("organization_units")
          .select("id,code,name,unit_type")
          .in("id", unitIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; code: string; name: string; unit_type: string }>,
        }),
  ]);

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
      id: organization.id,
      code: organization.code,
      name: organization.name,
      legalName: organization.legal_name,
    },
    role: {
      id: role.id,
      code: role.code,
      name: role.name,
    },
    permissions: (permissionRows ?? []).map((row) => row.code).sort(),
    units: (unitRows ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unitType: row.unit_type,
    })),
  };
}
