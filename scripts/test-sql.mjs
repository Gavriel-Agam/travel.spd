// Runs every migration against an in-process Postgres (PGlite) with minimal
// stand-ins for Supabase's auth/storage schemas, then exercises the RPCs and
// RLS as two different users. Usage: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`);

process.on("uncaughtException", (e) => { console.error("FAIL:", e.message, e.where ?? ""); process.exit(1); });

for (const f of readdirSync('supabase/migrations').sort()) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  console.log('applied', f);
}
await db.exec(`
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`);
// Re-apply the column limits, since the blanket grant above mimics Supabase's defaults
await db.exec(readFileSync('supabase/migrations/20261101000001_init.sql', 'utf8')
  .split('-- Column-level write limits (RLS decides rows, grants decide columns)')[1].split('-- RPC access')[0]);

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}')`);

async function as(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function rejects(promise, pattern) {
  await assert.rejects(promise, (e) => pattern.test(e.message), `expected ${pattern}`);
}

let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

// Profiles created by trigger
assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n, 3);
ok('profile row per auth user');

// Trip creation and invite
const [{ create_trip: trip }] = await as(A, `select create_trip('Thailand', 'Partner A', '2026-11-01', '2026-11-30', 'THB', 'Asia/Bangkok', 2000000, 50000)`);
const [{ create_invite: code }] = await as(A, `select create_invite($1)`, [trip]);
assert.match(code, /^[A-Z2-9]{8}$/);
const [{ create_invite: code2 }] = await as(A, `select create_invite($1)`, [trip]);
assert.equal(code, code2);
ok('create_trip + stable invite code');

assert.equal((await as(B, 'select * from trips')).length, 0);
ok('non-member cannot see trip');

await rejects(as(B, `select join_trip('NOPE1234', 'B')`), /invite_invalid/);
const [{ join_trip: joined }] = await as(B, `select join_trip($1, 'Partner B')`, [code.toLowerCase()]);
assert.equal(joined, trip);
await as(B, `select join_trip($1, 'Partner B')`, [code]); // idempotent for a member
await rejects(as(C, `select join_trip($1, 'C')`, [code]), /invite_used/);
ok('join_trip: case-insensitive, idempotent, single use');

assert.equal((await as(B, 'select * from trips')).length, 1);
assert.equal((await as(C, 'select * from trips')).length, 0);
assert.equal((await as(B, 'select * from budgets')).length, 2);
ok('RLS: members see trip and budgets, others do not');

const members = await as(A, 'select id, user_id from trip_members order by role desc');
const mA = members.find((m) => m.user_id === A).id;
const mB = members.find((m) => m.user_id === B).id;

await rejects(as(B, `update trip_members set role = 'owner' where user_id = $1`, [B]), /permission denied/);
await as(B, `update trip_members set display_name = 'B2' where user_id = $1`, [B]);
ok('members can rename themselves but not change role');

const [{ id: catStreet }] = await db.query(`select id from expense_categories where key = 'street_food'`).then((r) => r.rows);

function expense(extra) {
  return JSON.stringify({
    trip_id: trip, paid_by_member_id: mA, amount_minor: 125000, currency: 'THB',
    fx_rate: '0.1', fx_is_manual: true, category_id: catStreet, description: 'Pad thai',
    split_type: 'equal', splits: [{ member_id: mA }, { member_id: mB }], ...extra,
  });
}

// 1,250.00 THB at 0.1 = 125.00 ILS, split 62.50 / 62.50
const [e1] = await as(B, `select * from save_expense($1::jsonb)`, [expense({})]);
assert.equal(Number(e1.amount_ils_minor), 12500);
assert.equal(e1.created_by, B);
assert.equal(e1.paid_by_member_id, mA);
let splits = await as(A, 'select member_id, share_ils_minor::int s from expense_splits where expense_id = $1 order by s desc', [e1.id]);
assert.deepEqual(splits.map((s) => s.s), [6250, 6250]);
ok('equal split, creator differs from payer, ILS computed server-side');

// Odd agora goes to the payer: 100.01 ILS
const [e2] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ amount_minor: 10001, currency: 'ILS', fx_rate: '3.7', paid_by_member_id: mB })]);
assert.equal(e2.fx_rate, '1.000000000000');
splits = await as(A, 'select member_id, share_ils_minor::int s from expense_splits where expense_id = $1', [e2.id]);
assert.equal(splits.find((s) => s.member_id === mB).s, 5001);
assert.equal(splits.find((s) => s.member_id === mA).s, 5000);
ok('home currency forced to rate 1, leftover agora to payer');

// Zero-decimal currency: 250,000 VND at 0.000146 = 36.50 ILS
const [e3] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ amount_minor: 250000, currency: 'VND', fx_rate: '0.000146', split_type: 'percent', splits: [{ member_id: mA, value: 70 }, { member_id: mB, value: 30 }] })]);
assert.equal(Number(e3.amount_ils_minor), 3650);
splits = await as(A, 'select member_id, share_ils_minor::int s, share_pct from expense_splits where expense_id = $1', [e3.id]);
assert.equal(splits.find((s) => s.member_id === mA).s, 2555);
assert.equal(splits.find((s) => s.member_id === mB).s, 1095);
ok('VND (0 decimals) + percent split');

