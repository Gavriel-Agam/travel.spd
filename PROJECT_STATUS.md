# Travel.Spd: Project Status

Short running log of what changed and what is open. Product scope and specs live in [PRODUCT_DOCS.md](PRODUCT_DOCS.md).

Last updated: 2026-11-04

## Current state
- Live at https://gavriel-agam.github.io/travel.spd/ (deploys on push to `main`).
- Shipped through Stage 4 (trip colour + photo). Migrations 0001-0013.

## Recent fixes
| Date | Fix | Files |
|---|---|---|
| 2026-11-04 | Home: removed the partner-invite card above the totals; a small person-add icon next to "Arrange" opens Settings, where the code is copied/shared. Shown only on a solo, non-shared trip. | `app/(app)/(tabs)/index.tsx` |
| 2026-11-04 | Home empty state: replaced "partner will see it right away" text with one large "Tap to add an expense" (+) button that opens New expense. Same partner sentence dropped from the Expenses/Stats empty text. | `app/(app)/(tabs)/index.tsx`, `src/i18n/he.ts`, `src/i18n/en.ts` |

## Open
- `home.invitePartnerBody` string is now unused (kept, harmless).
