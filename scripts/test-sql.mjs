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
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  -- Like Supabase: new tables in public are fully granted to the API roles;
  -- migrations then narrow that down with revoke / column grants
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
`);

process.on("uncaughtException", (e) => { console.error("FAIL:", e.message, e.where ?? ""); process.exit(1); });

for (const f of readdirSync('supabase/migrations').sort()) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  console.log('applied', f);
}

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}')`);

async function as(uid, sql, params = [], { anonymous = false } = {}) {
  const claims = JSON.stringify({ sub: uid, is_anonymous: anonymous });
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false); select set_config('request.jwt.claims', '${claims}', false);`);
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

// MVP shared trip (retired for the app in 0010; the function itself is still
// checked, called as the database owner with a user's id)
async function asOwner(uid, sql) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`);
  return (await db.query(sql)).rows;
}
const [{ join_shared_trip: s1 }] = await asOwner(C, 'select join_shared_trip()');
const [{ join_shared_trip: s2 }] = await asOwner(A, 'select join_shared_trip()');
const [{ join_shared_trip: s3 }] = await asOwner(C, 'select join_shared_trip()');
assert.equal(s1, s2);
assert.equal(s1, s3);
const sharedMembers = await as(A, 'select display_name, role from trip_members where trip_id = $1 order by joined_at', [s1]);
assert.deepEqual(sharedMembers.map((m) => [m.display_name, m.role]), [['Traveler 1', 'owner'], ['Traveler 2', 'member']]);
assert.equal((await as(C, 'select * from trips where shared')).length, 1);
await rejects(asAnon('select join_shared_trip()'), /permission denied/);
ok('shared trip: created once, joined by every device, no duplicates');

// A session whose user was deleted gets a clear code instead of a FK error
const GONE = '44444444-4444-4444-4444-444444444444';
await rejects(asOwner(GONE, 'select join_shared_trip()'), /session_expired/);
ok('join_shared_trip reports session_expired for a deleted user');

// Error log: anyone can write, nobody can read through the API
await asAnon(`insert into client_errors (code, message, context) values ('unknown', 'boom', 'test')`);
await as(A, `insert into client_errors (code, message, context, details) values ('network', 'offline', 'home', '{"status": 0}')`);
await rejects(as(A, 'select * from client_errors'), /permission denied/);
await rejects(asAnon('select * from client_errors'), /permission denied/);
await rejects(as(A, `insert into client_errors (user_id, message) values ('${B}', 'spoof')`), /permission denied/);
const logged = (await db.query('select user_id, code from client_errors order by id')).rows;
assert.deepEqual(logged.map((r) => [r.user_id, r.code]), [[null, 'unknown'], [A, 'network']]);
ok('client_errors: write-only, user_id taken from the session');

// Category overrides: per-trip edits of built-ins, members only
const [{ id: catHotel }] = (await db.query(`select id from expense_categories where key = 'accommodation'`)).rows;
await as(A, `insert into category_overrides (trip_id, category_id, name, icon, color) values ($1, $2, 'מלונות', '🛏️', '#112233')`, [trip, catHotel]);
await as(B, `update category_overrides set hidden = true where trip_id = $1 and category_id = $2`, [trip, catHotel]);
const ov = await as(A, 'select name, icon, hidden from category_overrides where trip_id = $1', [trip]);
assert.deepEqual(ov.map((o) => [o.name, o.icon, o.hidden]), [['מלונות', '🛏️', true]]);
assert.equal((await as(C, 'select * from category_overrides')).length, 0);
await rejects(as(C, `insert into category_overrides (trip_id, category_id, name) values ($1, $2, 'x')`, [trip, catStreet]), /row-level security/);
const [{ id: customCat }] = await as(A, `select id from expense_categories where trip_id = $1 limit 1`, [trip]);
await rejects(as(A, `insert into category_overrides (trip_id, category_id, name) values ($1, $2, 'x')`, [trip, customCat]), /override_builtin_only/);
await rejects(as(A, `insert into category_overrides (trip_id, category_id, color) values ($1, $2, 'red')`, [trip, catStreet]), /check constraint/);
// The shared built-in row itself is untouched, and a custom category can be edited in place
assert.equal((await db.query(`select name from expense_categories where id = $1`, [catHotel])).rows[0].name, 'Accommodation');
await as(B, `update expense_categories set name = 'עיסוי', icon = '💆' where id = $1`, [customCat]);
assert.equal((await as(A, 'select name from expense_categories where id = $1', [customCat]))[0].name, 'עיסוי');
await rejects(as(A, `update expense_categories set name = 'hack' where id = $1`, [catHotel]).then((r) => { if ((r ?? []).length === 0) throw new Error('row-level security: no rows'); }), /row-level security|no rows/);
assert.equal((await db.query(`select name from expense_categories where id = $1`, [catHotel])).rows[0].name, 'Accommodation');
await as(A, `delete from category_overrides where trip_id = $1 and category_id = $2`, [trip, catHotel]);
assert.equal((await as(A, 'select * from category_overrides')).length, 0);
ok('category overrides: members edit built-ins per trip; shared rows unchanged');

