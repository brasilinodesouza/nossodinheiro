"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getHousehold, loadSnapshot } from "@/lib/data";
import { MAX_BACKUP_BYTES, parseState, type Snapshot } from "@/lib/finance";

type Result<T> =
  { ok: true; value: T } | { ok: false; error: string; conflict?: boolean };
const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export async function authenticate(
  mode: "login" | "signup",
  email: string,
  password: string,
): Promise<Result<string>> {
  const parsed = credentialsSchema.safeParse({ email: email.trim(), password });
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.",
    };
  try {
    const client = await createClient();
    if (mode === "signup") {
      const origin = (await headers()).get("origin");
      const { data, error } = await client.auth.signUp({
        ...parsed.data,
        options: origin
          ? { emailRedirectTo: `${origin}/auth/callback` }
          : undefined,
      });
      if (error)
        return {
          ok: false,
          error:
            error.code === "over_email_send_rate_limit"
              ? "Aguarde alguns minutos antes de solicitar outro e-mail."
              : "Não foi possível criar a conta. Confira os dados e tente novamente.",
        };
      return {
        ok: true,
        value: data.session
          ? "authenticated"
          : "Confira seu e-mail e confirme a conta antes de entrar.",
      };
    }
    const { error } = await client.auth.signInWithPassword(parsed.data);
    return error
      ? {
          ok: false,
          error:
            error.code === "email_not_confirmed"
              ? "Confirme sua conta pelo e-mail recebido antes de entrar."
              : "E-mail ou senha incorretos. Tente novamente.",
        }
      : { ok: true, value: "authenticated" };
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível conectar. Confira a configuração do Supabase e tente novamente.",
    };
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<Result<string>> {
  if (!z.email().safeParse(email.trim()).success)
    return { ok: false, error: "Informe um e-mail válido." };
  try {
    const origin = (await headers()).get("origin");
    if (!origin)
      return {
        ok: false,
        error: "Abra o app pelo navegador para recuperar sua senha.",
      };
    const client = await createClient();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/callback?next=/recuperar`,
    });
    return error
      ? {
          ok: false,
          error:
            "Não foi possível solicitar o e-mail. Aguarde e tente novamente.",
        }
      : {
          ok: true,
          value:
            "Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha.",
        };
  } catch {
    return { ok: false, error: "Não foi possível conectar. Tente novamente." };
  }
}
export async function resetPassword(password: string): Promise<Result<string>> {
  if (password.length < 8 || password.length > 128)
    return { ok: false, error: "Use uma senha com 8 a 128 caracteres." };
  try {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return {
        ok: false,
        error: "O link expirou. Solicite um novo e-mail de recuperação.",
      };
    const { error } = await client.auth.updateUser({ password });
    return error
      ? {
          ok: false,
          error:
            "Não foi possível atualizar. Escolha uma senha diferente e tente novamente.",
        }
      : { ok: true, value: "Senha atualizada. Você já pode abrir o app." };
  } catch {
    return { ok: false, error: "Não foi possível conectar. Tente novamente." };
  }
}
export async function signOut() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw new Error("Não foi possível sair. Tente novamente.");
  redirect("/login");
}
export async function setupHousehold(
  mode: "create" | "join",
  value: string,
): Promise<Result<string>> {
  try {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return { ok: false, error: "Sua sessão expirou. Entre novamente." };
    if (
      mode === "create" &&
      (value.trim().length < 1 || value.trim().length > 80)
    )
      return { ok: false, error: "Use um nome com até 80 caracteres." };
    if (mode === "join" && !/^[a-f0-9]{64}$/.test(value.trim()))
      return { ok: false, error: "Cole o código completo do convite." };
    const { data, error } =
      mode === "create"
        ? await client.rpc("create_household", { p_name: value.trim() })
        : await client.rpc("join_household", { p_token: value.trim() });
    return error
      ? {
          ok: false,
          error:
            mode === "join"
              ? "Convite inválido, expirado ou já utilizado. Peça um novo código."
              : "Não foi possível criar o espaço. Confira se o banco está configurado ou se você já participa de um espaço.",
        }
      : { ok: true, value: String(data) };
  } catch {
    return { ok: false, error: "Não foi possível conectar. Tente novamente." };
  }
}
export async function generateInvitation(): Promise<Result<string>> {
  try {
    const { household } = await getHousehold();
    if (!household) return { ok: false, error: "Crie seu espaço primeiro." };
    const client = await createClient();
    const { data, error } = await client.rpc("create_invitation", {
      p_household_id: household.id,
    });
    return error
      ? {
          ok: false,
          error:
            "Não foi possível gerar o convite. Apenas o criador de um espaço com vaga pode convidar.",
        }
      : { ok: true, value: String(data) };
  } catch {
    return { ok: false, error: "Não foi possível conectar. Tente novamente." };
  }
}
export async function refreshFinance(): Promise<
  Result<{ snapshot: Snapshot; partnered: boolean }>
> {
  try {
    const { household } = await getHousehold();
    if (!household)
      return { ok: false, error: "Seu espaço não foi encontrado." };
    return {
      ok: true,
      value: {
        snapshot: await loadSnapshot(household.id),
        partnered: Boolean(household.partner_id),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Não foi possível atualizar.",
    };
  }
}
export async function saveFinance(
  input: unknown,
  version: number,
): Promise<Result<Snapshot>> {
  try {
    if (!Number.isSafeInteger(version) || version < 0)
      return { ok: false, error: "Versão inválida. Atualize os dados." };
    const state = parseState(input);
    if (Buffer.byteLength(JSON.stringify(state), "utf8") > MAX_BACKUP_BYTES)
      return { ok: false, error: "Os dados ultrapassam o limite de 2 MB." };
    const { household } = await getHousehold();
    if (!household)
      return { ok: false, error: "Seu espaço não foi encontrado." };
    const client = await createClient();
    const { data, error } = await client.rpc("save_finance_state", {
      p_household_id: household.id,
      p_expected_version: version,
      p_state: state,
    });
    if (error)
      return {
        ok: false,
        error:
          "Não foi possível salvar. Suas alterações continuam nesta tela; tente novamente.",
      };
    if (data === null)
      return {
        ok: false,
        conflict: true,
        error:
          "Os dados mudaram no outro celular. Exporte as alterações pendentes e atualize antes de salvar novamente.",
      };
    return {
      ok: true,
      value: { state, version: z.number().int().parse(data) },
    };
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível salvar. Confira os dados, sua conexão e sua sessão.",
    };
  }
}
