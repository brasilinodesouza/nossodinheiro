import { AuthForm } from "@/components/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export default function Login() {
  return <AuthForm configured={isSupabaseConfigured()} />;
}