// Private trips: nobody joins the old shared trip any more without a code
await rejects(as(C, 'select join_shared_trip()'), /permission denied/);
ok('join_shared_trip retired for the app');

// Account transfer: anonymous phone -> real account keeps memberships and authorship
const ANON = '55555555-5555-4555-8555-555555555555';
const REAL = '66666666-6666-4666-8666-666666666666';
await db.exec(`insert into auth.users (id) values ('${ANON}'), ('${REAL}')`);
const [{ create_trip: anonTrip }] = await as(ANON, `select create_trip('MVP trip', 'Noa')`, [], { anonymous: true });
const [{ id: anonMember }] = await as(ANON, 'select id from trip_members where trip_id = $1', [anonTrip], { anonymous: true });
await as(ANON, `select * from save_expense($1::jsonb)`, [JSON.stringify({ trip_id: anonTrip, paid_by_member_id: anonMember, amount_minor: 5000, currency: 'ILS', fx_rate: '1', split_type: 'equal', splits: [{ member_id: anonMember }] })], { anonymous: true });
await rejects(as(REAL, 'select start_account_transfer()'), /not_anonymous/);
const [{ start_account_transfer: token }] = await as(ANON, 'select start_account_transfer()', [], { anonymous: true });
await rejects(as(ANON, 'select finish_account_transfer($1)', [token], { anonymous: true }), /still_anonymous/);
await rejects(as(REAL, 'select finish_account_transfer($1)', ['00000000-0000-4000-8000-000000000000']), /transfer_invalid/);
const [{ finish_account_transfer: moved }] = await as(REAL, 'select finish_account_transfer($1)', [token]);
assert.equal(moved, 1);
assert.equal((await as(REAL, 'select * from trips where id = $1', [anonTrip])).length, 1);
assert.equal((await as(REAL, 'select count(*)::int n from expenses where trip_id = $1 and created_by = $2', [anonTrip, REAL]))[0].n, 1);
assert.equal((await as(ANON, 'select * from trips where id = $1', [anonTrip], { anonymous: true })).length, 0);
await rejects(as(REAL, 'select finish_account_transfer($1)', [token]), /transfer_invalid/);
await rejects(as(REAL, 'select * from account_transfers'), /permission denied/);
ok('account transfer: a one-time token moves an anonymous phone\'s trips to the real account');

