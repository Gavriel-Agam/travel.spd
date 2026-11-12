# SmartTrip (Travel.Spd): Product Docs

Single source of truth for product scope, UX flows, feature specs and roadmap.
Technical setup lives in [README.md](README.md). Updated after every spec, flow or roadmap change.

Last updated: 2026-11-10

---

## 1. Product

**What:** a personal travel expense tracker (PWA) with optional sharing. Log expenses in any currency, see the ILS value, track budgets. Invite a partner any time to sync live and settle up.

**Who:** first, one traveller tracking their own trip. Sharing (a partner joins with a code) is a powerful extra, not a requirement.

**Principles**
- Free to run: no paid services (rules out Apple sign-in).
- Money is exact: integer minor units, server-computed ILS and splits, no floats.
- Works offline: expenses queue on the phone and sync when back online.
- Phone first: home-screen web app on iPhone Safari; two columns from tablet width.
- Languages: Hebrew (RTL) + English today.

**Live:** https://gavriel-agam.github.io/travel.spd/ (deployed on every push to `main`).

---

## 2. Current feature set (shipped)

| Area | What exists |
|---|---|
| Accounts | Email + password, Google OAuth, Facebook OAuth (its button appears only once Facebook is turned on in Supabase), guest demo (read-only local mock trip). Anonymous-identity phones migrate via account transfer (migration 0010). |
| Trips | Private trips; partner joins by invite code (Settings / `join/[code]`). Trip colour + cover photo (0013). Creator can remove a partner (soft, 0014): access gone, history + balances kept, can rejoin as same member. **Delete a trip:** Settings › Trips, swipe the trip (right in Hebrew) → Delete. Creator only (`trips.created_by`): confirm "האם אתה בטוח שברצונך למחוק את הטיול?" → the trip's photos are removed from storage, then `delete_trip()` (0018) erases the trip and everything in it for everyone. Anyone else sees a grey Delete that explains "רק משתמש שיצר את התוכנית יכול למחוק אותה"; the server refuses them too. Online only. |
| Expenses | Add / edit / view. Swipe any expense row (Expenses tab and Home › Recent, one shared row) → Edit / Delete. Any currency, auto rate (ECB, then market dataset) or manual rate either direction. Receipt photos. Form: amount → category → divider → payment method → divider → description → **More details** (folded by default, one-line summary: who paid, date, 📝/🧾) holding who paid, split, date/time, notes, receipt. Expenses tab: hold an expense ~0.5 s and drag it up or down **within its day** (days stay in date order); the order is kept on this device only (`prefs.expenseOrder`), expenses added later appear first in their day. |
| Payment methods | Built-in: card, cash, **Bit**. Bank transfer was removed from the list (2026-11-11); older expenses and settle-ups still show it, and legacy "other". All on **one line**: as many chips as fit, then a round **+** (a small number on it = how many didn't fit). **+** opens a sheet: the methods that didn't fit (tap to pick), add the trip's own (max 20, ≤30 chars, shared with the partner; 0017; adds and selects), remove one (saved expenses unchanged). The chosen method always stays on the line. Payment buttons are 44 pt tall (Apple's minimum touch target), 10 pt apart. |
| Paid by | Defaults to joint money (`paid_by_member_id = null`, 0012); or a specific partner. |
| Splits & settle-up | Server-side splits that sum exactly; Settle screen. |
| Budget | One **trip budget** (total, ₪), set in Settings › Trip details; Home shows used / left and alerts. The Budget tab was removed (2026-11-10): daily, per-category and per-member limits can no longer be edited (existing ones still count in Home, alerts and Stats; a daily limit can still be entered when creating a trip). |
| Stats | Trend, category and payment pie charts, projection. "Budget vs actual" card removed (2026-11-12; the trip budget is in Settings › Trip details and on Home). **By currency**: tap a currency (or "Details") → sheet: per currency flag, code, symbol, name, total in that currency, ≈ ₪, number of expenses, share; tap a currency to list its expenses. Category pie has a range selector: All / Day / Week (Sun-Sat in Hebrew, Mon-Sun in English) / Month, with ‹ › to step back and forward (not past today or the trip end), or Custom (from / to dates). |
| Home | Cards (default order): hero (total + budget), today + daily avg, recent, categories, 7 days, who paid. Daily average = spending from the trip start (or first expense) to today ÷ those days; spending before the trip and expenses dated later are left out. The card shows only the label with an **ⓘ** at its end, and the figure; ⓘ opens a small popover with the math ("X ₪ over N days", "excludes Y ₪ from before the trip", projection). Tap the card → breakdown: the math, then per category ₪/day, total, share and today's spend. Long-press to reorder; order synced per user (0011). No expenses yet → one large "Tap to add an expense" (+) button. Solo trip → small invite icon in the header (opens Settings). |
| Categories | Editable per trip (0009 overrides). Settings › Categories: swipe a row (right in Hebrew) → Edit / Delete (built-ins are hidden for the trip, restorable from the hidden section); hold ~0.5 s and drag to reorder. Same hold-and-drag on the category chips in the expense form. Order is per trip, shared (`trips.category_order`, 0017). Icon: emoji grid, own emoji (kept whole, colour form), or an uploaded PNG / SVG / JPG turned into a 128 px icon (data URL in the row, works offline; 0017). Uploads (category pictures and profile photos) open a crop screen in the browser: drag to move, two-finger pinch / mouse wheel / − + to zoom, live preview at final size; photos start filling the frame, logos start whole. Phone app: the system cropper. Broken picture → emoji → 🏷️ fallback. |
| Sync | Supabase Realtime between partners. Offline-first: data saved on the device (30 days) shows instantly with no signal; new expenses, edits and deletes are queued (outbox, idempotent creates 0005, versioned edits/deletes), shown immediately, and sent automatically when the server is reachable again (probe every 10s). Conflicts with a partner's edit are flagged, never overwritten. Banner: offline (showing saved data) → syncing → all synced. |
| Launch speed | Web app opens instantly, with or without signal: the service worker serves the stored app at once and fetches the latest version in the background with all its files (used from the next launch; banner "new version ready · tap to reload"). One script file (2.1 MB, was 3.6 MB in ~20 files loaded one after another). Saved data, settings and login are read before the first screen is drawn. The Home screen as last shown is kept on the device and put on screen from the page itself before the script starts (only on Home, same login, same screen size, removed after a month, deleted on sign-out), then the live Home replaces it. Bench (desktop Chrome, cold start): Home visible ~0.12 s, live ~0.4 s, online, weak signal and offline alike (before: 1.2 s online; never opened on a hanging network or offline). |
| Sheets | Every bottom sheet closes by dragging it down: a quick flick (over 0.5 pt/ms) or pulling it past about a third of its height closes it with a short slide; a slow or short drag springs back. The handle and title always drag; the content drags only when its list is at the top (so scrolling stays scrolling). Home › Arrange: handle only (its cards are dragged). |
| Picture uploads | Category picture, trip photo, profile photo and receipt: a box with a dashed outline (tap to choose; in the browser an image file can be dropped on it, the outline turns solid while one is over it). |
| Reliability | Every client error logged to `public.client_errors`; expired sessions recover automatically. |
| Feedback | Floating panel ("the app is in beta…") with text + Send; X shrinks it into a bell (top left of Home header in Hebrew), bell reopens it. Opens by itself **once per account, ever** (first Home with a trip after signing up, any device): server claim `claim_feedback_prompt()` (0017; accounts that existed before were marked as already asked) plus a per-device flag. Afterwards only from the bell. Saved to `app_feedback` (0015, write-only); ntfy.sh push/email to the developer via Vault secrets. |

