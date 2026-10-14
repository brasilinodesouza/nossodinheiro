import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL: espaço compartilhado, isolamento por RLS, convites e conflito de versão", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-4000-8000-000000000001";
  const partner = "00000000-0000-4000-8000-000000000002";
  const outsider = "00000000-0000-4000-8000-000000000003";
  const fourth = "00000000-0000-4000-8000-000000000004";
  const fifth = "00000000-0000-4000-8000-000000000005";
  const sixth = "00000000-0000-4000-8000-000000000006";
  const legacyOwner = "00000000-0000-4000-8000-000000000007";
  const legacyPartner = "00000000-0000-4000-8000-000000000008";
  async function asUser(id: string) {
    await db.exec("reset role; set role authenticated;");
    await db.query<Record<string, unknown>>(
      "select set_config('request.jwt.claim.sub', $1, false)",
      [id],
    );
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${owner}'), ('${partner}'), ('${outsider}'), ('${fourth}'), ('${fifth}'), ('${sixth}'), ('${legacyOwner}'), ('${legacyPartner}');`);
    const migrationsDirectory = new URL(
      "../supabase/migrations/",
      import.meta.url,
    );
    const migrations = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    assert.ok(migrations.length > 0);
    let legacyHousehold = "";
    const legacyState = {
      fin_2026_9_fixos: [{ id: "legacy", name: "Aluguel", amount: 850 }],
    };
    for (const [index, migration] of migrations.entries()) {
      await db.exec(
        await readFile(new URL(migration, migrationsDirectory), "utf8"),
      );
      if (index === 0) {
        legacyHousehold = (
          await db.query<{ id: string }>(
            "insert into public.households (name, owner_id, partner_id) values ('Espaço existente', $1, $2) returning id",
            [legacyOwner, legacyPartner],
          )
        ).rows[0].id;
        await db.query<Record<string, unknown>>(
          "insert into public.finance_states (household_id, state) values ($1, $2::jsonb)",
          [legacyHousehold, JSON.stringify(legacyState)],
        );
      }
    }
    for (const member of [legacyOwner, legacyPartner]) {
      await asUser(member);
      assert.deepEqual(
        (
          await db.query<{ state: unknown }>(
            "select state from public.finance_states",
          )
        ).rows[0].state,
        legacyState,
      );
      assert.equal(
        (
          await db.query<{ count: number }>(
            "select public.household_member_count($1) as count",
            [legacyHousehold],
          )
        ).rows[0].count,
        2,
      );
    }
    await asUser(owner);
    const created = await db.query<{ id: string }>(
      "select public.create_household('Nosso lar') as id",
    );
    const household = created.rows[0].id;
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select id from public.households",
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select invitation_hash from public.households",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select public.create_household('Segundo')",
      ),
      /já faz parte/,
    );
    const firstToken = (
      await db.query<{ token: string }>(
        "select public.create_invitation($1) as token",
        [household],
      )
    ).rows[0].token;
    const token = (
      await db.query<{ token: string }>(
        "select public.create_invitation($1) as token",
        [household],
      )
    ).rows[0].token;
    assert.match(token, /^[a-f0-9]{64}$/);

    await asUser(partner);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.finance_states",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.join_household($1)", [
        firstToken,
      ]),
      /inválido/,
    );
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select public.join_household($1) as id",
          [token],
        )
      ).rows[0].id,
      household,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.finance_states",
        )
      ).rows.length,
      1,
    );
    const sharedToken = (
      await db.query<{ token: string }>(
        "select public.create_invitation($1) as token",
        [household],
      )
    ).rows[0].token;
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "update public.households set owner_id = $1",
        [partner],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select public.create_household('Outro')",
      ),
      /já faz parte/,
    );

    const state = {
      fin_2026_9_fixos: [{ id: "test", name: "Luz", amount: 120 }],
    };
    assert.equal(
      (
        await db.query<{ version: number }>(
          "select public.save_finance_state($1, 0, $2::jsonb) as version",
          [household, JSON.stringify(state)],
        )
      ).rows[0].version,
      1,
    );
    await asUser(owner);
    assert.equal(
      (
        await db.query<{ version: number | null }>(
          "select public.save_finance_state($1, 0, '{}'::jsonb) as version",
          [household],
        )
      ).rows[0].version,
      null,
    );
    assert.deepEqual(
      (
        await db.query<{ state: unknown }>(
          "select state from public.finance_states",
        )
      ).rows[0].state,
      state,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select public.save_finance_state($1, 1, '[]'::jsonb)",
        [household],
      ),
      /check constraint/,
    );

    // A third member can see every category and replace/remove any record.
    await asUser(fourth);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.join_household($1) as id",
          [sharedToken],
        )
      ).rows[0].id,
      household,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.join_household($1) as id",
          [sharedToken],
        )
      ).rows[0].id,
      household,
    );
    const editedState = {
      fin_2026_9_salary: {
        p1name: "A",
        p1gross: 2500,
        p1disc: 100,
        p2name: "B",
        p2gross: 3000,
        p2disc: 0,
      },
      fin_2026_9_variaveis: [{ id: "market", name: "Mercado", amount: 300 }],
      fin_2026_9_cartao: [{ id: "card", name: "Compra", amount: 50 }],
      fin_2026_9_comm_p1: [{ id: "bonus", name: "Bônus", amount: 100 }],
      fin_2026_9_comm_p2: [],
      fin_poupanca_objetivos: [
        { id: "goal", name: "Viagem", amount: 500, goal: 4000 },
      ],
    };
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.save_finance_state($1, 1, $2::jsonb) as version",
          [household, JSON.stringify(editedState)],
        )
      ).rows[0].version,
      2,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "insert into public.household_members (household_id,user_id) values ($1,$2)",
        [household, outsider],
      ),
      /permission denied/,
    );
    await asUser(owner);
    assert.deepEqual(
      (
        await db.query<{ state: unknown }>(
          "select state from public.finance_states",
        )
      ).rows[0].state,
      editedState,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.household_member_count($1) as count",
          [household],
        )
      ).rows[0].count,
      3,
    );

    await asUser(outsider);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.finance_states",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select id from public.households",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ version: number | null }>(
          "select public.save_finance_state($1, 1, '{}'::jsonb) as version",
          [household],
        )
      ).rows[0].version,
      null,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select public.household_member_count($1)",
        [household],
      ),
      /não participa/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.create_invitation($1)", [
        household,
      ]),
      /não participa/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.join_household($1)", [
        token,
      ]),
      /inválido/,
    );
    const otherHousehold = (
      await db.query<{ id: string }>(
        "select public.create_household('Outro casal') as id",
      )
    ).rows[0].id;
    const expiredToken = (
      await db.query<{ token: string }>(
        "select public.create_invitation($1) as token",
        [otherHousehold],
      )
    ).rows[0].token;
    await db.exec("reset role;");
    await db.query<Record<string, unknown>>(
      "update public.households set invitation_expires_at = now() - interval '1 day' where id = $1",
      [otherHousehold],
    );
    await asUser(fourth);
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.join_household($1)", [
        expiredToken,
      ]),
      /inválido/,
    );

    // The same current link admits several people, without a two-person limit.
    await asUser(outsider);
    const singleToken = (
      await db.query<{ token: string }>(
        "select public.create_invitation($1) as token",
        [otherHousehold],
      )
    ).rows[0].token;
    await asUser(fifth);
    await db.query<Record<string, unknown>>(
      "select public.join_household($1)",
      [singleToken],
    );
    await asUser(sixth);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.join_household($1) as id",
          [singleToken],
        )
      ).rows[0].id,
      otherHousehold,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.household_member_count($1) as count",
          [otherHousehold],
        )
      ).rows[0].count,
      3,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.save_finance_state($1, 0, '{}'::jsonb) as version",
          [household],
        )
      ).rows[0].version,
      null,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select public.save_finance_state($1, 0, '{}'::jsonb) as version",
          [otherHousehold],
        )
      ).rows[0].version,
      1,
    );
    await asUser(fourth);
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.join_household($1)", [
        singleToken,
      ]),
      /outro espaço/,
    );

    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query<Record<string, unknown>>("select * from public.finance_states"),
      /permission denied/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select household_id from public.household_members",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.join_household($1)", [
        singleToken,
      ]),
      /permission denied/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select public.create_household('Anônimo')",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query<Record<string, unknown>>(
        "select private.create_household('Anônimo')",
      ),
      /permission denied/,
    );
    await db.exec("reset role;");
    assert.equal(
      (
        await db.query<{ enabled: number }>(
          "select count(*)::integer as enabled from pg_class where relname in ('households', 'finance_states', 'household_members') and relrowsecurity",
        )
      ).rows[0].enabled,
      3,
    );
  } finally {
    await db.close();
  }
});
