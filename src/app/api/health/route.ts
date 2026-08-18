import { getD1SchemaStatus } from "@/lib/d1/context";

export const dynamic = "force-dynamic";

async function checkSupabase() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !key) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${baseUrl}/rest/v1/`, {
      method: "GET",
      cache: "no-store",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/openapi+json",
      },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const [schema, supabaseReachable] = await Promise.all([
    getD1SchemaStatus(),
    checkSupabase(),
  ]);

  const d1Ready = schema.bound && schema.initialized && schema.current;
  const healthy = d1Ready && supabaseReachable;

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: {
        d1: d1Ready ? "ok" : "failed",
        supabase: supabaseReachable ? "ok" : "failed",
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
