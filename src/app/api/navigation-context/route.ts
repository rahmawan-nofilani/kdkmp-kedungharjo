import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access/context";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      profile: { fullName: access.profile.fullName },
      role: { name: access.role.name },
      permissions: access.permissions,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
