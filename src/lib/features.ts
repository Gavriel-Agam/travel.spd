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
  /**
   * "Add to Apple Wallet" on a flight's Smart Booking Card. Off until the Apple
   * Pass Type ID certificate is set as secrets for the Edge Function
   * generate-flight-pass (it answers 501 not_configured until then).
   */
  appleWalletPasses: false,
} as const;

/**
 * iCloud link of the ready-made "SmartTrip" shortcut (built once on an iPhone,
 * shared with "Copy iCloud Link"). Empty: Settings › Automatic import shows only
 * the manual steps. When set, a button creates a key, copies it and opens this.
 */
export const SHORTCUT_INSTALL_URL = '';
