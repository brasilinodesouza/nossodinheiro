import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

type FetchEvent = {
  request: { method: string; mode: string; url: string };
  respondWith(value: Promise<Response>): void;
};
async function worker(fetcher: () => Promise<Response>) {
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const self = {
    location: { origin: "https://nossodinheiro-xi.vercel.app" },
    skipWaiting() {},
    clients: { claim: () => Promise.resolve() },
    addEventListener: (name: string, handler: (event: FetchEvent) => void) =>
      handlers.set(name, handler),
  };
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, fetch: fetcher, Response, URL },
  );
  return handlers;
}
test("service worker não intercepta APIs, salvamentos ou solicitações externas", async () => {
  const handlers = await worker(() => {
    throw new Error("Não deveria acessar a rede neste teste.");
  });
  let intercepted = 0;
  for (const request of [
    {
      method: "POST",
      mode: "navigate",
      url: "https://nossodinheiro-xi.vercel.app/",
    },
    {
      method: "GET",
      mode: "cors",
      url: "https://nossodinheiro-xi.vercel.app/api/version",
    },
    { method: "GET", mode: "navigate", url: "https://another.example/" },
  ])
    handlers.get("fetch")!({
      request,
      respondWith: () => {
        intercepted++;
      },
    });
  assert.equal(intercepted, 0);
});
test("navegação usa a rede; sem conexão, retorna somente orientação sem dados financeiros", async () => {
  for (const online of [true, false]) {
    const handlers = await worker(async () => {
      if (!online) throw new Error("offline");
      return new Response("Resposta atual da rede");
    });
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://nossodinheiro-xi.vercel.app/",
      },
      respondWith(value) {
        response = value;
      },
    });
    const result = await response!;
    const text = await result.text();
    if (online) assert.equal(text, "Resposta atual da rede");
    else {
      assert.equal(result.status, 503);
      assert.equal(result.headers.get("Cache-Control"), "no-store");
      assert.match(text, /Confira sua conexão/);
      assert.doesNotMatch(text, /fin_2026|access_token|refresh_token/);
    }
  }
});
