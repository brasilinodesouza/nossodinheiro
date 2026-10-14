"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUpdateGuard } from "./app-runtime";
import { ArrowRight, Heart, ShieldCheck, Wallet, Users } from "lucide-react";
import { authenticate, setupHousehold, signOut } from "@/app/actions";
import { invitationToken } from "@/lib/invitation";

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
  invited = false,
}: {
  configured: boolean;
  invited?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useUpdateGuard(busy || Boolean(username) || Boolean(password));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await authenticate(mode, username, password);
      if (!result.ok) {
        setFailed(true);
        setMessage(result.error);
      } else if (result.value === "authenticated") {
        router.replace(invited ? `/convite${window.location.hash}` : "/");
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
            {mode === "signup" ? "Comecem por aqui" : "Seu cantinho financeiro"}
          </h2>
          <p>
            {mode === "signup"
              ? "Escolha seu usuário e senha para começar. Depois, convide a pessoa que divide a vida com você."
              : "Entre com seu usuário e senha para cuidar dos planos de vocês."}
          </p>
          {!configured && (
            <div className="notice">
              A conexão do app ainda precisa ser configurada para criar sua
              conta e salvar os dados.
            </div>
          )}
          {invited && (
            <div className="notice">
              Você recebeu um convite para compartilhar um espaço financeiro.
              Entre ou crie sua conta; depois, aceite o convite para visualizar
              e editar os dados junto com os outros participantes.
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Login
              <input
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                type="text"
                value={username}
                placeholder="Digite seu login"
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]*"
                title="3 a 32 caracteres: letras sem acento, números, ponto, hífen ou sublinhado. Comece com letra ou número."
                disabled={busy || !configured}
              />
            </label>
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
            {mode === "signup" && (
              <small className="privacy-note">
                Use letras sem acento e números no usuário. Ponto, hífen e
                sublinhado também são aceitos.
              </small>
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
                  : "Entrar"}
              <ArrowRight size={17} />
            </button>
          </form>
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
          <small className="privacy-note">
            Seus dados financeiros ficam no espaço de vocês.
          </small>
        </section>
      </div>
    </main>
  );
}

export function HouseholdSetup({ username }: { username: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [value, setValue] = useState("Nosso cantinho");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useUpdateGuard(busy || editing);
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
          Você está conectado como {username}. Se a outra pessoa já criou o
          espaço, entre com o convite dela.
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
            {mode === "create" ? "Nome do espaço" : "Link ou código do convite"}
            <input
              value={value}
              onChange={(e) => {
                setEditing(true);
                setValue(e.target.value);
              }}
              required
              maxLength={mode === "create" ? 80 : 2048}
              autoComplete="off"
            />
          </label>
          {mode === "join" && (
            <p>
              Ao aceitar, você poderá visualizar, adicionar, editar e excluir
              todos os registros financeiros deste espaço.
            </p>
          )}
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
                : "Aceitar convite e participar"}
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

function subscribeInvitationHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function readInvitationHash() {
  return window.location.hash.slice(1);
}
function emptyInvitationHash() {
  return "";
}

export function InvitationAcceptance({
  currentSpace,
}: {
  currentSpace?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const hash = useSyncExternalStore(
    subscribeInvitationHash,
    readInvitationHash,
    emptyInvitationHash,
  );
  const value = draft ?? hash;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useUpdateGuard(busy || draft !== null);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitationToken(value)) {
      setError("Cole um link ou código de convite válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await setupHousehold("join", value);
      if (!result.ok) setError(result.error);
      else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("Não foi possível aceitar o convite. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-card setup-card">
        <Brand />
        <h1>Um convite para participar</h1>
        {currentSpace ? (
          <>
            <p>
              Você já participa de <strong>{currentSpace}</strong>. Cada conta
              participa de um espaço. Se este convite é para outro espaço,
              abra-o com uma conta que ainda não participa.
            </p>
            <Link href="/" className="button primary full">
              Abrir meu espaço <ArrowRight size={17} />
            </Link>
          </>
        ) : (
          <>
            <p>
              Ao aceitar, você terá acesso completo ao espaço: poderá
              visualizar, adicionar, editar e excluir todos os registros
              financeiros, importar e exportar backups e convidar outras
              pessoas.
            </p>
            <form onSubmit={accept}>
              <label>
                Link ou código do convite
                <textarea
                  value={value}
                  onChange={(e) => setDraft(e.target.value)}
                  required
                  maxLength={2048}
                  rows={3}
                  disabled={busy}
                  autoComplete="off"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? "Aguarde…" : "Aceitar convite e participar"}
                <ArrowRight size={17} />
              </button>
            </form>
            <Link href="/" className="text-link">
              Voltar sem aceitar
            </Link>
          </>
        )}
        <form action={signOut}>
          <button className="text-link">Sair da conta</button>
        </form>
      </section>
    </main>
  );
}