// Trip isolation: a partner invited to one trip sees nothing of the owner's other trips
const [{ create_trip: ski }] = await as(A, `select create_trip('Ski', 'Partner A', null, null, 'GEL')`);
const [{ id: skiMember }] = await as(A, 'select id from trip_members where trip_id = $1', [ski]);
const skiExpense = (extra = {}) => JSON.stringify({ trip_id: ski, paid_by_member_id: skiMember, amount_minor: 9000, currency: 'GEL', fx_rate: '1.35', fx_is_manual: true, split_type: 'equal', splits: [{ member_id: skiMember }], ...extra });
await as(A, `select * from save_expense($1::jsonb)`, [skiExpense()]);
await as(A, `insert into budgets (trip_id, scope, amount_ils_minor) values ($1, 'total', 500000)`, [ski]);
await as(A, `select create_invite($1)`, [ski]);
for (const outsider of [B, C]) {
  for (const table of ['trips', 'trip_members', 'expenses', 'budgets', 'trip_invites', 'category_overrides', 'expense_categories']) {
    const col = table === 'trips' ? 'id' : 'trip_id';
    assert.equal((await as(outsider, `select * from ${table} where ${col} = $1`, [ski])).length, 0, `${table} leaked`);
  }
  assert.equal((await as(outsider, 'select s.* from expense_splits s join expenses e on e.id = s.expense_id where e.trip_id = $1', [ski])).length, 0);
  await rejects(as(outsider, `select create_invite($1)`, [ski]), /forbidden/);
  await rejects(as(outsider, `select * from save_expense($1::jsonb)`, [skiExpense({ amount_minor: 1 })]), /forbidden/);
  await as(outsider, `update trips set name = 'hacked' where id = $1`, [ski]).catch(() => {});
  await as(outsider, `delete from expenses where trip_id = $1`, [ski]).catch(() => {});
}
assert.equal((await as(A, 'select name from trips where id = $1', [ski]))[0].name, 'Ski');
assert.equal((await as(A, 'select count(*)::int n from expenses where trip_id = $1', [ski]))[0].n, 1);
// ...while B still sees the trip it was invited to
assert.equal((await as(B, 'select * from trips where id = $1', [trip])).length, 1);
ok('trip isolation: a partner sees only the trips they were invited to');

// User preferences: each user reads and writes only their own row
await as(A, `insert into user_preferences (home_layout) values ('{recent,hero}')`);
await as(A, `insert into user_preferences (home_layout) values ('{today}') on conflict (user_id) do update set home_layout = excluded.home_layout, updated_at = now()`);
assert.deepEqual((await as(A, 'select home_layout from user_preferences'))[0].home_layout, ['today']);
assert.equal((await as(B, 'select * from user_preferences')).length, 0);
await rejects(as(B, `insert into user_preferences (user_id, home_layout) values ($1, '{x}')`, [A]), /row-level security/);
await as(B, `update user_preferences set home_layout = '{hacked}' where user_id = $1`, [A]);
assert.deepEqual((await as(A, 'select home_layout from user_preferences'))[0].home_layout, ['today']);
ok('user preferences: private to each user, upsert keeps one row');

// Joint money: no payer. Counts in the split, refuses settlements and treats without a payer
const joint = (extra = {}) => JSON.stringify({ trip_id: trip, paid_by_member_id: null, amount_minor: 10001, currency: 'ILS', fx_rate: '1', split_type: 'equal', splits: [{ member_id: mA }, { member_id: mB }], ...extra });
const [j1] = await as(A, `select * from save_expense($1::jsonb)`, [joint()]);
assert.equal(j1.paid_by_member_id, null);
const jShares = await as(A, 'select member_id, share_ils_minor::int s from expense_splits where expense_id = $1 order by member_id', [j1.id]);
assert.equal(jShares.reduce((x, r) => x + r.s, 0), 10001);
assert.deepEqual(jShares.map((r) => r.s).sort(), [5000, 5001]);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [joint({ kind: 'settlement', split_type: 'personal', splits: [{ member_id: mB }] })]), /invalid_payer|expenses_settlement_has_payer/);
await rejects(as(A, `select * from save_expense($1::jsonb)`, [joint({ split_type: 'treat', splits: [{ member_id: mA }] })]), /treat belongs to payer/);
// An existing expense can move to joint money and back
const [j2] = await as(B, `select * from save_expense($1::jsonb, $2)`, [joint({ id: j1.id, paid_by_member_id: mB }), j1.version]);
assert.equal(j2.paid_by_member_id, mB);
const [j3] = await as(B, `select * from save_expense($1::jsonb, $2)`, [joint({ id: j1.id }), j2.version]);
assert.equal(j3.paid_by_member_id, null);
ok('joint money: expenses without a payer; settlements and treats still need one');