### Screens
`sign-in`, `setup`, `reset-password`, `onboarding` (create / join), tabs: **Home**, **Expenses**, **Stats**, **Settings**; plus `expense/new`, `expense/[id]`, `expense/[id]/edit`, `categories`, `settle`.

### Facebook sign-in setup
The Facebook button stays hidden until Facebook is turned on in Supabase. To turn it on:
1. developers.facebook.com → **My Apps** → **Create App** → use case **Authenticate and request data from users with Facebook Login** → name **SmartTrip** → create.
2. **Use cases** → Facebook Login → **Customize** → **Permissions**: add **email** (public_profile is there by default). → **Settings**: Valid OAuth Redirect URIs = the Callback URL shown in Supabase (step 4) → Save.
3. **App settings** → **Basic**: Privacy Policy URL `https://gavriel-agam.github.io/travel.spd/privacy.html`, Terms of Service URL `…/terms.html`, User data deletion: instructions URL `…/privacy.html#delete`, app icon, category → Save. Copy **App ID** and **App Secret**.
4. Supabase dashboard → project → **Authentication** → **Sign In / Providers** → **Facebook** → enable → paste App ID (Client ID) and App Secret → Save.
5. Back in Meta: **Publish** the app (Live). Until then only the app's own admins/testers can sign in.
The button appears in the app within 10 minutes (or on the next launch).

