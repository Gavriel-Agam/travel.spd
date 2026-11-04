// Local QA environment: the app on http://localhost:8082 against a Supabase
// stack running on this computer (Docker), with the same migrations as the live
// project. Nothing here touches the live project.
//
//   node scripts/qa-local.mjs up     start the local stack and create the QA accounts
//   node scripts/qa-local.mjs web    run the app against the local stack (port 8082)
//   node scripts/qa-local.mjs seed   (re)create the QA accounts
//   node scripts/qa-local.mjs reset  wipe local data, re-apply migrations, re-seed
//   node scripts/qa-local.mjs down   stop the local stack
import { execSync, spawn } from 'node:child_process';

const SUPABASE = process.platform === 'win32' ? 'npx.cmd --yes supabase' : 'npx --yes supabase';
const EXPO = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const PORT = 8082;

// Local-only test accounts (they exist only in the Docker database on this computer)
export const QA_USERS = [
  { email: 'qa-noa@travelspend.test', password: 'qa-local-only-1', name: 'Noa (QA)' },
  { email: 'qa-dan@travelspend.test', password: 'qa-local-only-2', name: 'Dan (QA)' },
];

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', shell: true });
}

/** URL and keys of the running local stack; refuses anything that isn't on this computer. */
function localStack() {
  let out;
  try {
    out = execSync(`${SUPABASE} status -o json`, { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error('The local Supabase stack is not running. Start it with: node scripts/qa-local.mjs up');
  }
  const s = JSON.parse(out.slice(out.indexOf('{')));
  const url = s.API_URL;
  const anon = s.ANON_KEY ?? s.PUBLISHABLE_KEY;
  const service = s.SERVICE_ROLE_KEY ?? s.SECRET_KEY;
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`Refusing to use a non-local Supabase (${host})`);
  return { url, anon, service };
}

async function seed() {
  const { url, service } = localStack();
  for (const u of QA_USERS) {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true, user_metadata: { display_name: u.name } }),
    });
    if (res.ok) console.log(`created ${u.email}`);
    else if (res.status === 422) console.log(`exists  ${u.email}`);
    else throw new Error(`creating ${u.email}: ${res.status} ${await res.text()}`);
  }
  console.log(`\nQA accounts (local only): ${QA_USERS.map((u) => `${u.email} / ${u.password}`).join(', ')}`);
}

function web() {
  const { url, anon } = localStack();
  console.log(`App: http://localhost:${PORT} -> ${url}`);
  // Environment variables win over .env, so the live project's values are not used.
  // --clear: the URL is baked into the bundle, so don't reuse the live build cache.
  spawn(`${EXPO} expo start --web --port ${PORT} --clear`, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon, BROWSER: 'none' },
  });
}

const cmd = process.argv[2];
if (cmd === 'up') {
  run(`${SUPABASE} start`);
  await seed();
} else if (cmd === 'seed') await seed();
else if (cmd === 'web') web();
else if (cmd === 'reset') {
  run(`${SUPABASE} db reset --local`);
  await seed();
} else if (cmd === 'down') run(`${SUPABASE} stop`);
else {
  console.log('Usage: node scripts/qa-local.mjs up | web | seed | reset | down');
  process.exit(1);
}