await rejects(as(A, `select * from save_expense($1::jsonb)`, [expense({ split_type: 'percent', splits: [{ member_id: mA, value: 70 }, { member_id: mB, value: 20 }] })]), /sum to 100/);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [expense({ split_type: 'amount', splits: [{ member_id: mA, value: 100000 }, { member_id: mB, value: 20000 }] })]), /sum to the total/);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [expense({ split_type: 'treat', splits: [{ member_id: mB }] })]), /treat belongs to payer/);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [expense({ amount_minor: -5 })]), /invalid_amount/);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [expense({ currency: 'XXX' })]), /invalid_currency/);
await rejects(as(C, `select * from save_expense($1::jsonb)`, [expense({})]), /forbidden/);
ok('server rejects bad splits, amounts, currencies, outsiders');

// Amount split: 1,000.00 THB at 0.1033 -> 103.30 ILS; 333.33 / 666.67 THB
const [e4] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ amount_minor: 100000, fx_rate: '0.1033', split_type: 'amount', splits: [{ member_id: mA, value: 33333 }, { member_id: mB, value: 66667 }] })]);
splits = await as(A, 'select member_id, share_ils_minor::int s from expense_splits where expense_id = $1', [e4.id]);
assert.equal(splits.reduce((t, s) => t + s.s, 0), 10330);
ok('amount split shares sum exactly to total');

// Personal: A paid for B's item
const [e5] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ amount_minor: 50000, split_type: 'personal', splits: [{ member_id: mB }] })]);
splits = await as(A, 'select member_id, share_ils_minor::int s from expense_splits where expense_id = $1', [e5.id]);
assert.deepEqual(splits.map((s) => [s.member_id, s.s]), [[mB, 5000]]);
ok('personal split assigns 100% to one member');

// Optimistic concurrency
await rejects(as(B, `select * from save_expense($1::jsonb, 99)`, [expense({ id: e1.id })]), /conflict/);
const [e1b] = await as(B, `select * from save_expense($1::jsonb, 1)`, [expense({ id: e1.id, amount_minor: 200000 })]);
assert.equal(e1b.version, 2);
assert.equal(Number(e1b.amount_ils_minor), 20000);
assert.equal(e1b.created_by, B);
await rejects(as(A, `select * from save_expense($1::jsonb, 1)`, [expense({ id: e1.id })]), /conflict/);
ok('edit bumps version, stale edit raises conflict');

// Historical rate is kept: nothing recalculates stored ILS amounts
await db.exec(`insert into exchange_rates (source, base, quote, rate_date, rate) values ('ecb','EUR','THB','2026-10-30', 36.5), ('ecb','EUR','ILS','2026-10-30', 3.65)`);
const [still] = await as(A, 'select amount_ils_minor::int a from expenses where id = $1', [e1.id]);
assert.equal(still.a, 20000);
ok('stored ILS amount unaffected by new rates');

const rates = await as(A, `select * from ils_rates('2026-11-01')`);
const thb = rates.find((r) => r.currency === 'THB');
assert.equal(thb.rate, '0.1000000000');
assert.equal(rates.find((r) => r.currency === 'EUR').rate, '3.6500000000');
assert.equal(rates.find((r) => r.currency === 'ILS').rate, '1');
ok('ils_rates derives cross rates from EUR snapshot');

// Second source fills currencies the ECB lacks; ECB wins where both exist
await db.exec(`insert into exchange_rates (source, base, quote, rate_date, rate) values
  ('market','EUR','ILS','2026-10-31', 3.5), ('market','EUR','VND','2026-10-31', 28000), ('market','EUR','THB','2026-10-31', 40)`);
const merged = await as(A, `select * from ils_rates('2026-11-01')`);
const vnd = merged.find((r) => r.currency === 'VND');
assert.equal(vnd.rate, '0.0001250000');
assert.equal(vnd.source, 'market');
assert.equal(String(vnd.rate_date.toISOString?.() ?? vnd.rate_date).slice(0, 10), '2026-10-31');
assert.equal(merged.find((r) => r.currency === 'THB').source, 'ecb');
assert.equal(merged.filter((r) => r.currency === 'THB').length, 1);
ok('ils_rates merges sources with per-currency date and source');

// Automatic rates must match what the server published
const auto = (extra) => expense({ fx_is_manual: false, fx_rate: '0.1000000000', fx_rate_date: '2026-10-30', fx_source: 'whatever', ...extra });
const [a1] = await as(A, `select * from save_expense($1::jsonb)`, [auto({})]);
assert.equal(a1.fx_source, 'ecb');
assert.equal(Number(a1.amount_ils_minor), 12500);
const [a2] = await as(A, `select * from save_expense($1::jsonb)`, [auto({ currency: 'VND', amount_minor: 100000, fx_rate: '0.000125', fx_rate_date: '2026-10-31' })]);
assert.equal(a2.fx_source, 'market');
await rejects(as(A, `select * from save_expense($1::jsonb)`, [auto({ fx_rate: '0.2' })]), /invalid_rate/);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [auto({ fx_rate_date: null })]), /invalid_rate/);
const [m1] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ fx_rate: '0.2', fx_source: 'ecb' })]);
assert.equal(m1.fx_source, 'manual');
ok('server accepts only published automatic rates, flags manual ones');

