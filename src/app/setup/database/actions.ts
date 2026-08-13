"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { applyPendingD1Migrations } from "@/lib/d1/schema-upgrades";

function diagnosticParams(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^D1_(BOOTSTRAP_STEP|UPGRADE_V2_STEP)_(\d+):\s*([\s\S]*)$/);

  if (!match) {
    return new URLSearchParams({ error: "database", detail: message.slice(0, 220) });
  }

  return new URLSearchParams({
    error: "database",
    stage: match[1] === "BOOTSTRAP_STEP" ? "CORE" : "INVENTORY_V2",
    step: match[2],
    detail: match[3].slice(0, 220),
  });
}

export async function initializeD1() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");

  let destination = "/setup/database?status=updated";

  try {
    const result = await applyPendingD1Migrations();
    revalidatePath("/setup/database");
    revalidatePath("/teller");
    revalidatePath("/inventory");
    revalidatePath("/inventory/opname");
    destination = result.alreadyInitialized
      ? "/setup/database?status=ready"
      : "/setup/database?status=updated";
  } catch (error) {
    console.error("D1 initialization/upgrade failed", error);
    destination = `/setup/database?${diagnosticParams(error).toString()}`;
  }

  redirect(destination);
}
