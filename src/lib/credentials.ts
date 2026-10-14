import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export const credentialsSchema = z.object({
  mode: z.enum(["login", "signup"]),
  username: usernameSchema,
  password: z.string().min(8).max(128),
});

// Supabase requires an email-shaped identifier for password accounts. This
// reserved domain has no mailbox; the app never requests a personal address.
const identityDomain = "usuarios.nossodinheiro.invalid";

export function usernameToIdentity(username: string) {
  const normalized = usernameSchema.parse(username);
  // Hex preserves dots/separators without invalid email local parts. At 32
  // ASCII characters it stays within the local-part limit of 64 characters.
  return `${Buffer.from(normalized, "ascii").toString("hex")}@${identityDomain}`;
}

export function identityToUsername(identity: string | undefined) {
  const suffix = `@${identityDomain}`;
  if (!identity?.endsWith(suffix)) return "sua conta";
  const local = identity.slice(0, -suffix.length);
  if (!/^(?:[a-f0-9]{2}){3,32}$/.test(local)) return "sua conta";
  const parsed = usernameSchema.safeParse(
    Buffer.from(local, "hex").toString("ascii"),
  );
  return parsed.success && usernameToIdentity(parsed.data) === identity
    ? parsed.data
    : "sua conta";
}