// Trip look: colour from the palette list, cover photo in the trip's own folder, members only
await as(A, `update trips set theme_color = 'green' where id = $1`, [trip]);
await rejects(as(A, `update trips set theme_color = 'neon' where id = $1`, [trip]), /check constraint/);
await rejects(as(A, `update trips set cover_path = $2 where id = $1`, [trip, `${ski}/cover.jpg`]), /check constraint/);
await as(A, `update trips set cover_path = $2 where id = $1`, [trip, `${trip}/cover-1.jpg`]);
assert.equal((await as(B, 'select theme_color, cover_path from trips where id = $1', [trip]))[0].theme_color, 'green');
await as(B, `insert into storage.objects (bucket_id, name) values ('trip-covers', $1)`, [`${trip}/cover-2.jpg`]);
await rejects(as(C, `insert into storage.objects (bucket_id, name) values ('trip-covers', $1)`, [`${trip}/x.jpg`]), /row-level security/);
assert.equal((await as(C, `select * from storage.objects where bucket_id = 'trip-covers'`)).length, 0);
assert.equal((await as(A, `select * from storage.objects where bucket_id = 'trip-covers'`)).length, 1);
ok('trip look: palette colours only, covers stay in the trip folder and with its members');

// Removing a partner (0014): creator only, soft, history kept, can rejoin as the same member
await rejects(as(B, `select remove_trip_member($1)`, [mA]), /forbidden/);
await rejects(as(C, `select remove_trip_member($1)`, [mB]), /forbidden/);
await rejects(as(A, `select remove_trip_member($1)`, [mA]), /cannot_remove_owner/);
const bSplitsBefore = (await as(A, 'select count(*)::int n from expense_splits where member_id = $1', [mB]))[0].n;
await as(A, `select remove_trip_member($1)`, [mB]);
assert.equal((await as(B, 'select * from trips where id = $1', [trip])).length, 0);
assert.equal((await as(B, 'select * from expenses where trip_id = $1', [trip])).length, 0);
await rejects(as(B, `select * from save_expense($1::jsonb)`, [expense({})]), /forbidden/);
const [removedB] = await as(A, 'select removed_at from trip_members where id = $1', [mB]);
assert.ok(removedB.removed_at);
assert.equal((await as(A, 'select count(*)::int n from expense_splits where member_id = $1', [mB]))[0].n, bSplitsBefore);
ok('remove member: creator only, never the creator, removed partner locked out, history kept');

const [{ create_invite: reCode }] = await as(A, `select create_invite($1)`, [trip]);
await as(B, `select join_trip($1, 'Partner B again')`, [reCode]);
const bRows = await as(A, 'select id, removed_at from trip_members where trip_id = $1 and user_id = $2', [trip, B]);
assert.equal(bRows.length, 1);
assert.equal(bRows[0].id, mB);
assert.equal(bRows[0].removed_at, null);
assert.equal((await as(B, 'select * from trips where id = $1', [trip])).length, 1);
ok('removed partner rejoins with a new code as the same member');

// Feedback (0015): signed-in users can send, nobody can read it back or forge the sender
await as(A, `insert into app_feedback (trip_id, message, lang, app_version) values ($1, 'Missing: dark map', 'he', '1.0.0')`, [trip]);
await as(C, `insert into app_feedback (message) values ('From a user without trips')`);
await rejects(as(C, `insert into app_feedback (trip_id, message) values ($1, 'x')`, [trip]), /row-level security/);
await rejects(as(A, `insert into app_feedback (user_id, message) values ($1, 'x')`, [B]), /permission denied/);
await rejects(as(A, `insert into app_feedback (message) values ('   ')`), /check constraint/);
await rejects(as(A, 'select * from app_feedback'), /permission denied/);
const fb = (await db.query('select user_id, message from app_feedback order by id')).rows;
assert.equal(fb.length, 2);
assert.equal(fb[0].user_id, A);
assert.equal(fb[1].user_id, C);
ok('feedback: write-only, sender is always the caller, own trips only, notify trigger never blocks');

console.log(`\n${passed} SQL checks passed`);
