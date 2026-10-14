import { AuthForm, InvitationAcceptance } from "@/components/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getHousehold } from "@/lib/data";

export const dynamic = "force-dynamic";
export default async function InvitationPage() {
  if (!isSupabaseConfigured()) return <AuthForm configured={false} invited />;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return <AuthForm configured invited />;
  const { household } = await getHousehold();
  return <InvitationAcceptance currentSpace={household?.name} />;
}
