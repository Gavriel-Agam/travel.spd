/**
 * Guards against reading data as "nobody" while someone is signed in.
 *
 * When the login token can't be refreshed (the app comes back from the
 * background on a weak signal), Supabase sends requests with the public key
 * instead of the user's token. The server then answers as if no one were
 * signed in: the trip list comes back empty (not an error), and the app would
 * show the welcome screen as if the trips were gone. Such requests are held
 * back and treated like a lost connection instead (saved data stays on screen,
 * changes wait in the queue), and everything reloads once the token is back.
 */

let userExpected = false;
let missed = false;

/** Someone is signed in on this device (set by the auth provider). */
export function setUserExpected(on: boolean) {
  userExpected = on;
  if (!on) missed = false;
}

export function isUserExpected() {
  return userExpected;
}

/** True once if a request was held back since the last call (then reload everything). */
export function takeMissedUser() {
  const was = missed;
  missed = false;
  return was;
}

export function noteMissedUser() {
  missed = true;
}

/** A data request (tables, functions, files) that carries no user token, only the public key. */
export function sentWithoutUser(href: string, headers: HeadersInit | undefined, publicKey: string) {
  if (!/\/(rest|functions|storage)\/v1\//.test(href)) return false;
  let auth: string | null = null;
  try {
    auth = new Headers(headers).get('Authorization');
  } catch {
    return false;
  }
  return !auth || auth === `Bearer ${publicKey}`;
}
