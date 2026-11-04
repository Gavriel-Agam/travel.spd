# TravelSpend Couple

A shared travel expense app for two people: manual expenses in any currency, shown alongside their ILS value, with live sync between partners, budgets and settle-up.

Stack: Expo (SDK 58) + Expo Router + TypeScript, Supabase (Postgres, Auth, Realtime, Storage, Edge Functions).

## Using the app (iPhone)

The app is a home-screen web app, published free on GitHub Pages:

**https://gavriel-agam.github.io/travel.spd/**

1. Open the link in **Safari** on the iPhone.
2. Tap **Share > Add to Home Screen > Add**.
3. Open it from the new icon and sign in with your email (a 6-digit code is emailed).

It works offline: the last-loaded trip is shown, and new expenses are saved on the phone
("waiting to sync") and sent automatically when the connection returns. Editing and receipt
photos need a connection.

## Publishing

Every push to `main` runs `.github/workflows/deploy-web.yml`: typecheck, unit tests, database
tests, web build, then publish to the `gh-pages` branch. One-time setting: GitHub repo
**Settings > Pages > Build and deployment > Source: Deploy from a branch, Branch: `gh-pages` / (root)**.

`.env.production` holds the Supabase URL and anon key used by that build. Both are public by
design (they are embedded in the website); Row Level Security protects the data. Never put the
service_role / secret key in any committed file.

## Backend setup (already done for the live project)

Requirements: Node.js 22.13 or newer, a Supabase project (free tier is enough).

On this Windows PC PowerShell scripts are blocked, so use `npm.cmd` / `npx.cmd`.

1. **Apply the database:**
   ```bash
   npx.cmd supabase login --no-browser
   ```
   ```bash
   npx.cmd supabase link --project-ref YOUR-PROJECT-REF
   ```
   ```bash
   npx.cmd supabase db push --remote --yes
   ```
2. **Deploy the exchange-rate function:**
   ```bash
   npx.cmd supabase functions deploy fx-rates --use-api
   ```
   It uses Frankfurter (European Central Bank rates) plus a market dataset for other currencies. Neither needs an API key.
3. **Email sign-in with a code:** in Supabase, open Authentication > Email Templates > Magic Link and make sure the template contains `{{ .Token }}`.
4. **Local development:** copy `.env.example` to `.env` and fill in the project URL and anon key, then:
   ```bash
   npx.cmd expo start
   ```
   Press `w` for the browser, or scan the QR code with Expo Go.

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # money, currency, split, settlement, stats, budget and offline-queue logic
npm run test:sql    # every migration + RLS + RPCs on an in-process Postgres
```

## Local QA environment

A full copy of the backend (Postgres, Auth, Storage, Realtime, the `fx-rates`
function) runs on this computer in Docker, with the same migrations as the live
project. QA happens there with two test accounts, so the live trip is never
touched. Needs Docker Desktop running.

```bash
npm run qa:up      # start the local stack (first time: downloads ~2 GB) and create the QA accounts
npm run qa:web     # the app on http://localhost:8082, talking to the local stack
npm run qa:reset   # wipe local data and start again from the migrations
npm run qa:down    # stop the local stack
```

The QA accounts are listed in `scripts/qa-local.mjs`. They exist only in the
local database. The script refuses to run against anything that is not
`localhost`.

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
src/store/                device prefs, offline outbox
public/                   web app shell: index.html, manifest, icons, service worker
scripts/                  SQL test harness, reference-data and icon generators
.github/workflows/        test + publish to GitHub Pages
```
