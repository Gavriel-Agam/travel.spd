# Travel.Spd: Project Status

Short running log of what changed and what is open. Product scope and specs live in [PRODUCT_DOCS.md](PRODUCT_DOCS.md).

Last updated: 2026-11-07

## Current state
- Live at https://gavriel-agam.github.io/travel.spd/ (deploys on push to `main`).
- Shipped through Stage 4 (trip colour + photo). Migrations 0001-0014.
- Last deploy: `139a7f4` (long-press reorder, no drag handles), live 2026-11-05 05:47 UTC; both Actions runs green.
- Verified: backend, Supabase DB + RLS, Google OAuth.

## Recent fixes
| Date | Fix | Files |
|---|---|---|
| 2026-11-07 | Remove partner: trip creator sees a remove icon next to partners (Settings › Members) → confirm → `remove_trip_member` RPC. Soft remove (`trip_members.removed_at`); `is_trip_member` ignores removed rows, so RLS locks them out everywhere; expenses, splits and open balances kept (Home still shows them). Rejoin with a new code reuses the same member row. Fix: joining now refreshes all cached data (a re-invited partner saw an empty trip). | `supabase/migrations/…0014_remove_trip_member.sql`, `scripts/test-sql.mjs` (+2 checks), `app/(app)/(tabs)/settings.tsx`, `src/api/queries.ts`, `src/hooks/useTripData.ts`, `src/types/db.ts`, i18n |
| 2026-11-07 | Total card: accent-colour border (40%) + soft halo (15%), matching the + button; gradient and inner glow unchanged. | `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Home cards: drag handle (⠿) removed from every card. Hold a card 500 ms to lift it (scale 1.05, deep shadow); moving >8 px first = scroll, so taps/buttons/scrolling are unaffected. Drag mode shows a faint accent grid behind the cards and a glowing accent line (above all cards) at the exact drop spot: upper/lower half of the card under the finger = before/after it. Total card border → `white/10`. | `src/ui/DraggableGrid.tsx`, `src/lib/homeLayout.ts` (+tests), `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Total card restyle: diagonal gradient (default blue = Royal Sapphire `#1E40AF` → `#1D4ED8`), soft white inner glow (10%), 1px translucent white border, deep-blue shadow. Other trip colours get the same treatment in their own hues. White text 5.45:1 at worst (AA); contrast test now includes the glow. | `app/(app)/(tabs)/index.tsx`, `src/palette.ts`, `src/lib/__tests__/theme.test.ts` |
| 2026-11-04 | Home: removed the partner-invite card above the totals; a small person-add icon next to "Arrange" opens Settings, where the code is copied/shared. Shown only on a solo, non-shared trip. | `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Home empty state: replaced "partner will see it right away" text with one large "Tap to add an expense" (+) button that opens New expense. Same partner sentence dropped from the Expenses/Stats empty text. | `app/(app)/(tabs)/index.tsx`, `src/i18n/he.ts`, `src/i18n/en.ts` |

## Open
- `home.invitePartnerBody` string is now unused (kept, harmless).
