// A trip invite as a link (…/join/CODE) that opens the app with the code filled
// in, and a WhatsApp message carrying it. A link opened before signing in is
// kept on this device until sign-in, then the join form opens with the code.
// No react-native import: plain checks for the browser keep this testable.
const onWeb = () => typeof document !== 'undefined' && typeof location !== 'undefined';
function webStorage(): Storage | null {
  try {
    return onWeb() && typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const PUBLIC_APP = 'https://gavriel-agam.github.io/travel.spd';
const PENDING_KEY = 'smarttrip.pendingJoin';
const CODE_RE = /\/join\/([A-Za-z0-9]{4,16})\/?$/;

/** Where the web app lives: this site on the web (local dev too), the public site from the phone app. */
function appBase(): string {
  if (!onWeb()) return PUBLIC_APP;
  const base = location.pathname.startsWith('/travel.spd') ? '/travel.spd' : '';
  return `${location.origin}${base}`;
}

export function inviteLink(code: string): string {
  return `${appBase()}/join/${encodeURIComponent(code.toUpperCase())}`;
}

/** wa.me opens WhatsApp (app or web) with the message ready; the user picks the chat. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** The invite code in a path like /travel.spd/join/AB12CD, if any. */
export function codeFromPath(path: string): string | null {
  const m = CODE_RE.exec(path);
  return m ? m[1].toUpperCase() : null;
}

/** On the web: remember a /join/CODE link the app was opened with (before sign-in moves away from it). */
export function rememberJoinLink(): void {
  const ls = webStorage();
  if (!ls) return;
  const code = codeFromPath(location.pathname);
  if (!code) return;
  try {
    ls.setItem(PENDING_KEY, code);
  } catch {
    // storage blocked: the link still works when already signed in
  }
}

/** The remembered code, removed once read. */
export function takePendingJoin(): string | null {
  const ls = webStorage();
  if (!ls) return null;
  try {
    const code = ls.getItem(PENDING_KEY);
    if (code) ls.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}
