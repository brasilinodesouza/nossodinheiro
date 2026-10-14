import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { AuthForm, HouseholdSetup } from "@/components/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getHousehold, loadSnapshot } from "@/lib/data";
import { currentMonth } from "@/lib/finance";
import { identityToUsername } from "@/lib/credentials";

export const dynamic = "force-dynamic";
export default async function Home() {
  if (!isSupabaseConfigured()) return <AuthForm configured={false} />;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { household } = await getHousehold();
  if (!household)
    return <HouseholdSetup username={identityToUsername(user.email)} />;
  const snapshot = await loadSnapshot(household.id);
  return (
    <Dashboard
      initialSnapshot={snapshot}
      household={household}
      userId={user.id}
      month={currentMonth()}
    />
  );
}
