# SmartTrip (Travel.Spd): Project Status

Short running log of what changed and what is open. Product scope and specs live in [PRODUCT_DOCS.md](PRODUCT_DOCS.md).

Last updated: 2026-11-08

## Current state
- Live at https://gavriel-agam.github.io/travel.spd/ (deploys on push to `main`).
- Shipped through Stage 4 (trip colour + photo). Migrations 0001-0015.
- Last deploy: `2ff2b16` (rename to SmartTrip), live 2026-11-07 23:19 UTC; both Actions runs green, live title checked.
- Verified: backend, Supabase DB + RLS, Google OAuth.

## Recent fixes
| Date | Fix | Files |
|---|---|---|
| 2026-11-08 | Feedback: `app_feedback` table (0015; insert-only, sender = caller, own trips only, +1 SQL check). Floating panel on Home with text + Send; X/after-send shrinks it into a bell in the header (safety timer so it always closes even if animations are throttled); bell reopens. Auto-opens once per app start (new users: after creating the first trip). Trigger sends text + version (no name/email/trip) to ntfy.sh using Vault secrets `feedback_ntfy_topic` / `feedback_notify_email`; never blocks saving. Tested locally end to end (row saved, pg_net 200, ntfy delivered). Privacy page (EN + HE) updated. | `supabase/migrations/…0015_app_feedback.sql`, `src/ui/Feedback.tsx`, `src/store/feedback.ts`, `src/api/queries.ts`, `app/(app)/(tabs)/index.tsx`, i18n, `public/privacy.html` |
| 2026-11-08 | Sign-in: Google button only, plus text link "More sign-in options" that fades in email/password and demo (open by default when Google isn't available, e.g. local). | `app/sign-in.tsx`, i18n |
| 2026-11-08 | Rename to SmartTrip: sign-in title, browser tab, PWA manifest, iPhone home-screen title, invite share text (EN + HE), README; privacy + terms pages ("formerly TravelSpend Couple", intro now personal-first, date 8 Nov). Kept on purpose: repo/URL `travel.spd`, `travelspend://` scheme, storage/cache keys, bundle id. Open: Google consent screen app name (manual). | `app.json`, `public/manifest.webmanifest`, `public/index.html`, `app/sign-in.tsx`, `src/i18n/*`, `public/privacy.html`, `public/terms.html`, `README.md` |
| 2026-11-07 | Personal-first positioning: sign-in tagline, onboarding subtitle and hints rewritten (EN + HE) so sharing is optional. New trip form: Trip name first, Your name second; Dates toggle off by default with a hint, date pickers fade in when on (no exit animation: on web it left ghost copies). App name "TravelSpend Couple" unchanged. | `src/i18n/en.ts`, `src/i18n/he.ts`, `app/(app)/onboarding/create.tsx` |
| 2026-11-07 | Privacy page accuracy: deleting an expense only marks it deleted (`deleted_at`); it stays stored with its receipt photo. Page (EN + HE) now says so, and that account deletion by email includes deleted expenses and photos. | `public/privacy.html` |
| 2026-11-07 | Swipe actions everywhere: Home › Recent now uses the same swipe row as the Expenses tab (Edit opens the pre-filled form, Delete confirms, removes at once, totals/balances update, syncs). Logic shared in `useExpenseActions`. | `src/hooks/useExpenseActions.ts`, `src/ui/SwipeableExpenseRow.tsx`, `app/(app)/(tabs)/index.tsx`, `app/(app)/(tabs)/expenses.tsx` |
| 2026-11-07 | Bug: dates switch (New trip + Trip details) broke in Hebrew: React Native Web's `Switch` draws its knob outside the track in RTL. Replaced with an RTL-safe `Toggle` primitive (flex start/end knob, `role=switch` + `aria-checked`). | `src/ui/primitives.tsx`, `app/(app)/onboarding/create.tsx`, `app/(app)/(tabs)/settings.tsx` |
| 2026-11-07 | Default Home order: total, today, recent, categories, 7 days, who paid. Applies to users without a saved order and to "Reset to default order". | `src/lib/homeLayout.ts` (+test) |
| 2026-11-07 | Remove partner: trip creator sees a remove icon next to partners (Settings › Members) → confirm → `remove_trip_member` RPC. Soft remove (`trip_members.removed_at`); `is_trip_member` ignores removed rows, so RLS locks them out everywhere; expenses, splits and open balances kept (Home still shows them). Rejoin with a new code reuses the same member row. Fix: joining now refreshes all cached data (a re-invited partner saw an empty trip). | `supabase/migrations/…0014_remove_trip_member.sql`, `scripts/test-sql.mjs` (+2 checks), `app/(app)/(tabs)/settings.tsx`, `src/api/queries.ts`, `src/hooks/useTripData.ts`, `src/types/db.ts`, i18n |
| 2026-11-07 | Total card: accent-colour border (40%) + soft halo (15%), matching the + button; gradient and inner glow unchanged. | `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Home cards: drag handle (⠿) removed from every card. Hold a card 500 ms to lift it (scale 1.05, deep shadow); moving >8 px first = scroll, so taps/buttons/scrolling are unaffected. Drag mode shows a faint accent grid behind the cards and a glowing accent line (above all cards) at the exact drop spot: upper/lower half of the card under the finger = before/after it. Total card border → `white/10`. | `src/ui/DraggableGrid.tsx`, `src/lib/homeLayout.ts` (+tests), `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Total card restyle: diagonal gradient (default blue = Royal Sapphire `#1E40AF` → `#1D4ED8`), soft white inner glow (10%), 1px translucent white border, deep-blue shadow. Other trip colours get the same treatment in their own hues. White text 5.45:1 at worst (AA); contrast test now includes the glow. | `app/(app)/(tabs)/index.tsx`, `src/palette.ts`, `src/lib/__tests__/theme.test.ts` |
| 2026-11-04 | Home: removed the partner-invite card above the totals; a small person-add icon next to "Arrange" opens Settings, where the code is copied/shared. Shown only on a solo, non-shared trip. | `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Home empty state: replaced "partner will see it right away" text with one large "Tap to add an expense" (+) button that opens New expense. Same partner sentence dropped from the Expenses/Stats empty text. | `app/(app)/(tabs)/index.tsx`, `src/i18n/he.ts`, `src/i18n/en.ts` |

## Open
- `home.invitePartnerBody` string is now unused (kept, harmless).
