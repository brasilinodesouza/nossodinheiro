"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Heart,
  Home,
  Landmark,
  LogOut,
  PiggyBank,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Brand } from "./auth";
import { InstallButton, useUpdateGuard } from "./app-runtime";
import { invitationLink } from "@/lib/invitation";
import { syncDecision, syncSignal } from "@/lib/sync";
import {
  generateInvitation,
  refreshFinance,
  saveFinance,
  signOut,
} from "@/app/actions";
import {
  MAX_BACKUP_BYTES,
  MONTHS,
  formatMoney as fmt,
  getList,
  getSalary,
  getTotals,
  itemSchema,
  listKey,
  monthKey,
  parseState,
  remainingGoals,
  salarySchema,
  total,
  type ExpenseSection,
  type FinanceState,
  type Household,
  type Item,
  type ListSection,
  type Month,
  type Snapshot,
} from "@/lib/finance";

type Tab = "overview" | "salary" | "expenses" | "savings";
type Editor =
  | { type: "item"; section: ListSection; item?: Item }
  | { type: "salary"; person: "p1" | "p2" }
  | { type: "delete"; section: ListSection; item: Item }
  | { type: "import"; state: FinanceState; filename: string }
  | { type: "settings" };
const EXPENSE_LABELS = {
  fixos: "Custos fixos",
  variaveis: "Custos variáveis",
  cartao: "Cartão de crédito",
};
const SECTION_LABELS: Record<ListSection, string> = {
  ...EXPENSE_LABELS,
  comm_p1: "Comissão / bônus",
  comm_p2: "Comissão / bônus",
  poupanca: "Objetivo de poupança",
};
const NAV = [
  { id: "overview", label: "Visão geral", mobile: "Resumo", icon: Home },
  { id: "salary", label: "Salários", mobile: "Renda", icon: Wallet },
  { id: "expenses", label: "Gastos", mobile: "Gastos", icon: Landmark },
  { id: "savings", label: "Poupança", mobile: "Metas", icon: PiggyBank },
] as const;

