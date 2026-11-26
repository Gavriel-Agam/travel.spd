# SmartTrip (Travel.Spd): rules for Claude

## Keep the legal pages in sync (required)

The app publishes two public pages that Google's OAuth consent screen links to:

- `public/privacy.html` (Privacy Policy)
- `public/terms.html` (Terms of Service)

They are served at `https://gavriel-agam.github.io/travel.spd/privacy.html` and `.../terms.html`.

**Any change that affects what user data the app collects, stores, shares or how it is used must update these pages in the same commit.** This includes:

- new or changed tables or columns that hold user data (`supabase/migrations/`)
- new sign-in providers or auth changes (`src/lib/auth.ts`, `src/providers/AuthProvider.tsx`, `app/sign-in.tsx`)
- new storage buckets or file types (receipts, photos)
- new third-party services, SDKs or packages that receive user data (analytics, crash reporting, payments, AI, email) (`package.json`, `supabase/functions/`)
- changes to who can see a trip, to sharing, or to error logging (`public.client_errors`)
- new features such as account deletion or data export

When updating:

1. Edit both the English and the Hebrew section of each affected page so they say the same thing.
2. Update the "Last updated" / "עודכן לאחרונה" date in each page you changed.
3. Describe only what the code actually does. Never invent data practices.
4. Mention the update in the commit message and tell Gabriel what changed in the pages.

If a change clearly does not affect user data (UI, styling, calculations, tests), no update is needed.

The deploy workflow (`.github/workflows/deploy-web.yml`) prints a warning when sensitive paths change without either page changing. Treat that warning as a reminder to check this rule.

## Visual check after every UI change (required)

After any change to the interface:

1. Open the preview (launch config `web-local`) at iPhone size (`resize_window` preset `mobile`, 375x812), in Hebrew (RTL).
2. Take a screenshot of every screen the change touched (scroll for parts below the fold).
3. Look at each image and check: alignment and RTL direction, cut or truncated text, overlapping elements, spacing and padding.
4. If something is broken, fix it and take the screenshot again.
5. Never report the work as done before seeing the result in a screenshot. Text checks (`read_page`, `get_page_text`, JS) do not replace looking at the image.

## Other notes

- `public/sw.js` must never cache `privacy.html` or `terms.html` as the app shell.
- Do not use em dashes in user-facing text.
