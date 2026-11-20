// PostgreSQL embarcado (PGlite) com o mínimo do Supabase: papéis anon/authenticated, auth.users e auth.uid().
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = (p: string) => readFileSync(new URL(`../../db/${p}`, import.meta.url), 'utf8')

export type Role = 'anon' | 'authenticated' | null

export async function createDb() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  await db.exec(sql('migrations/001_schema.sql'))
  await db.exec(sql('migrations/002_security.sql'))
  await db.exec(sql('seed/001_catalogo_original.sql'))

  /** Executa como o papel/usuário dado (RLS ativa). role=null → superusuário (apenas para preparar/verificar). */
  async function run<T = any>(role: Role, uid: string | null, text: string, params: unknown[] = []): Promise<T[]> {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
    if (role) await db.exec(`set role ${role}`)
    try {
      return (await db.query<T>(text, params)).rows
    } finally {
      await db.exec('reset role')
    }
  }
  async function newUser(): Promise<string> {
    return (await run<{ id: string }>(null, null, 'insert into auth.users default values returning id'))[0].id
  }
  return { db, run, newUser }
}
