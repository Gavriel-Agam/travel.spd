# Travel.Spd: Product Docs

Single source of truth for product scope, UX flows, feature specs and roadmap.
Technical setup lives in [README.md](README.md). Updated after every spec, flow or roadmap change.

Last updated: 2026-11-07

---

## 1. Product

**What:** a shared travel expense PWA for couples. Log expenses in any currency, see the ILS value, sync live between partners, track budgets, settle up.

**Who:** two partners travelling together (one trip, two members).

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
| Accounts | Email + password, Google OAuth, guest demo (read-only local mock trip). Anonymous-identity phones migrate via account transfer (migration 0010). |
| Trips | Private trips; partner joins by invite code (Settings / `join/[code]`). Trip colour + cover photo (0013). Creator can remove a partner (soft, 0014): access gone, history + balances kept, can rejoin as same member. |
| Expenses | Add / edit / view. Swipe any expense row (Expenses tab and Home › Recent, one shared row) → Edit / Delete. Any currency, auto rate (ECB, then market dataset) or manual rate either direction. Payment-method chips. Receipt photos. |
| Paid by | Defaults to joint money (`paid_by_member_id = null`, 0012); or a specific partner. |
| Splits & settle-up | Server-side splits that sum exactly; Settle screen. |
| Budget | Scopes: total, daily, per category, per member. Alert levels in the Budget tab. |
| Stats | Trend, category and payment pie charts, pace / projection. |
| Home | Cards (default order): hero (total + budget), today + daily avg, recent, categories, 7 days, who paid. Long-press to reorder; order synced per user (0011). No expenses yet → one large "Tap to add an expense" (+) button. Solo trip → small invite icon in the header (opens Settings). |
| Categories | Editable per trip (0009 overrides). |
| Sync | Supabase Realtime between partners; offline outbox with idempotency (0005); sync status banner. |
| Reliability | Every client error logged to `public.client_errors`; expired sessions recover automatically. |

### Screens
`sign-in`, `setup`, `reset-password`, `onboarding` (create / join), tabs: **Home**, **Expenses**, **Budget**, **Stats**, **Settings**; plus `expense/new`, `expense/[id]`, `expense/[id]/edit`, `categories`, `settle`.

### Google sign-in test users
The Google OAuth app is in **Testing** mode, so only accounts on its Test users list can use "Continue with Google". Email + password sign-up is open to everyone and needs no list. Access to a trip still requires its invite code.

To add or remove a test user:
1. Open https://console.cloud.google.com and pick the app's project in the project picker (top left).
2. Menu ☰ → **Google Auth Platform** → **Audience**.
3. Under **Test users**: **+ Add users** → enter the Google email → **Save**. To remove one, click the trash icon next to it.

Test users' email addresses are kept only in the console, never in this public repo. **Publish app** on the same screen would let any Google account sign in (no list needed).

---

## 3. Core UX flows

**First run:** open link → sign in (email / Google) or "Continue as guest" → onboarding: create trip or join with code → Home.

**Add expense:** Home or Expenses → New → amount + currency → (rate auto or manual) → category → paid by (default joint) → split → save. Offline: saved as "waiting to sync".

**Partner join:** partner A shares invite code from Settings → partner B signs in → onboarding/join → enters code → shared trip, live sync.

**Remove partner (creator only):** Settings › Members → remove icon next to partner → confirm → partner loses access at once (RLS); their expenses and open balance stay on Home. Re-invite with a new code restores the same member.

**Reorder Home:** hold any card ~0.5 s (no handle) → it lifts (scale 1.05 + shadow), a faint grid appears, an accent line shows the drop spot (upper/lower half of the card under the finger = before/after it) → release; order saved to the account. Short taps and scrolls never lift a card. Screen readers: Arrange sheet.

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
| 2026-11-05 | New Google sign-in test user added in Google Cloud Console (Google Auth Platform → Audience → Test users). OAuth app stays in Testing mode; test users' emails are not stored in the repo. |
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
