import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdForUser } from "@/lib/data";
import { isSessionInvalid } from "@/lib/sync";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie",
};
function response(status: number, value: Record<string, unknown>) {
  return Response.json(
    { app: "nosso-dinheiro", ...value },
    { status, headers },
  );
}
export async function GET() {
  try {
    const client = await createClient();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError && !isSessionInvalid(authError))
      return response(503, { status: "unavailable" });
    if (!user) return response(401, { status: "signed-out" });
    const { household } = await getHouseholdForUser(client, user);
    if (!household) return response(404, { status: "no-space" });
    const { data, error } = await client
      .from("finance_states")
      .select("version")
      .eq("household_id", household.id)
      .maybeSingle();
    if (error) return response(503, { status: "unavailable" });
    if (!data) return response(404, { status: "no-space" });
    return response(200, {
      status: "current",
      householdId: household.id,
      version: z.number().int().nonnegative().parse(data.version),
      memberCount: household.member_count,
    });
  } catch {
    return response(503, { status: "unavailable" });
  }
}
