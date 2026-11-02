// fx-rates: returns the ILS value of 1 unit of every supported currency for a date.
//
// Sources (no API keys, so nothing secret ships anywhere):
//   ecb    - Frankfurter, European Central Bank reference rates (preferred)
//   market - fawazahmed0/exchange-api daily dataset, for currencies the ECB
//            does not publish (VND, KHR, LAK, MMK, AED, ...)
// Both are stored raw (1 EUR = x) in public.exchange_rates; cross rates are
// computed in SQL (public.ils_rates), so no floating-point math happens here.
//
// POST { "date": "YYYY-MM-DD" }   (optional, defaults to today UTC)
// -> { requested_date, fetched_at, rates: { THB: { rate: "0.0927...", date, source }, ... } }
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Snapshot = { date: string; rates: Record<string, number> };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function firstOk<T>(urls: string[], parse: (body: any) => T): Promise<T> {
  let last: unknown;
  for (const url of urls) {
    try {
      return parse(await getJson(url));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const SOURCES: Record<string, (date: string, isToday: boolean) => Promise<Snapshot>> = {
  ecb: (date) =>
    firstOk([`https://api.frankfurter.dev/v1/${date}?base=EUR`, `https://api.frankfurter.app/${date}?base=EUR`], (b) => {
      if (!b?.rates?.ILS) throw new Error('ILS missing');
      return { date: b.date, rates: b.rates };
    }),
  market: (date, isToday) => {
    const tag = isToday ? 'latest' : date;
    return firstOk(
      [
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/eur.json`,
        `https://${tag}.currency-api.pages.dev/v1/currencies/eur.json`,
      ],
      (b) => {
        if (!b?.eur?.ils) throw new Error('ILS missing');
        const rates: Record<string, number> = {};
        for (const [k, v] of Object.entries(b.eur as Record<string, number>)) {
          if (/^[a-z]{3}$/.test(k) && typeof v === 'number' && v > 0) rates[k.toUpperCase()] = v;
        }
        return { date: b.date, rates };
      },
    );
  },
};

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Fetches and stores a source's snapshot unless a usable one is cached. Never throws. */
async function ensureSource(admin: SupabaseClient, source: string, date: string, isToday: boolean) {
  const { data: cached } = await admin
    .from('exchange_rates')
    .select('rate_date, fetched_at')
    .eq('source', source)
    .eq('base', 'EUR')
    .eq('quote', 'ILS')
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Past rates never change; today's are refreshed every few hours
  const fresh =
    cached &&
    (isToday ? Date.now() - Date.parse(cached.fetched_at) < 3 * 3600_000 : daysBetween(cached.rate_date, date) <= 4);
  if (fresh) return;

  try {
    const snap = await SOURCES[source](date, isToday);
    const fetched_at = new Date().toISOString();
    const rows = Object.entries(snap.rates).map(([quote, rate]) => ({
      source,
      base: 'EUR',
      quote,
      rate_date: snap.date,
      rate: String(rate),
      fetched_at,
    }));
    const { error } = await admin.from('exchange_rates').upsert(rows, { onConflict: 'source,base,quote,rate_date' });
    if (error) throw error;
  } catch (e) {
    console.error(`fx-rates: ${source} unavailable`, String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'not_authenticated' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: user, error: userError } = await userClient.auth.getUser();
  if (userError || !user.user) return json({ error: 'not_authenticated' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const today = new Date().toISOString().slice(0, 10);
  let date = today;
  try {
    const body = req.method === 'POST' ? await req.json() : {};
    if (body?.date) date = String(body.date);
  } catch {
    // empty body: use today
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return json({ error: 'invalid_date' }, 400);
  if (date > today) date = today;
  const isToday = date === today;

  await Promise.all(Object.keys(SOURCES).map((s) => ensureSource(admin, s, date, isToday)));

  const { data, error } = await admin.rpc('ils_rates', { p_date: date });
  if (error) return json({ error: 'rates_unavailable', detail: error.message }, 500);

  const rows = data as { currency: string; rate: string; rate_date: string; source: string; fetched_at: string }[];
  if (rows.length <= 1) return json({ error: 'rates_unavailable' }, 503);

  const rates: Record<string, { rate: string; date: string; source: string }> = {};
  let fetchedAt: string | null = null;
  for (const r of rows) {
    rates[r.currency.trim()] = { rate: r.rate, date: r.rate_date, source: r.source };
    if (r.source !== 'par' && (!fetchedAt || r.fetched_at > fetchedAt)) fetchedAt = r.fetched_at;
  }
  return json({ requested_date: date, fetched_at: fetchedAt, rates });
});
