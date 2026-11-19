/**
 * Feature flags: switch a finished feature off for users without removing its code.
 * Flip a flag to true and deploy to turn the feature back on.
 */
export const FEATURES = {
  /**
   * Face ID / fingerprint sign-in (passkeys, Supabase beta). Off for now by Gabriel's
   * decision (Nov 2026). When turning it on, also restore the passkeys line in
   * public/privacy.html (kept there as an HTML comment) and check that Passkeys is
   * enabled in the Supabase dashboard (Authentication > Passkeys).
   */
  passkeys: false,
} as const;