function download(state: FinanceState, pending = false) {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `financas_casal${pending ? "_pendente" : ""}_${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Dashboard({
  initialSnapshot,
  household,
  month: initialMonth,
}: {
  initialSnapshot: Snapshot;
  household: Household;
  month: Month;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [month, setMonth] = useState(initialMonth);
  const [tab, setTab] = useState<Tab>("overview");
  const [expenseSection, setExpenseSection] = useState<ExpenseSection>("fixos");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<FinanceState | null>(null);
  const [conflict, setConflict] = useState(false);
  const [memberCount, setMemberCount] = useState(household.member_count);
  const [invitation, setInvitation] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useUpdateGuard(Boolean(editor) || busy || Boolean(pending));
  const state = snapshot.state,
    totals = getTotals(state, month),
    salary = getSalary(state, month);
  const savings = getList(state, month, "poupanca");
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  useEffect(() => {
    let stopped = false;
    let checking = false;
    const controller = new AbortController();
    async function checkData() {
      if (
        checking ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      checking = true;
      try {
        const response = await fetch("/api/sync", {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (
          stopped ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          return;
        const signal = syncSignal(response.status, await response.json());
        if (!signal || stopped) return;
        const decision = syncDecision(
          signal,
          household.id,
          snapshot.version,
          memberCount,
          busyRef.current || Boolean(editor) || Boolean(pending),
        );
        if (decision === "wait") {
          setSyncNotice(
            signal.status === "current"
              ? "Há dados novos no espaço. Eles serão carregados quando você terminar de editar ou salvar."
              : "Sua sessão ou espaço mudou. Exporte as alterações pendentes antes de entrar novamente.",
          );
          return;
        }
        if (decision === "login" || decision === "setup") {
          window.location.replace(decision === "login" ? "/login" : "/");
          return;
        }
        if (decision === "refresh") {
          const result = await refreshFinance();
          if (!stopped && !busyRef.current && result.ok) {
            if (result.value.householdId !== household.id) {
              window.location.replace("/");
              return;
            }
            setSnapshot(result.value.snapshot);
            setMemberCount(result.value.memberCount);
            setMessage("Dados sincronizados com o espaço de vocês.");
          }
        }
        if (!stopped) setSyncNotice("");
      } catch {
        // A network outage must never clear data, drafts, or an authenticated page.
      } finally {
        checking = false;
      }
    }
    const interval = setInterval(() => void checkData(), 15_000);
    document.addEventListener("visibilitychange", checkData);
    window.addEventListener("focus", checkData);
    window.addEventListener("online", checkData);
    void checkData();
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkData);
      window.removeEventListener("focus", checkData);
      window.removeEventListener("online", checkData);
    };
  }, [editor, pending, snapshot.version, memberCount, household.id]);

  async function save(candidate: FinanceState) {
    if (busyRef.current || conflict) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setPending(candidate);
    try {
      const result = await saveFinance(
        candidate,
        snapshot.version,
        household.id,
      );
      if (!result.ok) {
        setError(result.error);
        setConflict(Boolean(result.conflict));
        return false;
      }
      setSnapshot(result.value);
      setPending(null);
      setMessage("Tudo salvo no espaço de vocês.");
      return true;
    } catch {
      setError(
        "A conexão falhou. Suas alterações continuam aqui; tente salvar novamente.",
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function refresh() {
    if (busyRef.current) return;
    if (
      pending &&
      !window.confirm(
        "Há alterações pendentes. Exporte um backup antes de continuar. Atualizar vai descartar essas alterações. Continuar?",
      )
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await refreshFinance();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.householdId !== household.id) {
        window.location.replace("/");
        return;
      }
      setSnapshot(result.value.snapshot);
      setMemberCount(result.value.memberCount);
      setPending(null);
      setConflict(false);
      setEditor(null);
      setMessage("Dados atualizados. Vocês estão na mesma página.");
    } catch {
      setError(
        "Não foi possível atualizar. Confira a conexão e tente novamente.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function changeMonth(delta: number) {
    const index = month.year * 12 + month.month + delta;
    const next = {
      year: Math.floor(index / 12),
      month: ((index % 12) + 12) % 12,
    };
    if (next.year >= 1900 && next.year <= 2200) setMonth(next);
  }
  function openEditor(value: Editor) {
    if (!busy && !pending) {
      setError("");
      setEditor(value);
    }
  }
  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor?.type !== "item") return;
    const form = new FormData(event.currentTarget);
    const parsed = itemSchema.safeParse({
      id: editor.item?.id ?? crypto.randomUUID(),
      name: form.get("name"),
      amount: form.get("amount"),
      ...(editor.section === "poupanca" ? { goal: form.get("goal") || 0 } : {}),
    });
    if (!parsed.success || !parsed.data.name) {
      setError(
        "Confira o nome e os valores. Use valores entre R$ 0 e R$ 9.999.999,99.",
      );
      return;
    }
    const list = getList(state, month, editor.section);
    const items = editor.item
      ? list.map((item) => (item.id === editor.item!.id ? parsed.data : item))
      : [...list, parsed.data];
    if (await save({ ...state, [listKey(month, editor.section)]: items }))
      setEditor(null);
  }
  async function saveSalary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editor?.type !== "salary") return;
    const form = new FormData(event.currentTarget),
      person = editor.person;
    const parsed = salarySchema.safeParse({
      ...salary,
      [`${person}name`]: form.get("name"),
      [`${person}gross`]: form.get("gross"),
      [`${person}disc`]: form.get("disc"),
    });
    if (!parsed.success) {
      setError("Confira os valores. Use valores entre R$ 0 e R$ 9.999.999,99.");
      return;
    }
    if (await save({ ...state, [monthKey(month, "salary")]: parsed.data }))
      setEditor(null);
  }
  async function removeItem() {
    if (editor?.type !== "delete") return;
    const candidate = {
      ...state,
      [listKey(month, editor.section)]: getList(
        state,
        month,
        editor.section,
      ).filter((item) => item.id !== editor.item.id),
    };
    if (await save(candidate)) setEditor(null);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Escolha um backup com até 2 MB.");
      const imported = parseState(JSON.parse(await file.text()));
      if (!Object.keys(imported).length)
        throw new Error("Esse backup está vazio.");
      setEditor({ type: "import", state: imported, filename: file.name });
      setError("");
    } catch (err) {
      setError(
        err instanceof Error && !err.message.includes("[")
          ? err.message
          : "O arquivo não é um backup válido do Nosso Dinheiro.",
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  async function invite() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await generateInvitation();
      if (!result.ok) setError(result.error);
      else setInvitation(invitationLink(window.location.origin, result.value));
    } catch {
      setError("Não foi possível gerar o convite. Tente novamente.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invitation);
      setMessage("Link copiado. Envie para quem vai participar do espaço.");
    } catch {
      setError("Selecione e copie o link abaixo.");
    }
  }
  async function shareInvite() {
    if (!navigator.share) return copyInvite();
    try {
      await navigator.share({
        title: "Convite para o Nosso Dinheiro",
        text: "Participe do nosso espaço financeiro. Todos os participantes podem visualizar e editar os dados.",
        url: invitation,
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setError("Não foi possível compartilhar. Use Copiar link.");
    }
  }
  const period = `${MONTHS[month.month]} de ${month.year}`;

  return (
    <div className="app-shell">
      <header className="app-header">
        <Brand />
        <div className="header-tools">
          <span className="household-label">
            <Heart size={14} />
            {household.name}
          </span>
          <button
            className="icon-button"
            aria-label="Convidar parceiro(a)"
            title="Convidar parceiro(a)"
            onClick={() => openEditor({ type: "settings" })}
            disabled={busy || Boolean(pending)}
          >
            <Users size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="Atualizar dados"
            title="Atualizar dados do casal"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw size={19} className={busy ? "spin" : ""} />
          </button>
          <button
            className="icon-button"
            aria-label="Configurações e backup"
            title="Configurações e backup"
            onClick={() => {
              setError("");
              setEditor({ type: "settings" });
            }}
            disabled={busy}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>
      <nav className="main-nav" aria-label="Navegação principal">
        {NAV.map(({ id, label, mobile, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "active" : ""}
          >
            <Icon size={19} />
            <span className="desktop-label">{label}</span>
            <span className="mobile-label">{mobile}</span>
          </button>
        ))}
        <span className="nav-note">
          <Users size={14} /> Construindo juntos
        </span>
      </nav>
      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {tab === "overview"
                ? "O ESPAÇO DE VOCÊS"
                : tab === "salary"
                  ? "CADA CONTRIBUIÇÃO CONTA"
                  : tab === "expenses"
                    ? "CUIDAR DO PRESENTE"
                    : "SONHAR COM O FUTURO"}
            </span>
            <h1>
              {tab === "overview"
                ? "Tudo em equilíbrio."
                : tab === "salary"
                  ? "Nossa renda."
                  : tab === "expenses"
                    ? "Contas sob controle."
                    : "Nossos próximos passos."}
            </h1>
            <p>
              {tab === "overview"
                ? "Um olhar para o mês, um passo para os seus planos."
                : tab === "salary"
                  ? "Salários, descontos e todas as conquistas do mês."
                  : tab === "expenses"
                    ? "Cada gasto no seu lugar, sem perder a visão do todo."
                    : "O que vocês guardam hoje aproxima o amanhã."}
            </p>
          </div>
          {tab !== "savings" && (
            <div className="month-picker">
              <button
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <label className="sr-only" htmlFor="month">
                Mês de referência
              </label>
              <input
                id="month"
                type="month"
                min="1900-01"
                max="2200-12"
                value={`${month.year}-${String(month.month + 1).padStart(2, "0")}`}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/^\d{4}-\d{2}$/.test(value)) {
                    const [year, m] = value.split("-").map(Number);
                    if (year >= 1900 && year <= 2200 && m >= 1 && m <= 12)
                      setMonth({ year, month: m - 1 });
                  }
                }}
              />
              <button
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
        </div>
        <div className="sync-line">
          <span className="sync-dot" />
          {busy
            ? "Conectando…"
            : pending
              ? "Há alterações pendentes"
              : `Dados carregados · ${memberCount > 1 ? `${memberCount} pessoas no espaço` : "convide seu parceiro ou parceira"}`}
          <span className="sync-period">
            {tab === "savings" ? "Saldo real · independente do mês" : period}
          </span>
        </div>
        {syncNotice && (
          <p className="feedback" role="status">
            {syncNotice}
          </p>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {pending && (
          <div className="pending-actions">
            <button
              className="button secondary"
              onClick={() => download(pending, true)}
            >
              <Download size={16} /> Exportar alterações pendentes
            </button>
            {conflict ? (
              <button
                className="button secondary"
                onClick={refresh}
                disabled={busy}
              >
                Atualizar dados
              </button>
            ) : (
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  if (await save(pending)) setEditor(null);
                }}
              >
                Tentar salvar novamente
              </button>
            )}
          </div>
        )}
        {message && (
          <p className="feedback" role="status">
            <Check size={15} />
            {message}
          </p>
        )}

        {tab === "overview" && (
          <>
            <div className="summary-grid">
              <Metric
                label="Renda do casal"
                value={totals.income}
                hint="Salários líquidos + comissões"
                color="gold"
                icon={<ArrowDownLeft size={19} />}
              />
              <Metric
                label="Gastos do mês"
                value={totals.spent}
                hint="Fixos, variáveis e cartão"
                color="pink"
                icon={<ArrowUpRight size={19} />}
              />
              <Metric
                label="Saldo disponível"
                value={totals.balance}
                hint={
                  totals.balance < 0
                    ? "Os gastos superaram a renda"
                    : "Após os gastos do mês"
                }
                color={totals.balance < 0 ? "red" : "green"}
                icon={<Wallet size={19} />}
              />
              <Metric
                label="Total guardado"
                value={totals.savings}
                hint="Saldo atual da poupança"
                color="blue"
                icon={<PiggyBank size={19} />}
              />
            </div>
            <div className="overview-grid">
              <Distribution totals={totals} />
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">VISÃO DO MÊS</span>
                    <h2>Renda e gastos</h2>
                  </div>
                  <BarChart3 size={20} className="muted" />
                </div>
                <div className="bar-chart">
                  {[
                    { label: "Renda", value: totals.income, color: "gold" },
                    { label: "Fixos", value: totals.fixed, color: "pink" },
                    {
                      label: "Variáveis",
                      value: totals.variable,
                      color: "blue",
                    },
                    {
                      label: "Cartão",
                      value: totals.card,
                      color: "gold-muted",
                    },
                  ].map((row) => (
                    <div className="chart-row" key={row.label}>
                      <div>
                        <span>{row.label}</span>
                        <strong>{fmt(row.value)}</strong>
                      </div>
                      <div className="chart-track">
                        <div
                          className={`chart-fill bg-${row.color}`}
                          style={{
                            width: `${Math.min(100, (Math.max(0, row.value) / Math.max(1, totals.income, totals.fixed, totals.variable, totals.card)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="chart-caption">
                  A poupança mostra o saldo acumulado e não é descontada da
                  renda mensal.
                </p>
              </section>
            </div>
            <div className="section-heading">
              <h2>Os planos de vocês</h2>
              <button className="text-link" onClick={() => setTab("savings")}>
                Ver todas as metas <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="goal-grid">
              {savings.length ? (
                savings.slice(0, 3).map((item) => (
                  <GoalCard
                    item={item}
                    key={item.id}
                    onEdit={() => {
                      setTab("savings");
                      openEditor({ type: "item", section: "poupanca", item });
                    }}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <PiggyBank size={28} />
                  <h3>Todo sonho começa com um passo.</h3>
                  <p>
                    Crie a primeira meta para acompanhar o que vocês já
                    guardaram.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setTab("savings");
                      openEditor({ type: "item", section: "poupanca" });
                    }}
                  >
                    <Plus size={16} />
                    Criar uma meta
                  </button>
                </div>
              )}
            </div>
            <div className="couple-note">
              <Heart size={17} />
              <span>
                Vocês não precisam ter tudo resolvido. Só precisam seguir
                juntos.
              </span>
            </div>
          </>
        )}

        {tab === "salary" && (
          <>
            <div className="salary-grid">
              {(["p1", "p2"] as const).map((person, i) => (
                <section className="panel salary-panel" key={person}>
                  <div className="panel-title">
                    <div className="person-title">
                      <span
                        className={`person-avatar ${i === 0 ? "gold" : "blue"}`}
                      >
                        {(salary[`${person}name`] || String(i + 1))
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <div>
                        <span className="eyebrow">PESSOA {i + 1}</span>
                        <h2>{salary[`${person}name`] || `Pessoa ${i + 1}`}</h2>
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => openEditor({ type: "salary", person })}
                      disabled={busy || Boolean(pending)}
                      aria-label={`Editar salário da pessoa ${i + 1}`}
                    >
                      <Edit3 size={18} />
                    </button>
                  </div>
                  <dl className="salary-breakdown">
                    <div>
                      <dt>Salário bruto</dt>
                      <dd>{fmt(salary[`${person}gross`])}</dd>
                    </div>
                    <div>
                      <dt>Descontos</dt>
                      <dd className="pink">− {fmt(salary[`${person}disc`])}</dd>
                    </div>
                    <div>
                      <dt>Salário líquido</dt>
                      <dd>
                        {fmt(
                          salary[`${person}gross`] - salary[`${person}disc`],
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="commission-heading">
                    <h3>Comissões e bônus</h3>
                    <button
                      className="text-link"
                      disabled={busy || Boolean(pending)}
                      onClick={() =>
                        openEditor({ type: "item", section: `comm_${person}` })
                      }
                    >
                      <Plus size={15} /> Adicionar
                    </button>
                  </div>
                  <ItemList
                    items={getList(state, month, `comm_${person}`)}
                    section={`comm_${person}`}
                    disabled={busy || Boolean(pending)}
                    edit={(item) =>
                      openEditor({
                        type: "item",
                        section: `comm_${person}`,
                        item,
                      })
                    }
                    remove={(item) =>
                      openEditor({
                        type: "delete",
                        section: `comm_${person}`,
                        item,
                      })
                    }
                    compact
                  />
                  <div className="salary-total">
                    <span>Total recebido</span>
                    <strong className={i === 0 ? "gold" : "blue"}>
                      {fmt(person === "p1" ? totals.p1 : totals.p2)}
                    </strong>
                  </div>
                  <button
                    className="button secondary full"
                    disabled={busy || Boolean(pending)}
                    onClick={() => openEditor({ type: "salary", person })}
                  >
                    <Edit3 size={15} />
                    Editar salário
                  </button>
                </section>
              ))}
            </div>
            <div className="summary-grid two">
              <Metric
                label="Renda total do casal"
                value={totals.income}
                color="green"
                hint="A soma das contribuições de vocês"
                icon={<Users size={19} />}
              />
              <Metric
                label="Saldo disponível"
                value={totals.balance}
                color={totals.balance < 0 ? "red" : "gold"}
                hint="Renda total menos os gastos do mês"
                icon={<Wallet size={19} />}
              />
            </div>
            <p className="helper-text">
              No mês seguinte, salários e nomes são sugeridos a partir do mês
              anterior; as comissões começam zeradas.
            </p>
          </>
        )}

        {tab === "expenses" && (
          <>
            <div className="summary-grid three">
              {(["fixos", "variaveis", "cartao"] as const).map((section, i) => (
                <Metric
                  key={section}
                  label={EXPENSE_LABELS[section]}
                  value={total(getList(state, month, section))}
                  color={["pink", "blue", "gold"][i]}
                  hint="Total do mês selecionado"
                />
              ))}
            </div>
            <div
              className="segmented expense-tabs"
              role="group"
              aria-label="Categoria de gastos"
            >
              {(["fixos", "variaveis", "cartao"] as const).map((section) => (
                <button
                  className={expenseSection === section ? "active" : ""}
                  key={section}
                  onClick={() => setExpenseSection(section)}
                >
                  {section === "fixos"
                    ? "Fixos"
                    : section === "variaveis"
                      ? "Variáveis"
                      : "Cartão"}
                </button>
              ))}
            </div>
            <section className="panel expenses-panel">
              <div className="panel-title">
                <div>
                  <span className="eyebrow">{period.toUpperCase()}</span>
                  <h2>{EXPENSE_LABELS[expenseSection]}</h2>
                </div>
                <button
                  className="button primary"
                  disabled={busy || Boolean(pending)}
                  onClick={() =>
                    openEditor({ type: "item", section: expenseSection })
                  }
                >
                  <Plus size={17} />
                  <span>Adicionar</span>
                </button>
              </div>
              <ItemList
                items={getList(state, month, expenseSection)}
                section={expenseSection}
                disabled={busy || Boolean(pending)}
                edit={(item) =>
                  openEditor({ type: "item", section: expenseSection, item })
                }
                remove={(item) =>
                  openEditor({ type: "delete", section: expenseSection, item })
                }
              />
              <div className="list-total">
                <span>
                  Total {EXPENSE_LABELS[expenseSection].toLowerCase()}
                </span>
                <strong>
                  {fmt(total(getList(state, month, expenseSection)))}
                </strong>
              </div>
            </section>
            <p className="helper-text">
              {expenseSection === "fixos"
                ? "As contas e os valores do mês anterior são sugeridos para facilitar sua rotina."
                : expenseSection === "cartao"
                  ? "Registre o total das faturas ou suas compras. Use um único critério para evitar contar o mesmo gasto duas vezes."
                  : "As descrições do mês anterior são sugeridas com valores zerados."}
            </p>
          </>
        )}

        {tab === "savings" && (
          <>
            <div className="summary-grid three">
              <Metric
                label="Total guardado"
                value={totals.savings}
                color="green"
                hint="Soma dos saldos atuais"
                icon={<PiggyBank size={19} />}
              />
              <Metric
                label="Total das metas"
                value={total(
                  savings.map((item) => ({ ...item, amount: item.goal ?? 0 })),
                )}
                color="blue"
                hint="Todos os objetivos de vocês"
              />
              <Metric
                label="Falta para as metas"
                value={remainingGoals(savings)}
                color="gold"
                hint="O que falta em cada objetivo"
              />
            </div>
            <div className="section-heading">
              <h2>Cada meta, uma conquista</h2>
              <button
                className="button primary"
                disabled={busy || Boolean(pending)}
                onClick={() =>
                  openEditor({ type: "item", section: "poupanca" })
                }
              >
                <Plus size={16} />
                Nova meta
              </button>
            </div>
            <div className="goal-grid">
              {savings.length ? (
                savings.map((item) => (
                  <GoalCard
                    item={item}
                    key={item.id}
                    onEdit={() =>
                      openEditor({ type: "item", section: "poupanca", item })
                    }
                    onRemove={() =>
                      openEditor({ type: "delete", section: "poupanca", item })
                    }
                    disabled={busy || Boolean(pending)}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <PiggyBank size={32} />
                  <h3>Qual é o próximo sonho?</h3>
                  <p>
                    Uma reserva, uma viagem ou um novo começo. Adicione uma meta
                    para dar o primeiro passo.
                  </p>
                </div>
              )}
            </div>
            <p className="helper-text">
              Atualize o saldo real de cada objetivo. A poupança é independente
              do mês selecionado e não altera o saldo mensal.
            </p>
          </>
        )}
        <footer className="app-footer">
          <Brand />
          <span>Feito para a vida que vocês dividem.</span>
        </footer>
      </main>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Importar arquivo de backup"
        onChange={(e) => void importFile(e.target.files?.[0])}
      />

      {editor && (
        <Modal
          title={
            editor.type === "settings"
              ? "O espaço de vocês"
              : editor.type === "salary"
                ? "Editar salário"
                : editor.type === "delete"
                  ? "Remover registro?"
                  : editor.type === "import"
                    ? "Importar seu backup"
                    : `${editor.item ? "Editar" : "Adicionar"} ${SECTION_LABELS[editor.section].toLowerCase()}`
          }
          busy={busy}
          close={() => setEditor(null)}
        >
          {editor.type === "item" && (
            <form onSubmit={saveItem}>
              <label>
                Nome
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editor.item?.name ?? ""}
                  placeholder={
                    editor.section === "poupanca"
                      ? "Ex.: Nossa viagem"
                      : "Ex.: Internet"
                  }
                />
              </label>
              <MoneyField
                name="amount"
                label={
                  editor.section === "poupanca"
                    ? "Saldo atual (R$)"
                    : "Valor (R$)"
                }
                value={editor.item?.amount ?? 0}
              />
              {editor.section === "poupanca" && (
                <MoneyField
                  name="goal"
                  label="Meta (R$) · opcional"
                  value={editor.item?.goal ?? 0}
                />
              )}
              <p className="helper-text">
                {editor.section === "poupanca"
                  ? "O saldo vale para todos os meses."
                  : `Esse registro será salvo em ${period.toLowerCase()}.`}
              </p>
              <DialogFeedback error={error} conflict={conflict} />
              <button
                className="button primary full"
                disabled={busy || conflict}
              >
                {busy ? "Salvando…" : "Salvar"}
                <Check size={16} />
              </button>
            </form>
          )}
          {editor.type === "salary" && (
            <form onSubmit={saveSalary}>
              <label>
                Nome
                <input
                  name="name"
                  maxLength={100}
                  defaultValue={salary[`${editor.person}name`]}
                  placeholder={`Pessoa ${editor.person === "p1" ? 1 : 2}`}
                />
              </label>
              <MoneyField
                name="gross"
                label="Salário bruto (R$)"
                value={salary[`${editor.person}gross`]}
              />
              <MoneyField
                name="disc"
                label="Descontos (R$)"
                value={salary[`${editor.person}disc`]}
              />
              <p className="helper-text">
                Salário líquido = bruto − descontos. As comissões são
                adicionadas separadamente.
              </p>
              <DialogFeedback error={error} conflict={conflict} />
              <button
                className="button primary full"
                disabled={busy || conflict}
              >
                {busy ? "Salvando…" : "Salvar salário"}
                <Check size={16} />
              </button>
            </form>
          )}
          {editor.type === "delete" && (
            <>
              <p>
                Você vai remover{" "}
                <strong>{editor.item.name || "este registro"}</strong> de{" "}
                {editor.section === "poupanca"
                  ? "seus objetivos"
                  : period.toLowerCase()}
                . Valor: {fmt(editor.item.amount)}.
              </p>
              <DialogFeedback error={error} conflict={conflict} />
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </button>
                <button
                  className="button danger"
                  disabled={busy || conflict}
                  onClick={removeItem}
                >
                  {busy ? "Removendo…" : "Remover"}
                  <Trash2 size={15} />
                </button>
              </div>
            </>
          )}
          {editor.type === "import" && (
            <>
              <p>
                <strong>{editor.filename}</strong> contém{" "}
                {Object.keys(editor.state).length} conjuntos de dados. A
                importação substitui todos os meses e as metas atuais do espaço
                de vocês.
              </p>
              <p>Antes de continuar, guarde uma cópia dos dados atuais.</p>
              <button
                className="button secondary full"
                onClick={() => download(state)}
              >
                <Download size={16} />
                Exportar dados atuais
              </button>
              <DialogFeedback error={error} conflict={conflict} />
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy || conflict}
                  onClick={async () => {
                    if (editor.type === "import" && (await save(editor.state)))
                      setEditor(null);
                  }}
                >
                  {busy ? "Importando…" : "Substituir e importar"}
                </button>
              </div>
            </>
          )}
          {editor.type === "settings" && (
            <div className="settings-content">
              <div className="settings-summary">
                <Users size={23} className="gold" />
                <div>
                  <strong>{household.name}</strong>
                  <p>
                    {`${memberCount} ${memberCount === 1 ? "pessoa participa" : "pessoas participam"} deste espaço. Todos podem visualizar e editar os dados financeiros.`}
                  </p>
                </div>
              </div>
              <section className="settings-section">
                <h3>Convidar parceiro(a)</h3>
                <p>
                  Envie o link para as pessoas que vão participar. Elas entram
                  ou criam uma conta com usuário e senha e aceitam o convite.
                  Todos podem visualizar, adicionar, editar e excluir os
                  registros financeiros, além de convidar outras pessoas.
                </p>
                <p>
                  O link vale por 7 dias e aceita várias pessoas. Gerar outro
                  link invalida o anterior.
                </p>
                <button
                  className="button secondary full"
                  disabled={busy}
                  onClick={invite}
                >
                  <Heart size={16} />
                  {invitation
                    ? "Gerar novo link de convite"
                    : "Gerar link de convite"}
                </button>
                {invitation && (
                  <>
                    <label>
                      Link do convite
                      <textarea
                        readOnly
                        value={invitation}
                        onFocus={(e) => e.target.select()}
                        rows={3}
                      />
                    </label>
                    <button
                      className="button secondary full"
                      onClick={copyInvite}
                    >
                      <Copy size={16} />
                      Copiar link
                    </button>
                    <button
                      className="button secondary full"
                      onClick={shareInvite}
                    >
                      <Share2 size={16} /> Compartilhar convite
                    </button>
                    <small>
                      Compartilhe apenas com quem terá acesso completo aos
                      dados.
                    </small>
                  </>
                )}
              </section>
              <section className="settings-section">
                <h3>Seus dados, sempre com vocês</h3>
                <p>
                  Exporte todos os meses e as metas. Você também pode importar o
                  backup do seu app anterior.
                </p>
                <button
                  className="button secondary full"
                  onClick={() => download(pending ?? state, Boolean(pending))}
                >
                  <Download size={16} />
                  {pending
                    ? "Exportar alterações pendentes"
                    : "Exportar backup"}
                </button>
                <button
                  className="button secondary full"
                  disabled={busy || Boolean(pending)}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={16} />
                  Importar backup
                </button>
              </section>
              <section className="settings-section">
                <h3>Leve para a tela inicial</h3>
                <InstallButton />
                <p>
                  No Android, abra o menu do Chrome e escolha “Instalar app” ou
                  “Adicionar à tela inicial”. No iPhone, use Compartilhar no
                  Safari → “Adicionar à Tela de Início”.
                </p>
                <small>
                  O app precisa de internet para carregar e salvar seus dados.
                </small>
              </section>
              <DialogFeedback error={error} conflict={conflict} />
              {message && (
                <p className="feedback" role="status">
                  {message}
                </p>
              )}
              <form action={signOut}>
                <button className="button secondary full">
                  <LogOut size={16} />
                  Sair da conta
                </button>
              </form>
            </div>
          )}
          {pending && editor.type !== "settings" && (
            <div className="dialog-recovery">
              <button
                className="text-link"
                onClick={() => download(pending, true)}
              >
                Exportar alterações pendentes
              </button>
              {conflict && (
                <button className="text-link" disabled={busy} onClick={refresh}>
                  Atualizar dados e tentar novamente
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  color,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  color: string;
  icon?: ReactNode;
}) {
  return (
    <section className={`metric ${color}`}>
      <div className="metric-top">
        <span>{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong>{fmt(value)}</strong>
      <small>{hint}</small>
    </section>
  );
}
function ItemList({
  items,
  section,
  edit,
  remove,
  disabled,
  compact = false,
}: {
  items: Item[];
  section: ListSection;
  edit: (item: Item) => void;
  remove: (item: Item) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  if (!items.length)
    return (
      <div className={compact ? "compact-empty" : "empty-state"}>
        {compact ? (
          "Nenhuma comissão neste mês."
        ) : (
          <>
            <Landmark size={27} />
            <h3>Nenhum registro por aqui.</h3>
            <p>
              Adicione o primeiro gasto de{" "}
              {SECTION_LABELS[section].toLowerCase()}.
            </p>
          </>
        )}
      </div>
    );
  return (
    <ul className={`item-list ${compact ? "compact" : ""}`}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            className="item-main"
            onClick={() => edit(item)}
            disabled={disabled}
            aria-label={`Editar ${item.name || "registro"}`}
          >
            <span className="item-symbol">
              {section.startsWith("comm") ? (
                <Plus size={15} />
              ) : section === "fixos" ? (
                <Home size={16} />
              ) : section === "cartao" ? (
                <Wallet size={16} />
              ) : (
                <ArrowUpRight size={16} />
              )}
            </span>
            <span className="item-name">{item.name || "Sem nome"}</span>
            <strong>{fmt(item.amount)}</strong>
            <Edit3 className="edit-hint" size={14} />
          </button>
          <button
            className="icon-button delete-button"
            aria-label={`Remover ${item.name || "registro"}`}
            disabled={disabled}
            onClick={() => remove(item)}
          >
            <Trash2 size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
function GoalCard({
  item,
  onEdit,
  onRemove,
  disabled = false,
}: {
  item: Item;
  onEdit: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const percent = item.goal
    ? Math.min(100, (item.amount / item.goal) * 100)
    : 0;
  return (
    <section className="goal-card">
      <div className="goal-top">
        <span className="goal-icon">
          <PiggyBank size={21} />
        </span>
        <div className="goal-tools">
          <button
            className="icon-button"
            disabled={disabled}
            onClick={onEdit}
            aria-label={`Editar ${item.name}`}
          >
            <Edit3 size={16} />
          </button>
          {onRemove && (
            <button
              className="icon-button delete-button"
              disabled={disabled}
              onClick={onRemove}
              aria-label={`Remover ${item.name}`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <h3>{item.name || "Nossa meta"}</h3>
      <strong className="goal-value">{fmt(item.amount)}</strong>
      <span className="goal-target">
        {item.goal ? `de ${fmt(item.goal)}` : "Sem meta definida"}
      </span>
      <div
        className="goal-progress"
        role="progressbar"
        aria-label={item.name || "Meta de poupança"}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="goal-bottom">
        <span>
          {item.goal
            ? percent >= 100
              ? "Meta conquistada!"
              : `${Math.round(percent)}% do caminho`
            : "Um passo de cada vez"}
        </span>
        <span>
          {item.goal && percent < 100 ? (
            `Faltam ${fmt(Math.max(0, item.goal - item.amount))}`
          ) : (
            <Heart size={13} />
          )}
        </span>
      </div>
    </section>
  );
}
function Distribution({ totals }: { totals: ReturnType<typeof getTotals> }) {
  const fixed = totals.spent ? (totals.fixed / totals.spent) * 100 : 0;
  const variable = totals.spent ? (totals.variable / totals.spent) * 100 : 0;
  const used = totals.income > 0 ? (totals.spent / totals.income) * 100 : 0;
  const background = totals.spent
    ? `conic-gradient(var(--pink) 0 ${fixed}%, var(--blue) ${fixed}% ${fixed + variable}%, var(--gold) ${fixed + variable}% 100%)`
    : "var(--border)";
  return (
    <section className="panel distribution-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">PARA ONDE FOI?</span>
          <h2>Distribuição dos gastos</h2>
        </div>
        <span className="small-badge">
          {totals.income > 0
            ? `${Math.round(used)}% da renda`
            : totals.spent
              ? "Renda não informada"
              : "Comece por aqui"}
        </span>
      </div>
      <div className="distribution-body">
        <div className="donut" style={{ background }} aria-hidden="true">
          <div>
            <span>GASTOS DO MÊS</span>
            <strong>{fmt(totals.spent)}</strong>
            <small>
              {totals.spent ? "Cada escolha conta" : "Um novo começo"}
            </small>
          </div>
        </div>
        <ul className="chart-legend">
          {[
            { label: "Custos fixos", value: totals.fixed, color: "pink" },
            { label: "Variáveis", value: totals.variable, color: "blue" },
            { label: "Cartão", value: totals.card, color: "gold" },
          ].map((row) => (
            <li key={row.label}>
              <span className={`legend-dot bg-${row.color}`} />
              <div>
                <span>{row.label}</span>
                <strong>{fmt(row.value)}</strong>
              </div>
              <small>
                {totals.spent
                  ? Math.round((row.value / totals.spent) * 100)
                  : 0}
                %
              </small>
            </li>
          ))}
        </ul>
      </div>
      {totals.balance < 0 && (
        <p className="form-error">
          Os gastos ultrapassaram a renda em {fmt(-totals.balance)}.
        </p>
      )}
    </section>
  );
}
function MoneyField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="number"
        inputMode="decimal"
        min="0"
        max="9999999.99"
        step="0.01"
        required
        defaultValue={value}
      />
    </label>
  );
}
function DialogFeedback({
  error,
  conflict,
}: {
  error: string;
  conflict: boolean;
}) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
      {conflict &&
        " Use as opções abaixo para guardar suas alterações e atualizar."}
    </p>
  ) : null;
}
function Modal({
  title,
  children,
  close,
  busy,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-title">
        <h2 id="dialog-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          disabled={busy}
          aria-label="Fechar janela"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
