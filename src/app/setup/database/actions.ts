"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { applyPendingD1Migrations } from "@/lib/d1/schema-upgrades";

function diagnosticParams(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const bootstrap = message.match(/^D1_BOOTSTRAP_STEP_(\d+):\s*([\s\S]*)$/);
  if (bootstrap) return new URLSearchParams({ error: "database", stage: "CORE", step: bootstrap[1], detail: bootstrap[2].slice(0, 220) });
  const upgrade = message.match(/^D1_UPGRADE_V(\d+)_STEP_(\d+):\s*([\s\S]*)$/);
  if (upgrade) return new URLSearchParams({ error: "database", stage: `V${upgrade[1]}`, step: upgrade[2], detail: upgrade[3].slice(0, 220) });
  return new URLSearchParams({ error: "database", detail: message.slice(0, 220) });
}

export async function initializeD1() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");
  let destination = "/setup/database?status=updated";
  try {
    const result = await applyPendingD1Migrations();
    for (const path of [
      "/setup/database",
      "/teller",
      "/inventory",
      "/inventory/opname",
      "/procurement",
      "/procurement/ap",
      "/finance",
      "/finance/settings",
      "/finance/treasury",
      "/finance/journals",
    ]) revalidatePath(path);
    destination = result.alreadyInitialized ? "/setup/database?status=ready" : "/setup/database?status=updated";
  } catch (error) {
    console.error("D1 initialization/upgrade failed", error);
    destination = `/setup/database?${diagnosticParams(error).toString()}`;
  }
  redirect(destination);
}
