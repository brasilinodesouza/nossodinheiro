import "server-only";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseState, type Snapshot } from "@/lib/finance";

const householdSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner_id: z.string().uuid(),
  member_count: z.number().int().positive(),
});
export async function getHousehold() {
  const client = await createClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user)
    throw new Error("Sua sessão expirou. Entre novamente.");
  return getHouseholdForUser(client, user);
}

// Call only after validating this user with auth.getUser() on the server.
export async function getHouseholdForUser(client: SupabaseClient, user: User) {
  const { data, error } = await client
    .from("households")
    .select("id,name,owner_id")
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error(
      "Não foi possível abrir o espaço do casal. Confira a configuração do banco.",
    );
  if (!data) return { user, household: null };
  const { data: count, error: countError } = await client.rpc(
    "household_member_count",
    { p_household_id: data.id },
  );
  if (countError)
    throw new Error("Não foi possível carregar os participantes.");
  return {
    user,
    household: householdSchema.parse({ ...data, member_count: count }),
  };
}
export async function loadSnapshot(householdId: string): Promise<Snapshot> {
  const client = await createClient();
  const { data, error } = await client
    .from("finance_states")
    .select("state,version")
    .eq("household_id", householdId)
    .single();
  if (error || !data)
    throw new Error("Não foi possível carregar seus dados. Tente novamente.");
  return {
    state: parseState(data.state),
    version: z.number().int().nonnegative().parse(data.version),
  };
}
