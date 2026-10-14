import test from "node:test";
import assert from "node:assert/strict";
import {
  credentialsSchema,
  identityToUsername,
  usernameToIdentity,
} from "../src/lib/credentials";

test("cadastro e login identificam o mesmo usuário independentemente de maiúsculas", () => {
  const signup = credentialsSchema.parse({
    mode: "signup",
    username: " Brasilino_Neto ",
    password: " senha com espaços ",
  });
  const login = credentialsSchema.parse({
    mode: "login",
    username: "brasilino_neto",
    password: " senha com espaços ",
  });
  assert.equal(
    usernameToIdentity(signup.username),
    usernameToIdentity(login.username),
  );
  assert.equal(signup.password, " senha com espaços ");
  assert.equal(
    identityToUsername(usernameToIdentity(signup.username)),
    "brasilino_neto",
  );
});

test("identificadores não aceitam endereço pessoal, Unicode, espaços internos ou usuário fora do limite", () => {
  for (const username of [
    "ab",
    "a".repeat(33),
    "a@exemplo.com",
    "José",
    "a b",
    "a\nb",
    ".abc",
    "a+bc",
    "a/bc",
  ]) {
    assert.equal(
      credentialsSchema.safeParse({
        mode: "signup",
        username,
        password: "abcdefgh",
      }).success,
      false,
      username,
    );
  }
  for (const username of ["abc", "a.b-c_d", "abc..", "a".repeat(32)]) {
    assert.equal(
      credentialsSchema.safeParse({
        mode: "signup",
        username,
        password: "abcdefgh",
      }).success,
      true,
      username,
    );
    const identity = usernameToIdentity(username);
    assert.ok(identity.split("@")[0].length <= 64);
    assert.equal(identityToUsername(identity), username);
  }
  assert.notEqual(usernameToIdentity("ab.c"), usernameToIdentity("a.bc"));
  assert.equal(identityToUsername("pessoa@exemplo.com"), "sua conta");
  assert.equal(identityToUsername(undefined), "sua conta");
});

test("a validação no servidor rejeita operação adulterada e senha fora do limite", () => {
  for (const password of ["1234567", "x".repeat(129), null]) {
    assert.equal(
      credentialsSchema.safeParse({ mode: "login", username: "abc", password })
        .success,
      false,
    );
  }
  assert.equal(
    credentialsSchema.safeParse({
      mode: "forgot",
      username: "abc",
      password: "abcdefgh",
    }).success,
    false,
  );
});
