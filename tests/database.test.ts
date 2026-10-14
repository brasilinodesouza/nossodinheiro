import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL: espaço compartilhado, isolamento por RLS, convites e conflito de versão", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-4000-8000-000000000001";
  const partner = "00000000-0000-4000-8000-000000000002";
  const outsider = "00000000-0000-4000-8000-000000000003";
  const fourth = "00000000-0000-4000-8000-000000000004";
  const fifth = "00000000-0000-4000-8000-000000000005";
  const sixth = "00000000-0000-4000-8000-000000000006";
  async function asUser(id: string) {
    await db.exec("reset role; set role authenticated;");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
      id,
    ]);
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${owner}'), ('${partner}'), ('${outsider}'), ('${fourth}'), ('${fifth}'), ('${sixth}');`);
    await db.exec(
      await readFile(
        new URL("../supabase/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await asUser(owner);
    const created = await db.query<{ id: string }>(
      "select public.create_household('Nosso lar') as id",
    );
    const household = created.rows[0].id;
    assert.equal(
      (await db.query("select id from public.households")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select invitation_hash from public.households"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.create_household('Segundo')"),
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
      (await db.query("select * from public.finance_states")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select public.join_household($1)", [firstToken]),
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
      (await db.query("select * from public.finance_states")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select public.create_invitation($1)", [household]),
      /Somente o criador/,
    );
    await assert.rejects(
      db.query("update public.households set owner_id = $1", [partner]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.create_household('Outro')"),
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
      db.query("select public.save_finance_state($1, 1, '[]'::jsonb)", [
        household,
      ]),
      /check constraint/,
    );

    await asUser(outsider);
    assert.equal(
      (await db.query("select * from public.finance_states")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select id from public.households")).rows.length,
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
      db.query("select public.join_household($1)", [token]),
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
    await db.query(
      "update public.households set invitation_expires_at = now() - interval '1 day' where id = $1",
      [otherHousehold],
    );
    await asUser(fourth);
    await assert.rejects(
      db.query("select public.join_household($1)", [expiredToken]),
      /inválido/,
    );

    // Two attempts with the same invitation admit exactly one second member.
    await asUser(outsider);
    const singleToken = (
      await db.query<{ token: string }>(
        "select public.create_invitation($1) as token",
        [otherHousehold],
      )
    ).rows[0].token;
    await asUser(fifth);
    await db.query("select public.join_household($1)", [singleToken]);
    await asUser(sixth);
    await assert.rejects(
      db.query("select public.join_household($1)", [singleToken]),
      /inválido/,
    );

    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query("select * from public.finance_states"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.create_household('Anônimo')"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.create_household('Anônimo')"),
      /permission denied/,
    );
    await db.exec("reset role;");
    assert.equal(
      (
        await db.query<{ enabled: number }>(
          "select count(*)::integer as enabled from pg_class where relname in ('households', 'finance_states') and relrowsecurity",
        )
      ).rows[0].enabled,
      2,
    );
  } finally {
    await db.close();
  }
});
