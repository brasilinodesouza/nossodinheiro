import test from "node:test";
import assert from "node:assert/strict";
import { changePasswordWithAuth } from "../src/lib/password";

const input = {
  currentPassword: "senha-atual-123",
  newPassword: "nova-senha-456",
  confirmPassword: "nova-senha-456",
};
const user = { id: "account-id", email: "conta@example.invalid" };

function fixture({
  sessionUser = user as typeof user | null,
  sessionError = null as { code: string } | null,
  verifiedUser = user as typeof user | null,
  verificationError = null as { code: string } | null,
  updateError = null as { code: string } | null,
} = {}) {
  const calls: { method: string; input?: unknown }[] = [];
  const auth: Parameters<typeof changePasswordWithAuth>[0] = {
    async getUser() {
      calls.push({ method: "getUser" });
      return { data: { user: sessionUser }, error: sessionError };
    },
    async signInWithPassword(credentials) {
      calls.push({ method: "signInWithPassword", input: credentials });
      return { data: { user: verifiedUser }, error: verificationError };
    },
    async updateUser(attributes) {
      calls.push({ method: "updateUser", input: attributes });
      return { error: updateError };
    },
  };
  return { auth, calls };
}

test("a troca valida a sessão e a senha atual antes de atualizar a mesma conta", async () => {
  const { auth, calls } = fixture();
  assert.deepEqual(await changePasswordWithAuth(auth, input), {
    ok: true,
    value: "Senha alterada com sucesso.",
  });
  assert.deepEqual(calls, [
    { method: "getUser" },
    {
      method: "signInWithPassword",
      input: { email: user.email, password: input.currentPassword },
    },
    {
      method: "updateUser",
      input: {
        password: input.newPassword,
        current_password: input.currentPassword,
      },
    },
  ]);
});

test("sessão ausente ou inválida impede qualquer tentativa de alterar a senha", async () => {
  for (const options of [
    { sessionUser: null },
    { sessionError: { code: "session_expired" } },
    { sessionUser: { ...user, email: "" } },
  ]) {
    const { auth, calls } = fixture(options);
    assert.deepEqual(await changePasswordWithAuth(auth, input), {
      ok: false,
      error: "Sua sessão expirou. Entre novamente.",
    });
    assert.deepEqual(calls, [{ method: "getUser" }]);
  }
});

test("senha atual incorreta impede a atualização e mostra uma mensagem clara", async () => {
  const { auth, calls } = fixture({
    verifiedUser: null,
    verificationError: { code: "invalid_credentials" },
  });
  assert.deepEqual(await changePasswordWithAuth(auth, input), {
    ok: false,
    error: "A senha atual está incorreta. Tente novamente.",
  });
  assert.equal(
    calls.some((call) => call.method === "updateUser"),
    false,
  );
});

test("a verificação não pode trocar de identidade nem continuar após uma falha", async () => {
  for (const options of [
    { verifiedUser: { ...user, id: "other-account" } },
    { verifiedUser: null },
    { verificationError: { code: "unexpected_failure" } },
    { verificationError: { code: "over_request_rate_limit" } },
  ]) {
    const { auth, calls } = fixture(options);
    assert.equal((await changePasswordWithAuth(auth, input)).ok, false);
    assert.equal(
      calls.some((call) => call.method === "updateUser"),
      false,
    );
  }
});

test("confirmação divergente e senha igual à atual são rejeitadas no servidor", async () => {
  for (const [value, error] of [
    [
      { ...input, confirmPassword: "outra-senha-789" },
      "A confirmação não corresponde à nova senha.",
    ],
    [
      {
        ...input,
        newPassword: input.currentPassword,
        confirmPassword: input.currentPassword,
      },
      "Escolha uma senha diferente da atual.",
    ],
  ] as const) {
    const { auth, calls } = fixture();
    assert.deepEqual(await changePasswordWithAuth(auth, value), {
      ok: false,
      error,
    });
    assert.deepEqual(calls, []);
  }
});

test("dados adulterados ou senhas fora do limite não chegam ao Supabase", async () => {
  const invalid: unknown[] = [
    null,
    {},
    "senha",
    { ...input, currentPassword: 123 },
  ];
  for (const field of ["currentPassword", "newPassword", "confirmPassword"]) {
    for (const value of ["", "1234567", "x".repeat(129), null]) {
      invalid.push({ ...input, [field]: value });
    }
  }
  for (const value of invalid) {
    const { auth, calls } = fixture();
    assert.equal((await changePasswordWithAuth(auth, value)).ok, false);
    assert.deepEqual(calls, []);
  }
});

test("senhas nos limites e espaços são preservados sem normalização", async () => {
  for (const password of ["12345678", "x".repeat(128), " senha com espaços "]) {
    const { auth, calls } = fixture();
    assert.equal(
      (
        await changePasswordWithAuth(auth, {
          currentPassword: " senha atual ",
          newPassword: password,
          confirmPassword: password,
          email: "outra-conta@example.invalid",
        })
      ).ok,
      true,
    );
    assert.deepEqual(calls[1].input, {
      email: user.email,
      password: " senha atual ",
    });
    assert.deepEqual(calls[2].input, {
      password,
      current_password: " senha atual ",
    });
  }
});

test("falhas ao salvar nunca são informadas como sucesso", async () => {
  for (const [code, error] of [
    ["same_password", "Escolha uma senha diferente da atual."],
    [
      "weak_password",
      "A nova senha não atende aos requisitos de segurança. Use uma senha mais forte.",
    ],
    [
      "unexpected_failure",
      "Não foi possível alterar a senha. Tente novamente.",
    ],
  ]) {
    const { auth } = fixture({ updateError: { code } });
    assert.deepEqual(await changePasswordWithAuth(auth, input), {
      ok: false,
      error,
    });
  }
});
