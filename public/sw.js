/* Network-only worker: financial pages, sessions and API data are never cached. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nosso Dinheiro — Sem conexão</title><style>body{background:#101117;color:#efedf2;font:16px Arial,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:350px;padding:28px;text-align:center}h1{font:30px Georgia,serif;color:#e8c97e}p{color:#9a9aad;line-height:1.8}button{background:#e8c97e;border:0;border-radius:10px;padding:14px 22px;font:16px Arial,sans-serif;margin-top:12px}</style></head><body><main><h1>Vamos reconectar?</h1><p>O Nosso Dinheiro precisa de internet para abrir e salvar seus dados. Confira sua conexão e tente novamente.</p><button onclick="location.reload()">Tentar novamente</button></main></body></html>`, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })));
});
