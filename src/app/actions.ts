"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getHousehold, loadSnapshot } from "@/lib/data";
import { MAX_BACKUP_BYTES, parseState, type Snapshot } from "@/lib/finance";
import { credentialsSchema, usernameToIdentity } from "@/lib/credentials";
import { invitationToken } from "@/lib/invitation";

type Result<T> =
  { ok: true; value: T } | { ok: false; error: string; conflict?: boolean };

export async function authenticate(
  mode: "login" | "signup",
  username: string,
  password: string,
): Promise<Result<string>> {
  const parsed = credentialsSchema.safeParse({ mode, username, password });
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Use um usuário com 3 a 32 caracteres (letras sem acento, números, ponto, hífen ou sublinhado), começando com letra ou número, e uma senha com pelo menos 8 caracteres.",
    };
  try {
    const client = await createClient();
    const credentials = {
      email: usernameToIdentity(parsed.data.username),
      password: parsed.data.password,
    };
    if (parsed.data.mode === "signup") {
      const { data, error } = await client.auth.signUp({
        ...credentials,
      });
      if (error)
        return {
          ok: false,
          error:
            error.code === "user_already_exists"
              ? "Esse usuário já está em uso. Escolha outro nome ou entre na sua conta."
              : "Não foi possível criar a conta. Confira os dados e tente novamente.",
        };
      return data.session
        ? { ok: true, value: "authenticated" }
        : {
            ok: false,
            error:
              "O cadastro ainda precisa ser configurado. Tente novamente mais tarde.",
          };
    }
    const { error } = await client.auth.signInWithPassword(credentials);
    return error
      ? {
          ok: false,
          error: "Usuário ou senha incorretos. Tente novamente.",
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
    if (mode !== "create" && mode !== "join")
      return { ok: false, error: "Opção inválida." };
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
    const token = mode === "join" ? invitationToken(value) : null;
    if (mode === "join" && !token)
      return { ok: false, error: "Cole o link ou código completo do convite." };
    const { data, error } =
      mode === "create"
        ? await client.rpc("create_household", { p_name: value.trim() })
        : await client.rpc("join_household", { p_token: token });
    return error
      ? {
          ok: false,
          error:
            mode === "join"
              ? error.message.includes("outro espaço")
                ? "Você já participa de outro espaço. Entre com uma conta que ainda não participa de um espaço."
                : "Convite inválido ou expirado. Peça um novo link."
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
            "Não foi possível gerar o convite. Entre no seu espaço e tente novamente.",
        }
      : { ok: true, value: String(data) };
  } catch {
    return { ok: false, error: "Não foi possível conectar. Tente novamente." };
  }
}
export async function refreshFinance(): Promise<
  Result<{ snapshot: Snapshot; memberCount: number; householdId: string }>
> {
  try {
    const { household } = await getHousehold();
    if (!household)
      return { ok: false, error: "Seu espaço não foi encontrado." };
    return {
      ok: true,
      value: {
        snapshot: await loadSnapshot(household.id),
        memberCount: household.member_count,
        householdId: household.id,
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
  householdId: string,
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
    if (household.id !== householdId)
      return {
        ok: false,
        error:
          "Seu espaço mudou. Exporte as alterações pendentes e abra o app novamente antes de salvar.",
      };
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
