import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseState, type Snapshot } from "@/lib/finance";

const householdSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  owner_id: z.string().uuid(),
  partner_id: z.string().uuid().nullable(),
});
export async function getHousehold() {
  const client = await createClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user)
    throw new Error("Sua sessão expirou. Entre novamente.");
  const { data, error } = await client
    .from("households")
    .select("id,name,owner_id,partner_id")
    .or(`owner_id.eq.${user.id},partner_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();
  if (error)
    throw new Error(
      "Não foi possível abrir o espaço do casal. Confira a configuração do banco.",
    );
  return { user, household: data ? householdSchema.parse(data) : null };
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