### Google sign-in test users
The Google OAuth app is in **Testing** mode, so only accounts on its Test users list can use "Continue with Google". Email + password sign-up is open to everyone and needs no list. Access to a trip still requires its invite code.

To add or remove a test user:
1. Open https://console.cloud.google.com and pick the app's project in the project picker (top left).
2. Menu ☰ → **Google Auth Platform** → **Audience**.
3. Under **Test users**: **+ Add users** → enter the Google email → **Save**. To remove one, click the trash icon next to it.

Test users' email addresses are kept only in the console, never in this public repo. **Publish app** on the same screen would let any Google account sign in (no list needed).

---

## 3. Core UX flows

**First run:** open link → sign in: big white "Continue with Google" (full-colour G), blue "Continue with Facebook" (once enabled); text link "More sign-in options" reveals email + password and the demo → onboarding: create trip or join with code → Home.

**Create trip:** trip name → your name → Dates toggle (off by default; on = start/end pickers fade in) → main currency → optional budgets → Create. A trip without dates has no start or end.

**Add expense:** Home or Expenses → New → amount + currency → (rate auto or manual) → category (full-width grid of tiles, 3 per row, 4 on wide screens; hold a tile to drag it) → payment method (one line; **+** for the rest or your own) → optional description → (More details: paid by, default joint → split → date → notes / receipt) → save. Offline: saved as "waiting to sync". An invalid split opens More details.

**Partner join:** partner A shares invite code from Settings → partner B signs in → onboarding/join → enters code → shared trip, live sync.

**Remove partner (creator only):** Settings › Members → remove icon next to partner → confirm → partner loses access at once (RLS); their expenses and open balance stay on Home. Re-invite with a new code restores the same member.

**Reorder cards (Home, Statistics):** hold any card ~0.5 s (no handle) → it lifts (scale 1.05 + shadow), a faint grid appears, an accent line shows the drop spot (upper/lower half of the card under the finger = before/after it) → release; order saved to the account. Short taps and scrolls never lift a card. Screen readers: Arrange sheet.

**Demo → real account:** demo prompts sign-up; demo data stays local.

---

## 4. Feature specs

_Specs for new work go here, one sub-section each: problem, goals / non-goals, UX flow, acceptance criteria, open questions._

(none in progress; next focus: drag & drop, real-time sync, smart budgeting)

---

## 5. Roadmap

| Horizon | Item | Notes |
|---|---|---|
| Next | 13 more languages: ar (RTL), ru, es, fr, de, pt, it, ja, ko, zh-Hans, hi, tr, th; auto-detect | Today only he / en |
| Later | Focus themes for this track: drag & drop UX, real-time couple sync, smart budgeting | To be specced in section 4 |

---

## 6. Decision log

