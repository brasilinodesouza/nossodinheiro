import { z } from "zod";

export const MAX_BACKUP_BYTES = 2_000_000;
export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
export const moneySchema = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9_999_999.99)
  .transform((value) => Math.round(value * 100) / 100);
const nameSchema = z.string().trim().max(100);
export const itemSchema = z.object({
  id: z
    .union([z.string().min(1).max(100), z.number().finite()])
    .transform(String),
  name: nameSchema,
  amount: moneySchema,
  goal: moneySchema.optional(),
});
export const salarySchema = z.object({
  p1name: nameSchema,
  p1gross: moneySchema,
  p1disc: moneySchema,
  p2name: nameSchema,
  p2gross: moneySchema,
  p2disc: moneySchema,
});
export type Item = z.infer<typeof itemSchema>;
export type Salary = z.infer<typeof salarySchema>;
export type FinanceState = Record<string, Salary | Item[]>;
export type ExpenseSection = "fixos" | "variaveis" | "cartao";
export type ListSection = ExpenseSection | "comm_p1" | "comm_p2" | "poupanca";
export type Month = { year: number; month: number };
export type Snapshot = { state: FinanceState; version: number };
export type Household = {
  id: string;
  name: string;
  owner_id: string;
  member_count: number;
};

export function parseState(input: unknown): FinanceState {
  const object = z.record(z.string(), z.unknown()).parse(input);
  if (Object.keys(object).length > 2000)
    throw new Error("O backup tem muitos registros.");
  const result: FinanceState = {};
  for (const [key, raw] of Object.entries(object)) {
    const match =
      /^fin_(\d{4})_(\d{1,2})_(salary|fixos|variaveis|cartao|comm_p1|comm_p2)$/.exec(
        key,
      );
    if (
      key !== "fin_poupanca_objetivos" &&
      (!match ||
        Number(match[1]) < 1900 ||
        Number(match[1]) > 2200 ||
        Number(match[2]) > 11)
    ) {
      throw new Error(`Registro desconhecido no backup: ${key.slice(0, 80)}`);
    }
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    result[key] =
      match?.[3] === "salary"
        ? salarySchema.parse(value)
        : z.array(itemSchema).max(1000).parse(value);
    const parsed = result[key];
    if (
      Array.isArray(parsed) &&
      new Set(parsed.map((item) => item.id)).size !== parsed.length
    )
      throw new Error("O backup contém identificadores repetidos.");
  }
  return result;
}

export function currentMonth(): Month {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === "year")!.value),
    month: Number(parts.find((p) => p.type === "month")!.value) - 1,
  };
}
export function monthKey(month: Month, section: string) {
  return `fin_${month.year}_${month.month}_${section}`;
}
export function previousMonth(month: Month): Month {
  return month.month === 0
    ? { year: month.year - 1, month: 11 }
    : { ...month, month: month.month - 1 };
}
export function listKey(month: Month, section: ListSection) {
  return section === "poupanca"
    ? "fin_poupanca_objetivos"
    : monthKey(month, section);
}

export function getSalary(state: FinanceState, month: Month): Salary {
  const value =
    state[monthKey(month, "salary")] ??
    state[monthKey(previousMonth(month), "salary")];
  return value && !Array.isArray(value)
    ? value
    : { p1name: "", p1gross: 0, p1disc: 0, p2name: "", p2gross: 0, p2disc: 0 };
}
export function getList(
  state: FinanceState,
  month: Month,
  section: ListSection,
): Item[] {
  const value = state[listKey(month, section)];
  if (Array.isArray(value)) return value;
  if (section === "poupanca") return [];
  const previous = state[monthKey(previousMonth(month), section)];
  if (Array.isArray(previous))
    return previous.map((item) => ({
      ...item,
      amount: section === "fixos" ? item.amount : 0,
    }));
  return section === "fixos"
    ? ["Aluguel", "Luz", "Internet", "Água"].map((name, index) => ({
        id: `default-${index}`,
        name,
        amount: 0,
      }))
    : [];
}
export function cents(value: number) {
  return Math.round(value * 100);
}
export function total(items: Item[]) {
  return items.reduce((sum, item) => sum + cents(item.amount), 0) / 100;
}
export function getTotals(state: FinanceState, month: Month) {
  const salary = getSalary(state, month);
  const p1 =
    (cents(salary.p1gross) -
      cents(salary.p1disc) +
      cents(total(getList(state, month, "comm_p1")))) /
    100;
  const p2 =
    (cents(salary.p2gross) -
      cents(salary.p2disc) +
      cents(total(getList(state, month, "comm_p2")))) /
    100;
  const fixed = total(getList(state, month, "fixos")),
    variable = total(getList(state, month, "variaveis")),
    card = total(getList(state, month, "cartao"));
  const income = (cents(p1) + cents(p2)) / 100,
    spent = (cents(fixed) + cents(variable) + cents(card)) / 100;
  return {
    p1,
    p2,
    fixed,
    variable,
    card,
    income,
    spent,
    balance: (cents(income) - cents(spent)) / 100,
    savings: total(getList(state, month, "poupanca")),
  };
}
export function remainingGoals(items: Item[]) {
  return (
    items.reduce(
      (sum, item) =>
        sum + Math.max(0, cents(item.goal ?? 0) - cents(item.amount)),
      0,
    ) / 100
  );
}
export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function demoState(month: Month): FinanceState {
  return {
    [monthKey(month, "salary")]: {
      p1name: "Alex",
      p1gross: 6200,
      p1disc: 850,
      p2name: "Marina",
      p2gross: 4800,
      p2disc: 620,
    },
    [monthKey(month, "comm_p1")]: [
      { id: "bonus", name: "Comissão do mês", amount: 450 },
    ],
    [monthKey(month, "fixos")]: [
      { id: "rent", name: "Aluguel", amount: 1800 },
      { id: "light", name: "Luz", amount: 185.5 },
      { id: "internet", name: "Internet", amount: 119.9 },
      { id: "water", name: "Água", amount: 78 },
    ],
    [monthKey(month, "variaveis")]: [
      { id: "market", name: "Supermercado", amount: 850 },
      { id: "restaurant", name: "Jantar a dois", amount: 160 },
      { id: "transport", name: "Transporte", amount: 220 },
    ],
    [monthKey(month, "cartao")]: [
      { id: "invoice", name: "Fatura do cartão", amount: 780 },
    ],
    fin_poupanca_objetivos: [
      {
        id: "reserve",
        name: "Reserva de emergência",
        amount: 8500,
        goal: 15000,
      },
      { id: "travel", name: "Nossa próxima viagem", amount: 2400, goal: 6000 },
    ],
  };
}
