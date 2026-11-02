# TravelSpend Couple

A shared travel expense app for two people: manual expenses in any currency, shown alongside their ILS value, with live sync between partners, budgets and settle-up.

Stack: Expo (SDK 58) + Expo Router + TypeScript, Supabase (Postgres, Auth, Realtime, Storage, Edge Functions).

## Requirements

- **Node.js 22.13 or newer** (Expo SDK 58 does not run on Node 20)
- A Supabase project (free tier is enough)
- Expo Go on both iPhones, for development

## One-time setup

1. **Create a Supabase project** at supabase.com.
2. **Apply the database** (from this folder):
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
3. **Deploy the exchange-rate function:**
   ```bash
   npx supabase functions deploy fx-rates
   ```
   It uses Frankfurter (European Central Bank rates) plus a market dataset for other currencies. Neither needs an API key.
4. **Email sign-in with a code:** in Supabase, open Authentication > Email Templates > Magic Link and make sure the template contains `{{ .Token }}`, so the email shows the 6-digit code.
5. **Connect the app:** copy `.env.example` to `.env` and fill in the project URL and anon key (Project Settings > API).
6. **Run:**
   ```bash
   npm start
   ```
   Scan the QR code with the iPhone camera to open the app in Expo Go.

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # money, currency, split, settlement and stats logic
npm run test:sql    # every migration + RLS + RPCs on an in-process Postgres
```

## How money works

- Amounts are stored as integers in the currency's smallest unit (satang, agorot, ...). There are no floats.
- Each expense stores its original amount and currency, the rate used, the rate's date and source, and the ILS amount. The ILS amount is computed **on the server** (`save_expense`) and never recalculated unless the expense is edited.
- Splits are computed on the server, in agorot, and always add up exactly to the expense total. The app shows the same preview using `src/lib/split.ts`.
- Rates come from two key-free sources: European Central Bank reference rates first, and an open daily market dataset (fawazahmed0/exchange-api) for currencies the ECB does not publish (VND, KHR, LAK, MMK, AED, ...). Each expense records which one was used.
- An automatic rate is accepted by the server only if it matches a rate the server itself published for that date. Any other rate must be saved as manual, and is labelled as manual everywhere.
- A manual rate can be typed either way round (₪ per 1 ฿, or ฿ per 1 ₪).

## Layout

```
app/                      screens (Expo Router)
src/lib/                  money, currencies, split, settlement, stats (pure, unit-tested)
src/api/queries.ts        Supabase queries, mutations, realtime
src/ui/                   shared components
src/i18n/                 English + Hebrew
src/data/                 currency and category reference data
supabase/migrations/      schema, RLS, RPCs, reference data, storage
supabase/functions/       fx-rates Edge Function
scripts/                  SQL test harness, reference-data generator
```