// Newer rates later do not invalidate an old automatic expense on a plain edit
await db.exec(`insert into exchange_rates (source, base, quote, rate_date, rate) values ('ecb','EUR','THB','2026-10-29', 30), ('ecb','EUR','ILS','2026-10-29', 3.6)`);
const [a1b] = await as(B, `select * from save_expense($1::jsonb, 1)`, [auto({ id: a1.id, description: 'Renamed' })]);
assert.equal(a1b.description, 'Renamed');
assert.equal(Number(a1b.amount_ils_minor), 12500);
ok('editing an expense keeps its historical automatic rate valid');

// Delete
await rejects(as(A, 'select delete_expense($1, 1)', [e2.id + '']).then(() => as(A, 'select delete_expense($1, 1)', [e2.id])), /not_found/);
const live = await as(B, 'select count(*)::int n from expenses where deleted_at is null');
assert.equal(live[0].n, 7);
ok('soft delete with version check');

// Direct writes are blocked
await rejects(as(A, `update expenses set amount_ils_minor = 1 where id = $1`, [e1.id]), /permission denied/);
await rejects(as(A, `insert into expense_splits (expense_id, member_id, weight, share_ils_minor) values ($1, $2, 1, 1)`, [e1.id, mA]), /permission denied/);
ok('expenses/splits cannot be written directly');

// Custom categories
await as(B, `insert into expense_categories (trip_id, name, icon) values ($1, 'Massage', '💆')`, [trip]);
await rejects(as(C, `insert into expense_categories (trip_id, name) values ($1, 'X')`, [trip]), /row-level security/);
assert.equal((await as(A, 'select * from expense_categories')).length, 12);
assert.equal((await as(C, 'select * from expense_categories')).length, 11);
ok('custom categories scoped to trip');

// Storage policy
await as(A, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${trip}/r1.jpg`]);
await rejects(as(C, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${trip}/r2.jpg`]), /row-level security/);
assert.equal((await as(B, 'select * from storage.objects')).length, 1);
assert.equal((await as(C, 'select * from storage.objects')).length, 0);
ok('receipt storage scoped to trip members');

// Settle-up payment: B pays A in shekels; counts toward balances, not spending
const [pay] = await as(B, `select * from save_expense($1::jsonb)`, [JSON.stringify({
  trip_id: trip, kind: 'settlement', paid_by_member_id: mB, amount_minor: 4321, currency: 'ILS', fx_rate: '1',
  split_type: 'personal', splits: [{ member_id: mA }],
})]);
assert.equal(pay.kind, 'settlement');
assert.equal(pay.fx_source, 'par');
assert.equal(Number(pay.amount_ils_minor), 4321);
splits = await as(A, 'select member_id, share_ils_minor::int s from expense_splits where expense_id = $1', [pay.id]);
assert.deepEqual(splits.map((s) => [s.member_id, s.s]), [[mA, 4321]]);
ok('settle-up payment stored as a settlement owned by the receiver');

// Offline retries: the same client id never creates a second expense
const clientId = '99999999-9999-4999-8999-999999999999';
const before = (await as(A, 'select count(*)::int n from expenses'))[0].n;
const [o1] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ client_id: clientId, description: 'Offline' })]);
const [o2] = await as(A, `select * from save_expense($1::jsonb)`, [expense({ client_id: clientId, description: 'Offline' })]);
assert.equal(o1.id, o2.id);
assert.equal(o1.client_id, clientId);
assert.equal((await as(A, 'select count(*)::int n from expenses'))[0].n, before + 1);
await rejects(as(C, `select * from save_expense($1::jsonb)`, [expense({ client_id: clientId })]), /forbidden/);
await rejects(as(A, 'select * from save_expense_core($1::jsonb, null)', [expense({})]), /permission denied/);
const [o3] = await as(A, `select * from save_expense($1::jsonb, $2)`, [expense({ id: o1.id, description: 'Edited' }), o1.version]);
assert.equal(o3.description, 'Edited');
ok('offline retries are idempotent; core function not callable directly');

// Signed-out visitors cannot call any RPC; internal helpers are not exposed
async function asAnon(sql) {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec('reset role');
  }
}
await rejects(asAnon(`select create_trip('x', 'x')`), /permission denied/);
await rejects(asAnon(`select * from save_expense('{}'::jsonb)`), /permission denied/);
await rejects(asAnon(`select * from ils_rates()`), /permission denied/);
await rejects(asAnon(`select is_trip_member('${trip}')`), /permission denied/);
await rejects(as(A, `select check_auto_rate('THB', 1, current_date)`), /permission denied/);
await rejects(as(A, `select allocate_minor(100, '[]'::jsonb)`), /permission denied/);
assert.ok((await as(A, `select * from ils_rates()`)).length > 0);
ok('anon cannot call RPCs; internal helpers are not exposed');

console.log(`\n${passed} SQL checks passed`);
