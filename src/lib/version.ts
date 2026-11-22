import Constants from 'expo-constants';

/** The running release, set at build time from git (app.config.js): "1.75". */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

/** The short commit id of this build, when known. */
export const APP_BUILD: string | null = (Constants.expoConfig?.extra as { build?: string | null } | undefined)?.build ?? null;

/** "1.75 (fe94318)" for the bottom of Settings. */
export function versionLabel(): string {
  return APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION;
}
