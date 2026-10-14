import test from "node:test";
import assert from "node:assert/strict";
import { invitationLink, invitationToken } from "../src/lib/invitation";

test("o link preserva o convite no fragmento, sem enviar o código na URL HTTP", () => {
  const token = "ab".repeat(32);
  const link = invitationLink("https://nossodinheiro-xi.vercel.app", token);
  const url = new URL(link);
  assert.equal(url.pathname, "/convite");
  assert.equal(url.search, "");
  assert.equal(url.hash, `#${token}`);
  assert.equal(invitationToken(link), token);
  assert.equal(invitationToken(` ${token} `), token);
});

test("convites incompletos, protocolos inadequados e URLs de outras telas são rejeitados", () => {
  for (const value of [
    "",
    "abc",
    "ab".repeat(33),
    "zz".repeat(32),
    `https://exemplo.com/login#${"ab".repeat(32)}`,
    `javascript:alert(1)#${"ab".repeat(32)}`,
    "x".repeat(2049),
  ])
    assert.equal(invitationToken(value), null);
  assert.throws(() => invitationLink("https://exemplo.com", "abc"));
});
