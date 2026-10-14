import test from "node:test";
import assert from "node:assert/strict";
import { isSessionInvalid, syncDecision, syncSignal } from "../src/lib/sync";

test("limite de requisições e indisponibilidade do serviço não equivalem a logout", () => {
  assert.equal(
    isSessionInvalid({ name: "AuthSessionMissingError", status: 400 }),
    true,
  );
  assert.equal(
    isSessionInvalid({ code: "refresh_token_not_found", status: 400 }),
    true,
  );
  assert.equal(isSessionInvalid({ status: 401 }), true);
  for (const status of [408, 429, 500, 503])
    assert.equal(isSessionInvalid({ status }), false);
});

const householdId = "00000000-0000-4000-8000-000000000001";
const current = {
  status: "current" as const,
  householdId,
  version: 2,
  memberCount: 2,
};
test("mudanças no banco sincronizam sem depender de um commit, inclusive participantes", () => {
  assert.equal(syncDecision(current, householdId, 1, 2, false), "refresh");
  assert.equal(syncDecision(current, householdId, 2, 1, false), "refresh");
  assert.equal(syncDecision(current, householdId, 2, 2, false), "none");
  assert.equal(
    syncDecision({ ...current, version: 1 }, householdId, 2, 2, false),
    "none",
  );
});
test("sessão ou espaço apagados pedem novo acesso; formulários e salvamentos são preservados", () => {
  assert.equal(
    syncDecision({ status: "signed-out" }, householdId, 1, 1, false),
    "login",
  );
  assert.equal(
    syncDecision({ status: "no-space" }, householdId, 1, 1, false),
    "setup",
  );
  assert.equal(
    syncDecision(current, "00000000-0000-4000-8000-000000000002", 1, 1, false),
    "setup",
  );
  for (const signal of [
    current,
    { status: "signed-out" as const },
    { status: "no-space" as const },
  ])
    assert.equal(syncDecision(signal, householdId, 1, 1, true), "wait");
});
test("falhas de rede, páginas HTML e respostas inesperadas não encerram sessões", () => {
  for (const [status, body] of [
    [503, { app: "nosso-dinheiro", status: "unavailable" }],
    [401, "<html>Login</html>"],
    [401, { app: "another", status: "signed-out" }],
    [200, { app: "nosso-dinheiro", ...current, version: -1 }],
  ] as const)
    assert.equal(syncSignal(status, body), null);
  assert.deepEqual(
    syncSignal(200, { app: "nosso-dinheiro", ...current }),
    current,
  );
  assert.deepEqual(
    syncSignal(401, { app: "nosso-dinheiro", status: "signed-out" }),
    { status: "signed-out" },
  );
});
