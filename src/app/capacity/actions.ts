"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { getD1SchemaStatus } from "@/lib/d1/context";
import { saveCapacitySnapshot } from "@/lib/d1/system-capacity";
import { createClient } from "@/lib/supabase/server";

export async function saveCapacitySnapshotAction() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");
  const schema = await getD1SchemaStatus();
  if (!schema.features.systemCapacity) redirect("/setup/database");

  const supabase = await createClient();
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", access.organization.id);
  await saveCapacitySnapshot({ organizationId: access.organization.id, userId: access.user.id, memberCount: count ?? 0, supabaseBytes: null });
  revalidatePath("/capacity");
  redirect("/capacity?status=saved");
}
