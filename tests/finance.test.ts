import test from "node:test";
import assert from "node:assert/strict";
import {
  getList,
  getSalary,
  getTotals,
  monthKey,
  parseState,
  previousMonth,
  remainingGoals,
  total,
} from "../src/lib/finance";

test("backup legado ignora somente listas mensais de poupança vazias e preserva os objetivos", () => {
  const goals = [{ id: 1, name: "Reserva", amount: 200, goal: 1000 }];
  assert.deepEqual(
    parseState({
      fin_2026_4_poupanca: [],
      fin_2026_5_poupanca: "[]",
      fin_poupanca_objetivos: goals,
    }),
    { fin_poupanca_objetivos: [{ ...goals[0], id: "1" }] },
  );
  assert.throws(
    () => parseState({ fin_2026_4_poupanca: goals }),
    /poupança mensal antiga/,
  );
  assert.throws(() => parseState({ fin_2026_12_poupanca: [] }), /desconhecido/);
});

test("valores monetários são somados em centavos", () => {
  assert.equal(
    total([
      { id: "a", name: "A", amount: 0.1 },
      { id: "b", name: "B", amount: 0.2 },
    ]),
    0.3,
  );
});
test("renda inclui comissões; poupança não é descontada do saldo mensal", () => {
  const month = { year: 2026, month: 9 };
  const state = parseState({
    [monthKey(month, "salary")]: {
      p1name: "A",
      p1gross: 2000,
      p1disc: 100,
      p2name: "B",
      p2gross: 1000,
      p2disc: 200,
    },
    [monthKey(month, "comm_p1")]: [{ id: 1, name: "Bônus", amount: 300 }],
    [monthKey(month, "fixos")]: [{ id: 2, name: "Aluguel", amount: 800 }],
    fin_poupanca_objetivos: [
      { id: 3, name: "Reserva", amount: 5000, goal: 10000 },
    ],
  });
  assert.equal(getTotals(state, month).income, 3000);
  assert.equal(getTotals(state, month).balance, 2200);
  assert.equal(getTotals(state, month).savings, 5000);
});
test("transição dezembro-janeiro herda fixos e zera comissões e gastos variáveis", () => {
  const january = { year: 2027, month: 0 },
    december = previousMonth(january);
  assert.deepEqual(december, { year: 2026, month: 11 });
  const state = parseState({
    [monthKey(december, "salary")]: {
      p1name: "Ana",
      p1gross: "3000",
      p1disc: "",
      p2name: "",
      p2gross: "",
      p2disc: "",
    },
    [monthKey(december, "fixos")]: [{ id: 1, name: "Luz", amount: 120 }],
    [monthKey(december, "variaveis")]: [{ id: 2, name: "Lazer", amount: 200 }],
    [monthKey(december, "cartao")]: [{ id: 3, name: "Fatura", amount: 400 }],
    [monthKey(december, "comm_p1")]: [{ id: 4, name: "Bônus", amount: 100 }],
  });
  assert.equal(getList(state, january, "fixos")[0].amount, 120);
  for (const section of ["variaveis", "cartao", "comm_p1"] as const)
    assert.equal(getList(state, january, section)[0].amount, 0);
  assert.equal(getSalary(state, january).p1name, "Ana");
  assert.equal(getSalary(state, january).p1gross, 3000);
  const next = { ...state, [monthKey(january, "fixos")]: [] };
  assert.deepEqual(getList(next, january, "fixos"), []);
});
test("o backup original aceita IDs numéricos e valores serializados", () => {
  const legacy = {
    fin_2026_9_fixos: JSON.stringify([
      { id: 0.12345, name: 'Conta com "aspas" <script>', amount: 1.25 },
    ]),
  };
  const parsed = parseState(legacy);
  assert.equal(
    getList(parsed, { year: 2026, month: 9 }, "fixos")[0].id,
    "0.12345",
  );
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(parsed))), parsed);
});
test("backups inválidos e valores negativos são rejeitados", () => {
  for (const value of [
    null,
    [],
    { fin_2026_12_fixos: [] },
    { fin_2026_9_outra: [] },
    { fin_2026_9_fixos: [{ id: 1, name: "A", amount: -1 }] },
    {
      fin_2026_9_fixos: [
        { id: 1, name: "A", amount: 0 },
        { id: 1, name: "B", amount: 1 },
      ],
    },
  ])
    assert.throws(() => parseState(value));
});
test("meta excedida não reduz o valor que falta para outros objetivos", () => {
  assert.equal(
    remainingGoals([
      { id: "a", name: "Meta A", amount: 200, goal: 100 },
      { id: "b", name: "Meta B", amount: 50, goal: 100 },
    ]),
    50,
  );
});
