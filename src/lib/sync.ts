import { z } from "zod";

export function isSessionInvalid(error: {
  name?: string;
  status?: number;
  code?: string;
}) {
  return (
    error.name === "AuthSessionMissingError" ||
    error.status === 401 ||
    error.status === 403 ||
    [
      "refresh_token_not_found",
      "session_not_found",
      "session_expired",
      "user_not_found",
    ].includes(error.code ?? "")
  );
}

const marker = z.object({
  app: z.literal("nosso-dinheiro"),
  status: z.string(),
});
const currentSchema = z.object({
  status: z.literal("current"),
  householdId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  memberCount: z.number().int().positive(),
});
export type SyncSignal =
  z.infer<typeof currentSchema> | { status: "signed-out" | "no-space" };
export function syncSignal(status: number, body: unknown): SyncSignal | null {
  const parsed = marker.safeParse(body);
  if (!parsed.success) return null;
  if (status === 401 && parsed.data.status === "signed-out")
    return { status: "signed-out" };
  if (status === 404 && parsed.data.status === "no-space")
    return { status: "no-space" };
  if (status !== 200) return null;
  const current = currentSchema.safeParse(body);
  return current.success ? current.data : null;
}
export function syncDecision(
  signal: SyncSignal,
  householdId: string,
  version: number,
  memberCount: number,
  blocked: boolean,
) {
  const decision =
    signal.status === "signed-out"
      ? "login"
      : signal.status === "no-space" ||
          (signal.status === "current" && signal.householdId !== householdId)
        ? "setup"
        : signal.status === "current" &&
            (signal.version > version || signal.memberCount !== memberCount)
          ? "refresh"
          : "none";
  return blocked && decision !== "none" ? "wait" : decision;
}