| Date | Decision |
|---|---|
| 2026-11-12 | Only a trip's creator can delete it (for everyone); partners see Delete but are told only the creator can. |
| 2026-11-12 | Expenses can be reordered by hand within a day only, saved on the device (Gabriel's choice over shared order or moving across days). |
| 2026-11-12 | "Budget vs actual" removed from Statistics. |
| 2026-11-11 | Bank transfer removed from the payment list; payment methods on one line with a "+" for the rest. |
| 2026-11-11 | Facebook sign-in added next to Google; the button shows only once the provider is enabled (no broken button while Meta setup is pending). |
| 2026-11-11 | The web app opens from its stored copy instead of waiting for the network; a new version is fetched in the background and used from the next launch (plus a "tap to reload" banner). |
| 2026-11-11 | Launch snapshot: a copy of Home is shown straight from the page while the app starts (target was under 300 ms). |
| 2026-11-05 | New Google sign-in test user added in Google Cloud Console (Google Auth Platform → Audience → Test users). OAuth app stays in Testing mode; test users' emails are not stored in the repo. |
| 2026-11-10 | Budget tab removed; the only budget is the trip budget in Settings › Trip details (per Gabriel: "remove the budget tab, add only trip budget"). |
| 2026-11-10 | Daily average = trip days so far only; pre-trip and later-dated spending excluded and shown as such (Gabriel chose this over dividing the full total). |
| 2026-11-10 | Stats category pie: All / Day / Week / Month / Custom range. Picture uploads get a crop + zoom screen. Category picker in the form is a full-width tile grid. |
| 2026-11-10 | Expense form: who paid + date moved into folded More details; dividers between category and payment sections. |
| 2026-11-10 | Feedback panel opens by itself once per account (not per app start). |
| 2026-11-10 | Categories: swipe edit/delete, drag to reorder (list + form chips, per trip), picture upload. Payment: Bit + custom per trip. |
| 2026-11-10 | Amounts (number-only text) align to the start of the line in Hebrew, incl. the Home total. |
| 2026-11-10 | Offline-first: cached reads, queued edits/deletes, auto-sync, offline/synced banner. |
| 2026-11-08 | Removed partners disappear from every screen except as payer on old expenses. |
| 2026-11-08 | Cards can be dragged on Statistics and Budget (order per device). |
| 2026-11-08 | Member profile photos (own photo, visible to the trip). Confetti on every new expense. |
| 2026-11-08 | Loading states are skeletons, not spinners; navigation themed in app colours (no light flash). |
| 2026-11-08 | Sign-in is Google-first; email/password and demo behind "More sign-in options". |
| 2026-11-08 | In-app feedback (panel + bell), stored write-only, developer notified via ntfy.sh. |
| 2026-11-08 | Renamed to **SmartTrip** (was TravelSpend Couple). Display name only: repo, URL, `travelspend://` scheme and storage keys unchanged. Google consent screen app name to be changed by hand. |
| 2026-11-07 | Positioning: personal-first tracker, sharing optional. Auth/onboarding copy rewritten (EN + HE). |
| 2026-11-07 | New trip: name first, dates optional and off by default. |
| 2026-11-07 | Default Home order: total, today, recent, categories, 7 days, who paid (users with a saved order keep theirs). |
| 2026-11-07 | Swipe edit/delete on every expense list, incl. Home › Recent. |
| 2026-11-07 | Partner removal is soft (`removed_at`), creator only; never deletes expense history. |
| 2026-11-07 | Total card border/halo uses the trip accent (same as the + button). |
| 2026-11-04 | Home cards reorder by long-press anywhere on the card; drag handles removed. |
| 2026-11-04 | Total card: Royal Sapphire gradient (default blue), inner glow, white/10 border. |
| 2026-11-04 | Home focuses on expenses: partner-invite card removed (invite icon + Settings instead); empty state is a single add-expense CTA. |
| 2026-11-04 | "Paid by" defaults to joint money. |
| 2026-11-04 | Trip colour + cover photo per trip. |
| 2026-11-04 | QA runs on a local Docker Supabase stack (app on :8082) with two test accounts before each release. |
| 2026-11 | Apple sign-in ruled out (paid developer program). |
| 2026-11 | Anonymous sign-ins off; trips private, joined by invite code. |
