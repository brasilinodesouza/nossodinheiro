"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Heart,
  ShieldCheck,
  Wallet,
  Users,
  Mail,
} from "lucide-react";
import {
  authenticate,
  requestPasswordReset,
  resetPassword,
  setupHousehold,
  signOut,
} from "@/app/actions";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Wallet size={23} strokeWidth={1.6} />
      </span>
      <div>
        Nosso <em>Dinheiro</em>
        <small>FINANÇAS A DOIS</small>
      </div>
    </div>
  );
}

export function AuthForm({
  configured,
  linkError = false,
}: {
  configured: boolean;
  linkError?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    linkError
      ? "Este link expirou ou já foi utilizado. Entre na sua conta ou solicite outro e-mail."
      : "",
  );
  const [failed, setFailed] = useState(linkError);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result =
        mode === "forgot"
          ? await requestPasswordReset(email)
          : await authenticate(mode, email, password);
      if (!result.ok) {
        setFailed(true);
        setMessage(result.error);
      } else if (result.value === "authenticated") {
        router.replace("/");
        router.refresh();
      } else {
        setFailed(false);
        setMessage(result.value);
      }
    } catch {
      setFailed(true);
      setMessage("Não foi possível conectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  function changeMode(next: typeof mode) {
    setMode(next);
    setMessage("");
  }
  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <section className="auth-intro">
          <Brand />
          <span className="eyebrow">
            <Heart size={14} /> MAIS PLANOS. MENOS PREOCUPAÇÃO.
          </span>
          <h1>
            O dinheiro é de vocês.
            <br />
            <em>Os sonhos também.</em>
          </h1>
          <p>
            Um lugar para organizar as contas, acompanhar a renda e construir o
            próximo capítulo, juntos.
          </p>
          <div className="auth-features">
            <span>
              <Users size={18} /> Um espaço compartilhado
            </span>
            <span>
              <ShieldCheck size={18} /> Cada um com sua conta
            </span>
          </div>
          <div className="intro-note">
            Pequenas escolhas de hoje.
            <br />
            <strong>Grandes conquistas a dois.</strong>
          </div>
        </section>
        <section className="auth-card">
          <span className="eyebrow">BEM-VINDOS AO NOSSO DINHEIRO</span>
          <h2>
            {mode === "signup"
              ? "Comecem por aqui"
              : mode === "forgot"
                ? "Recupere sua senha"
                : "Seu cantinho financeiro"}
          </h2>
          <p>
            {mode === "signup"
              ? "Crie sua conta e convide a pessoa que divide a vida com você."
              : mode === "forgot"
                ? "Enviaremos um link para o seu e-mail."
                : "Entre para cuidar dos planos de vocês."}
          </p>
          {!configured && (
            <div className="notice">
              A conexão do app ainda precisa ser configurada. Você pode conhecer
              as telas com dados de exemplo abaixo.
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                required
                maxLength={254}
                disabled={busy || !configured}
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Senha
                <input
                  type="password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Pelo menos 8 caracteres"
                  disabled={busy || !configured}
                />
              </label>
            )}
            {message && (
              <p
                className={failed ? "form-error" : "form-success"}
                role="status"
              >
                {message}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || !configured}
            >
              {busy
                ? "Aguarde…"
                : mode === "signup"
                  ? "Criar minha conta"
                  : mode === "forgot"
                    ? "Enviar link"
                    : "Entrar"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === "login" && (
            <button className="text-link" onClick={() => changeMode("forgot")}>
              Esqueci minha senha
            </button>
          )}
          <p className="auth-switch">
            {mode === "login"
              ? "Primeira vez por aqui? "
              : "Já tem uma conta? "}
            <button
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Criar conta" : "Entrar"}
            </button>
          </p>
          <div className="auth-divider">
            <span>CONHEÇA O APP</span>
          </div>
          <Link className="button secondary full" href="/demo">
            Explorar demonstração <ArrowRight size={16} />
          </Link>
          <small className="privacy-note">
            Seus dados financeiros ficam no espaço de vocês.
          </small>
        </section>
      </div>
    </main>
  );
}

export function HouseholdSetup({ email }: { email: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [value, setValue] = useState("Nosso cantinho");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await setupHousehold(mode, value);
      if (result.ok) {
        router.replace("/");
        router.refresh();
      } else setError(result.error);
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <Brand />
        <h1>Um espaço para vocês</h1>
        <p>
          Você está conectado como {email}. Se a outra pessoa já criou o espaço,
          entre com o convite dela.
        </p>
        <div className="segmented">
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => {
              setMode("create");
              setValue("Nosso cantinho");
              setError("");
            }}
          >
            Criar espaço
          </button>
          <button
            className={mode === "join" ? "active" : ""}
            onClick={() => {
              setMode("join");
              setValue("");
              setError("");
            }}
          >
            Tenho um convite
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            {mode === "create" ? "Nome do espaço" : "Código do convite"}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              maxLength={mode === "create" ? 80 : 64}
              autoComplete="off"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy
              ? "Aguarde…"
              : mode === "create"
                ? "Criar nosso espaço"
                : "Entrar no espaço"}
            <ArrowRight size={17} />
          </button>
        </form>
        <form action={signOut}>
          <button className="text-link">Sair da conta</button>
        </form>
      </section>
    </main>
  );
}

export function PasswordRecovery() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      const result = await resetPassword(password);
      setSuccess(result.ok);
      setMessage(result.ok ? result.value : result.error);
    } catch {
      setMessage("Não foi possível conectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Mail className="gold" />
        <h1>Uma nova senha</h1>
        <p>Escolha uma senha com pelo menos 8 caracteres.</p>
        <form onSubmit={submit}>
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {message && (
            <p
              className={success ? "form-success" : "form-error"}
              role="status"
            >
              {message}
            </p>
          )}
          <button disabled={busy || success} className="button primary full">
            {busy ? "Aguarde…" : "Salvar nova senha"}
          </button>
        </form>
        <Link className="text-link" href={success ? "/" : "/login"}>
          {success ? "Abrir meu espaço" : "Voltar ao login"}
        </Link>
      </section>
    </main>
  );
}
