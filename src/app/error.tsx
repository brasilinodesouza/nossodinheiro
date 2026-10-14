"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Vamos tentar de novo?</h1>
        <p>
          Não foi possível abrir seus dados. Confira a conexão e a configuração
          do banco.
        </p>
        <button className="button primary" onClick={reset}>
          Tentar novamente
        </button>
        <Link className="text-link" href="/login">
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}
