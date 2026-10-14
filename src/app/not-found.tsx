import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Esse caminho não existe.</h1>
        <Link className="button primary" href="/">
          Abrir Nosso Dinheiro
        </Link>
      </section>
    </main>
  );
}
