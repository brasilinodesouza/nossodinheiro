import test from "node:test";
import assert from "node:assert/strict";
import {
  canApplyUpdate,
  mobilePlatform,
  versionFromResponse,
} from "../src/lib/pwa";

test("a atualização aguarda o fim da edição e uma conexão visível", () => {
  assert.equal(canApplyUpdate("old", "new", false, true, true), true);
  assert.equal(canApplyUpdate("old", "new", true, true, true), false);
  assert.equal(canApplyUpdate("old", "new", false, false, true), false);
  assert.equal(canApplyUpdate("old", "new", false, true, false), false);
  assert.equal(canApplyUpdate("current", "current", false, true, true), false);
  assert.equal(canApplyUpdate("old", null, false, true, true), false);
  // Completing a save releases the guard; an available update then applies.
  assert.equal(canApplyUpdate("old", "new", false, true, true), true);
});
test("erro de rede, página de login ou resposta de outro app não provoca recarga", () => {
  for (const value of [
    null,
    "<html>Login</html>",
    {},
    { app: "another", version: "new" },
    { app: "nosso-dinheiro", version: "" },
    { app: "nosso-dinheiro", version: 42 },
    { app: "nosso-dinheiro", version: "<script>" },
  ])
    assert.equal(versionFromResponse(value), null);
  assert.equal(
    versionFromResponse({ app: "nosso-dinheiro", version: "a".repeat(40) }),
    "a".repeat(40),
  );
});
test("iPhone e iPad com agente de desktop recebem instruções Apple", () => {
  assert.equal(mobilePlatform("Mozilla iPhone OS", 1), "ios");
  assert.equal(mobilePlatform("Mozilla Macintosh Safari", 5), "ios");
  assert.equal(mobilePlatform("Mozilla Macintosh Safari", 0), "other");
  assert.equal(mobilePlatform("Mozilla Linux Android Chrome", 5), "android");
});
