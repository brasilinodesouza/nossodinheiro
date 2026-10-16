import { z } from "zod";

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "A confirmação não corresponde à nova senha.",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "Escolha uma senha diferente da atual.",
    path: ["newPassword"],
  });

type AuthError = { code?: string } | null;
type AuthUserResult = {
  data: { user: { id: string; email?: string } | null };
  error: AuthError;
};
type PasswordAuth = {
  getUser(): Promise<AuthUserResult>;
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<AuthUserResult>;
  updateUser(attributes: {
    password: string;
    current_password: string;
  }): Promise<{ error: AuthError }>;
};

export async function changePasswordWithAuth(
  auth: PasswordAuth,
  input: unknown,
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error:
        issue.code === "custom"
          ? issue.message
          : "Preencha as três senhas com 8 a 128 caracteres.",
    };
  }

  const { data, error: sessionError } = await auth.getUser();
  if (sessionError || !data.user?.email)
    return { ok: false, error: "Sua sessão expirou. Entre novamente." };

  // Validate the current password even when the project's password-update
  // policy does not require it. Use only the authenticated user's identity.
  const { data: verified, error: verificationError } =
    await auth.signInWithPassword({
      email: data.user.email,
      password: parsed.data.currentPassword,
    });
  if (verificationError || verified.user?.id !== data.user.id)
    return {
      ok: false,
      error:
        verificationError?.code === "invalid_credentials"
          ? "A senha atual está incorreta. Tente novamente."
          : verificationError?.code === "over_request_rate_limit"
            ? "Muitas tentativas. Aguarde um pouco e tente novamente."
            : "Não foi possível confirmar sua senha atual. Tente novamente.",
    };

  const { error } = await auth.updateUser({
    password: parsed.data.newPassword,
    current_password: parsed.data.currentPassword,
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === "same_password"
          ? "Escolha uma senha diferente da atual."
          : error.code === "weak_password"
            ? "A nova senha não atende aos requisitos de segurança. Use uma senha mais forte."
            : "Não foi possível alterar a senha. Tente novamente.",
    };

  return { ok: true, value: "Senha alterada com sucesso." };
}
