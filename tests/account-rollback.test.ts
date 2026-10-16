import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { usernameToIdentity } from "../src/lib/credentials";

test("remoção da estrutura de e-mail preserva contas e impede perder um login que use e-mail real", async () => {
  const db = new PGlite();
  const id = "00000000-0000-4000-8000-000000000001";
  const identity = usernameToIdentity("cliente");
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema private;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    `);
    await db.query("insert into auth.users (id, email) values ($1, $2)", [
      id,
      identity,
    ]);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261016115809_account_logins_email_recovery.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const rollback = await readFile(
      new URL(
        "../supabase/migrations/20261016121647_remove_email_recovery.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.query(
      "update auth.users set email = 'cliente@exemplo.com' where id = $1",
      [id],
    );
    await assert.rejects(db.exec(rollback), /Existem contas com e-mail real/);
    assert.deepEqual(
      (await db.query("select username from public.account_logins")).rows,
      [{ username: "cliente" }],
    );
    await db.query("update auth.users set email = $1 where id = $2", [
      identity,
      id,
    ]);
    await db.exec(rollback);
    assert.deepEqual(
      (await db.query("select id, email from auth.users")).rows,
      [{ id, email: identity }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select to_regclass('public.account_logins') as registry",
        )
      ).rows,
      [{ registry: null }],
    );
    await db.query("insert into auth.users (id, email) values ($1, $2)", [
      "00000000-0000-4000-8000-000000000002",
      usernameToIdentity("novo_cliente"),
    ]);
  } finally {
    await db.close();
  }
});
