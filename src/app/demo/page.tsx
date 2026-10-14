import { Dashboard } from "@/components/dashboard";
import { currentMonth, demoState } from "@/lib/finance";

export const dynamic = "force-dynamic";
export default function Demo() {
  const month = currentMonth();
  return (
    <Dashboard
      demo
      initialSnapshot={{ state: demoState(month), version: 0 }}
      month={month}
      household={{
        id: "demo",
        name: "Nosso cantinho",
        owner_id: "demo",
        member_count: 2,
      }}
    />
  );
}
