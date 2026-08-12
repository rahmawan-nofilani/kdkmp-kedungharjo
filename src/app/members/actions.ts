"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";

function clean(value: FormDataEntryValue | null, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export async function createMember(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("MEMBER_MANAGE")) redirect("/members?error=forbidden");

  const memberNumber = clean(formData.get("member_number"), 40).toUpperCase();
  const fullName = clean(formData.get("full_name"), 160);
  const phone = clean(formData.get("phone"), 32);
  const householdCode = clean(formData.get("household_code"), 60).toUpperCase();
  const hamlet = clean(formData.get("hamlet"), 80);
  const rt = clean(formData.get("rt"), 8);
  const rw = clean(formData.get("rw"), 8);
  const requestedStatus = clean(formData.get("status"), 20).toUpperCase();
  const status = requestedStatus === "PENDING" ? "PENDING" : "ACTIVE";

  if (!memberNumber || memberNumber.length < 3 || !fullName || fullName.length < 2) {
    redirect("/members?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("members").insert({
    organization_id: access.organization.id,
    member_number: memberNumber,
    full_name: fullName,
    phone: phone || null,
    household_code: householdCode || null,
    hamlet: hamlet || null,
    rt: rt || null,
    rw: rw || null,
    status,
    created_by: access.user.id,
    updated_by: access.user.id,
  });

  if (error) {
    if (error.code === "23505") redirect("/members?error=duplicate");
    redirect("/members?error=save");
  }

  revalidatePath("/members");
  redirect("/members?created=1");
}

export async function setMemberStatus(formData: FormData) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("MEMBER_MANAGE")) redirect("/members?error=forbidden");

  const memberId = clean(formData.get("member_id"), 64);
  const requestedStatus = clean(formData.get("status"), 20).toUpperCase();
  const allowedStatuses = new Set(["ACTIVE", "SUSPENDED", "ENDED"]);

  if (!memberId || !allowedStatuses.has(requestedStatus)) {
    redirect("/members?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ status: requestedStatus, updated_by: access.user.id })
    .eq("id", memberId)
    .eq("organization_id", access.organization.id);

  if (error) redirect("/members?error=save");

  revalidatePath("/members");
  redirect("/members?updated=1");
}
