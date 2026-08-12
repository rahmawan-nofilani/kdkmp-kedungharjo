"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { initializeTransactionCore } from "@/lib/d1/bootstrap";

export async function initializeD1() {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("ORG_MANAGE")) redirect("/dashboard");

  let destination = "/setup/database?status=initialized";

  try {
    const result = await initializeTransactionCore();
    revalidatePath("/setup/database");
    revalidatePath("/teller");
    destination = result.alreadyInitialized
      ? "/setup/database?status=ready"
      : "/setup/database?status=initialized";
  } catch (error) {
    console.error("D1 initialization failed", error);
    destination = "/setup/database?error=database";
  }

  redirect(destination);
}
